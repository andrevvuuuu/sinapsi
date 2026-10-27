import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { Engine, EngineChoice, Task } from '../../shared/settings-schema'
import { appendJsonl } from '../store/jsonl'
import { buildArgs, parseOutput, type CallOptions } from './engines'
import { AiOutputError, AiSchemaError, AiTimeoutError, AuthRequiredError, EngineMissingError } from './errors'
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
  cache?: boolean
  timeoutMs?: number
  cwd?: string
  noTools?: boolean
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
  const queues: Record<Engine, Promise<unknown>> = { agy: Promise.resolve(), claude: Promise.resolve() }
  const listeners = new Set<(s: Record<Engine, EngineStatus>) => void>()
  const setState = (e: Engine, s: EngineStatus): void => {
    state[e] = s
    listeners.forEach((l) => l({ ...state }))
  }

  // One call at a time per engine: each call waits for the previous one on the same queue.
  function enqueue<R>(engine: Engine, job: () => Promise<R>): Promise<R> {
    const run = queues[engine].then(job, job)
    queues[engine] = run.catch(() => undefined)
    return run
  }

  async function callOnce(task: Task, engine: Engine, prompt: string, timeoutMs: number, opts: CallOptions & { cwd?: string } = {}): Promise<{ text: string; conversationId?: string }> {
    const model = opts.model
    const { cmd, args } = buildArgs(engine, prompt, { ...opts, timeoutMs })
    const t0 = now()
    setState(engine, 'busy')
    let res
    try {
      res = await deps.spawn(cmd, args, { timeoutMs, cwd: opts.cwd })
    } catch (e) {
      const missing = (e as NodeJS.ErrnoException).code === 'ENOENT'
      setState(engine, missing ? 'missing' : 'error')
      throw missing ? new EngineMissingError(engine) : e
    }
    if (!res.timedOut && res.code === 0) {
      try {
        const out = parseOutput(engine, res.stdout)
        await logUsage({ ts: t0, task, engine, model, inputTokens: out.inputTokens, outputTokens: out.outputTokens, ms: now() - t0, ok: true })
        setState(engine, 'idle')
        return { text: out.text, conversationId: out.conversationId }
      } catch {
        /* not a valid reply: fall through to the failure checks */
      }
    }
    if (AUTH_RE.test(res.stdout) || AUTH_RE.test(res.stderr)) {
      setState(engine, 'auth')
      throw new AuthRequiredError(engine)
    }
    setState(engine, 'error')
    await logUsage({ ts: t0, task, engine, model, inputTokens: 0, outputTokens: 0, ms: now() - t0, ok: false })
    if (res.timedOut) throw new AiTimeoutError(engine, timeoutMs)
    throw new AiOutputError(`${engine}: risposta non valida (codice ${res.code})`)
  }

  // Bookkeeping must never cost the user an answer they already paid for.
  async function logUsage(rec: Record<string, unknown>): Promise<void> {
    try {
      await appendJsonl(deps.usageFile, rec)
    } catch (e) {
      console.warn('[ai] registro consumi non scritto', e)
    }
  }

  async function converse<T>(req: ConverseRequest<T>): Promise<{ data: T; conversationId: string; engine: Engine }> {
    const { engine, model } = (await deps.engines())[req.task]
    const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT
    return enqueue(engine, async () => {
      const base = { model, systemPrompt: req.systemPrompt, jsonSchema: req.jsonSchema, cwd: req.cwd }
      const first = await callOnce(req.task, engine, req.prompt, timeoutMs, { ...base, conversation: { id: req.conversationId, resume: req.resume } })
      const convId = first.conversationId ?? req.conversationId
      const v1 = validate(req.schema, first.text)
      if (v1.ok) return { data: v1.value, conversationId: convId, engine }
      const retry = `La risposta precedente non era valida: ${v1.error}. Rispondi di nuovo, solo con JSON valido secondo lo schema.`
      const second = await callOnce(req.task, engine, retry, timeoutMs, { ...base, conversation: { id: convId, resume: true } })
      const v2 = validate(req.schema, second.text)
      if (v2.ok) return { data: v2.value, conversationId: second.conversationId ?? convId, engine }
      throw new AiSchemaError(v2.error)
    })
  }

  return {
    converse,
    status: () => ({ ...state }),
    onStatus(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    async ask<T>(req: AskRequest<T>): Promise<AskResult<T>> {
      const choice = (await deps.engines())[req.task]
      const { engine, model } = choice
      const key = createHash('sha256').update([engine, model ?? '', req.prompt, req.schemaName ?? schemaId(req.schema)].join('|')).digest('hex')
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
      const data = await enqueue(engine, async () => {
        const text = (await callOnce(req.task, engine, req.prompt, timeoutMs, { model, cwd: req.cwd, noTools: req.noTools })).text
        if (!req.schema) return text
        const first = validate(req.schema, text)
        if (first.ok) return first.value
        const retryPrompt = `${req.prompt}\n\nLa risposta precedente non era valida: ${first.error}. Rispondi solo con JSON valido.`
        const second = validate(req.schema, (await callOnce(req.task, engine, retryPrompt, timeoutMs, { model, cwd: req.cwd, noTools: req.noTools })).text)
        if (second.ok) return second.value
        throw new AiSchemaError(second.error)
      })
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
