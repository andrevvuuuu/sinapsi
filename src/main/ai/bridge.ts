import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { Engine, EngineChoice, Task } from '../../shared/settings-schema'
import { appendJsonl } from '../store/jsonl'
import { buildArgs, parseOutput, type CallOptions } from './engines'
import { AiAbortError, AiOutputError, AiSchemaError, AiTimeoutError, AuthRequiredError, EngineMissingError } from './errors'
import { extractJson } from './json'

export type SpawnFn = (
  cmd: string,
  args: string[],
  opts: { timeoutMs: number; cwd?: string; onOutput?: (chunk: string) => void; signal?: AbortSignal }
) => Promise<{ stdout: string; stderr: string; code: number | null; timedOut: boolean }>

export type EngineStatus = 'idle' | 'busy' | 'auth' | 'missing' | 'error'

export interface AskRequest<T> {
  task: Task
  prompt: string
  schema?: z.ZodType<T>
  schemaName?: string
  /**
   * Accepted when the retry still fails `schema`: a looser schema for checks that only ask for a cleaner answer
   * (the note writer's math formatting), so they can never cost a reply that is otherwise valid. The retry is
   * preferred; if it fails even this, a first answer that passed it is kept.
   */
  fallback?: z.ZodType<T>
  cache?: boolean
  timeoutMs?: number
  cwd?: string
  noTools?: boolean
  readOnly?: boolean
  /** Pins the engine for this call, whatever the settings say (the photo needs Claude's Read tool). */
  engine?: EngineChoice
  priority?: 'interactive' | 'background'
  onPartial?: (text: string) => void
  partialField?: string
  signal?: AbortSignal
}
export interface AskResult<T> {
  data: T | string
  fromCache: boolean
  engine: Engine
}
export interface ConverseRequest<T> {
  task: Task
  conversationId: string
  resume: boolean
  systemPrompt?: string
  prompt: string
  schema: z.ZodType<T>
  jsonSchema: object
  cwd?: string
  timeoutMs?: number
  priority?: 'interactive' | 'background'
  onPartial?: (text: string) => void
  partialField?: string
  signal?: AbortSignal
}
export interface Bridge {
  ask<T>(req: AskRequest<T>): Promise<AskResult<T>>
  converse<T>(req: ConverseRequest<T>): Promise<{ data: T; conversationId: string; engine: Engine }>
  status(): Record<Engine, EngineStatus>
  onStatus(cb: (s: Record<Engine, EngineStatus>) => void): () => void
}

// Only CLI-specific phrases, checked only when the call did not succeed: answers may say "log in base 2".
const AUTH_RE = /Opening authentication page|Please run \/login|Invalid API key|not logged in|login required|authentication required/i
const DEFAULT_TIMEOUT = 180_000

export function createBridge(deps: {
  spawn: SpawnFn
  cacheDir: string
  usageFile: string
  engines: () => Promise<Record<Task, EngineChoice>>
  now?: () => number
}): Bridge {
  const now = deps.now ?? Date.now
  const state: Record<Engine, EngineStatus> = { agy: 'idle', claude: 'idle' }
  const activeCalls: Record<Engine, number> = { agy: 0, claude: 0 }
  type Priority = 'interactive' | 'background'
  type Job = {
    priority: Priority
    run: () => Promise<unknown>
    resolve: (v: unknown) => void
    reject: (e: unknown) => void
    signal?: AbortSignal
    abort?: () => void
  }
  const queues: Record<Engine, Record<Priority, Job[]>> = {
    agy: { interactive: [], background: [] },
    claude: { interactive: [], background: [] }
  }
  const running: Record<Engine, Record<Priority, boolean>> = {
    agy: { interactive: false, background: false },
    claude: { interactive: false, background: false }
  }
  const listeners = new Set<(s: Record<Engine, EngineStatus>) => void>()
  const setState = (e: Engine, s: EngineStatus): void => {
    state[e] = s
    listeners.forEach((l) => l({ ...state }))
  }

  function pumpLane(engine: Engine, priority: Priority): void {
    if (running[engine][priority]) return
    const q = queues[engine][priority]
    const job = q.shift()
    if (!job) return
    job.signal?.removeEventListener('abort', job.abort!)
    if (job.signal?.aborted) {
      job.reject(new AiAbortError())
      pumpLane(engine, priority)
      return
    }
    running[engine][priority] = true
    void job
      .run()
      .then(job.resolve, job.reject)
      .finally(() => {
        running[engine][priority] = false
        pumpLane(engine, priority)
      })
  }

  function pump(engine: Engine, priority?: Priority): void {
    if (priority) {
      pumpLane(engine, priority)
    } else {
      pumpLane(engine, 'interactive')
      pumpLane(engine, 'background')
    }
  }

  function enqueue<R>(
    engine: Engine,
    priority: Priority,
    signal: AbortSignal | undefined,
    job: () => Promise<R>
  ): Promise<R> {
    if (signal?.aborted) return Promise.reject(new AiAbortError())
    return new Promise<R>((resolve, reject) => {
      const queued: Job = {
        priority,
        run: job,
        resolve: resolve as (v: unknown) => void,
        reject,
        signal
      }
      queued.abort = () => {
        const q = queues[engine][priority]
        const i = q.indexOf(queued)
        if (i >= 0) {
          q.splice(i, 1)
          reject(new AiAbortError())
        }
      }
      signal?.addEventListener('abort', queued.abort, { once: true })
      queues[engine][priority].push(queued)
      pump(engine, priority)
    })
  }

  async function callOnce(
    task: Task,
    engine: Engine,
    prompt: string,
    timeoutMs: number,
    opts: CallOptions & {
      cwd?: string
      signal?: AbortSignal
      onPartial?: (text: string) => void
      partialField?: string
      retry?: boolean
    } = {}
  ): Promise<{ text: string; conversationId?: string }> {
    const model = opts.model
    const streaming = engine === 'claude' && !!opts.onPartial && !opts.retry
    const { cmd, args } = buildArgs(engine, prompt, { ...opts, stream: streaming, timeoutMs })
    const t0 = now()

    let active = true
    activeCalls[engine]++
    setState(engine, 'busy')

    const finishActive = (errStatus?: EngineStatus): void => {
      if (!active) return
      active = false
      activeCalls[engine]--
      if (errStatus) {
        setState(engine, errStatus)
      } else if (activeCalls[engine] === 0) {
        setState(engine, 'idle')
      }
    }

    let res
    try {
      try {
        let streamBuffer = ''
        let outputJson = ''
        let fieldValue = ''
        res = await deps.spawn(cmd, args, {
          timeoutMs,
          cwd: opts.cwd,
          signal: opts.signal,
          onOutput: streaming
            ? (chunk) => {
                streamBuffer += chunk
                const lines = streamBuffer.split('\n')
                streamBuffer = lines.pop() ?? ''
                for (const line of lines) {
                  try {
                    const event = JSON.parse(line)
                    if (event.type === 'stream_event') {
                      const delta = event.event?.delta
                      if (delta?.type === 'input_json_delta')
                        outputJson += String(delta.partial_json ?? '')
                      else if (delta?.type === 'text_delta')
                        outputJson += String(delta.text ?? '')
                      const next = extractPartialString(outputJson, opts.partialField ?? 'lesson')
                      if (next !== null && next.length > fieldValue.length) {
                        fieldValue = next
                        opts.onPartial?.(next)
                      }
                    }
                  } catch {
                    /* ignore incomplete or auxiliary event lines */
                  }
                }
              }
            : undefined
        })
      } catch (e) {
        if (opts.signal?.aborted) {
          finishActive()
          await logUsage({
            ts: t0,
            task,
            engine,
            model,
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
            costUsd: 0,
            ms: now() - t0,
            ok: false,
            retry: !!opts.retry
          })
          throw new AiAbortError()
        }
        const missing = (e as NodeJS.ErrnoException).code === 'ENOENT'
        finishActive(missing ? 'missing' : 'error')
        throw missing ? new EngineMissingError(engine) : e
      }
      if (opts.signal?.aborted || (res.code === null && opts.signal?.aborted)) {
        finishActive()
        await logUsage({
          ts: t0,
          task,
          engine,
          model,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          costUsd: 0,
          ms: now() - t0,
          ok: false,
          retry: !!opts.retry
        })
        throw new AiAbortError()
      }
      if (!res.timedOut && res.code === 0) {
        try {
          const out = parseOutput(engine, streaming ? lastResultLine(res.stdout) : res.stdout)
          await logUsage({
            ts: t0,
            task,
            engine,
            model,
            inputTokens: out.inputTokens,
            outputTokens: out.outputTokens,
            cacheReadTokens: out.cacheReadTokens,
            cacheCreationTokens: out.cacheCreationTokens,
            costUsd: out.costUsd,
            ms: now() - t0,
            ok: true,
            retry: !!opts.retry
          })
          finishActive()
          return { text: out.text, conversationId: out.conversationId }
        } catch {
          /* not a valid reply: fall through to the failure checks */
        }
      }
      if (AUTH_RE.test(res.stdout) || AUTH_RE.test(res.stderr)) {
        finishActive('auth')
        throw new AuthRequiredError(engine)
      }
      const agyPrintTimeout =
        engine === 'agy' &&
        (res.code === 3 ||
          /print timeout/i.test(res.stdout) ||
          /print timeout/i.test(res.stderr))
      if (res.timedOut || agyPrintTimeout) {
        finishActive('error')
        await logUsage({
          ts: t0,
          task,
          engine,
          model,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          costUsd: 0,
          ms: now() - t0,
          ok: false,
          retry: !!opts.retry
        })
        throw new AiTimeoutError(engine, timeoutMs)
      }
      finishActive('error')
      await logUsage({
        ts: t0,
        task,
        engine,
        model,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        costUsd: 0,
        ms: now() - t0,
        ok: false,
        retry: !!opts.retry
      })
      const stderrTail = res.stderr.trim().replace(/\s+/g, ' ').slice(-200).trim()
      const detail = stderrTail ? ` — ${stderrTail}` : ''
      throw new AiOutputError(`${engine}: risposta non valida (codice ${res.code})${detail}`)
    } finally {
      if (active) finishActive('error')
    }
  }

  // Bookkeeping must never cost the user an answer they already paid for.
  async function logUsage(rec: Record<string, unknown>): Promise<void> {
    try {
      await appendJsonl(deps.usageFile, rec)
    } catch (e) {
      console.warn('[ai] registro consumi non scritto', e)
    }
  }

  async function converse<T>(
    req: ConverseRequest<T>
  ): Promise<{ data: T; conversationId: string; engine: Engine }> {
    const { engine, model } = (await deps.engines())[req.task]
    const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT
    return enqueue(
      engine,
      req.priority ?? (req.task === 'teach' || req.task === 'grade' ? 'interactive' : 'background'),
      req.signal,
      async () => {
        const base = {
          model,
          systemPrompt: req.systemPrompt,
          jsonSchema: req.jsonSchema,
          cwd: req.cwd
        }
        const first = await callOnce(req.task, engine, req.prompt, timeoutMs, {
          ...base,
          signal: req.signal,
          onPartial: req.onPartial,
          partialField: req.partialField,
          conversation: { id: req.conversationId, resume: req.resume }
        })
        const convId = first.conversationId ?? req.conversationId
        const v1 = validate(req.schema, first.text)
        if (v1.ok) return { data: v1.value, conversationId: convId, engine }
        const retry = `La risposta precedente non era valida: ${v1.error}. Rispondi di nuovo, solo con JSON valido secondo lo schema.`
        const second = await callOnce(req.task, engine, retry, timeoutMs, {
          ...base,
          signal: req.signal,
          conversation: { id: convId, resume: true },
          retry: true
        })
        const v2 = validate(req.schema, second.text)
        if (v2.ok) return { data: v2.value, conversationId: second.conversationId ?? convId, engine }
        throw new AiSchemaError(v2.error)
      }
    )
  }

  return {
    converse,
    status: () => ({ ...state }),
    onStatus(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    async ask<T>(req: AskRequest<T>): Promise<AskResult<T>> {
      const choice = req.engine ?? (await deps.engines())[req.task]
      const { engine, model } = choice
      const key = createHash('sha256')
        .update([engine, model ?? '', req.prompt, req.schemaName ?? schemaId(req.schema)].join('|'))
        .digest('hex')
      const cacheFile = join(deps.cacheDir, `${key}.json`)
      if (req.cache) {
        try {
          const cached = JSON.parse(await readFile(cacheFile, 'utf8'))
          if (!req.schema) return { data: cached, fromCache: true, engine }
          const ok = req.schema.safeParse(cached)
          if (ok.success) return { data: ok.data, fromCache: true, engine }
        } catch {
          /* not cached yet */
        }
      }
      const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT
      const jsonSchema = engine === 'claude' ? extractClaudeJsonSchema(req.schema) : undefined
      const data = await enqueue(
        engine,
        req.priority ?? (req.task === 'teach' || req.task === 'grade' ? 'interactive' : 'background'),
        req.signal,
        async () => {
          const firstCall = await callOnce(req.task, engine, req.prompt, timeoutMs, {
            model,
            jsonSchema,
            cwd: req.cwd,
            noTools: req.noTools,
            readOnly: req.readOnly,
            signal: req.signal,
            onPartial: req.onPartial,
            partialField: req.partialField
          })
          const text = firstCall.text
          if (!req.schema) return text
          const first = validate(req.schema, text)
          if (first.ok) return first.value
          // Kept aside: if the retry comes back worse, a first answer that only failed the optional checks still counts.
          const firstLoose = req.fallback ? validate(req.fallback, text) : null

          let secondText: string | undefined
          if (firstCall.conversationId) {
            try {
              const shortPrompt = `La risposta precedente non era valida: ${first.error}. Rispondi di nuovo, solo con JSON valido secondo il formato richiesto.`
              const secondCall = await callOnce(req.task, engine, shortPrompt, timeoutMs, {
                model,
                jsonSchema,
                cwd: req.cwd,
                noTools: req.noTools,
                readOnly: req.readOnly,
                signal: req.signal,
                retry: true,
                conversation: { id: firstCall.conversationId, resume: true }
              })
              secondText = secondCall.text
            } catch (err) {
              if (err instanceof AiAbortError || err instanceof AuthRequiredError) {
                throw err
              }
              // Ripiega sul retry con prompt completo
            }
          }

          if (secondText === undefined) {
            const retryPrompt = `${req.prompt}\n\nLa risposta precedente non era valida: ${first.error}. Rispondi solo con JSON valido.`
            const secondCall = await callOnce(req.task, engine, retryPrompt, timeoutMs, {
              model,
              jsonSchema,
              cwd: req.cwd,
              noTools: req.noTools,
              readOnly: req.readOnly,
              signal: req.signal,
              retry: true
            })
            secondText = secondCall.text
          }

          const second = validate(req.schema, secondText)
          if (second.ok) return second.value
          const loose = req.fallback ? validate(req.fallback, secondText) : null
          const kept = loose?.ok ? loose : firstLoose?.ok ? firstLoose : null
          if (kept) {
            console.warn(
              `[ai] ${req.task}: ${loose?.ok ? 'seconda' : 'prima'} risposta accettata senza i controlli facoltativi (${second.error})`
            )
            return kept.value
          }
          throw new AiSchemaError(second.error)
        }
      )
      if (req.cache) {
        try {
          await mkdir(deps.cacheDir, { recursive: true })
          await writeFile(cacheFile, JSON.stringify(data), 'utf8')
        } catch (e) {
          console.warn('[ai] cache non scritta', e)
        }
      }
      return { data: data as T | string, fromCache: false, engine }
    }
  }
}

function extractClaudeJsonSchema(schema?: z.ZodType<unknown>): object | undefined {
  if (!schema) return undefined
  try {
    const s = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>
    if (!s || typeof s !== 'object' || Array.isArray(s)) return undefined
    if (
      s.type === 'object' &&
      s.properties &&
      typeof s.properties === 'object' &&
      Object.keys(s.properties).length > 0
    ) {
      return s
    }
    if (s.type === 'array' && s.items !== undefined && s.items !== null) {
      return s
    }
    return undefined
  } catch {
    return undefined
  }
}

function lastResultLine(stdout: string): string {
  const lines = stdout.split(/\r?\n/).filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    try { if (JSON.parse(lines[i]).type === 'result') return lines[i] } catch { /* skip malformed event */ }
  }
  return stdout
}

/** Reads one JSON string value as it is being generated, including a value without its closing quote. */
function extractPartialString(source: string, field: string): string | null {
  const keyIndex = source.indexOf(JSON.stringify(field))
  if (keyIndex < 0) return null
  let i = keyIndex + JSON.stringify(field).length
  while (/\s/.test(source[i] ?? '')) i++
  if (source[i++] !== ':') return null
  while (/\s/.test(source[i] ?? '')) i++
  if (source[i] !== '"') return null
  i++
  let value = ''
  while (i < source.length) {
    const c = source[i++]
    if (c === '"') return value
    if (c !== '\\') { value += c; continue }
    if (i >= source.length) break
    const e = source[i++]
    const simple: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }
    if (e === 'u') {
      const hex = source.slice(i, i + 4)
      if (hex.length < 4 || !/^[0-9a-fA-F]{4}$/.test(hex)) break
      value += String.fromCharCode(parseInt(hex, 16)); i += 4
    } else if (e in simple) value += simple[e]
    else break
  }
  return value
}

function validate<T>(schema: z.ZodType<T>, text: string): { ok: true; value: T } | { ok: false; error: string } {
  let json: unknown
  try {
    json = extractJson(text)
  } catch {
    return { ok: false, error: 'non contiene JSON' }
  }
  const r = schema.safeParse(json)
  return r.success ? { ok: true, value: r.data } : { ok: false, error: r.error.message.slice(0, 300) }
}

function schemaId(schema?: z.ZodType<unknown>): string {
  if (!schema) return ''
  try {
    return JSON.stringify(z.toJSONSchema(schema))
  } catch {
    return 'schema'
  }
}
