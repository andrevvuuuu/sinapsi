import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { z } from 'zod'
import type { Engine, EngineChoice, Task } from '../../shared/settings-schema'
import { appendJsonl } from '../store/jsonl'
import { buildArgs, parseOutput } from './engines'
import { AiSchemaError, AiTimeoutError, AuthRequiredError, EngineMissingError } from './errors'
import { extractJson } from './json'

export type SpawnFn = (
  cmd: string,
  args: string[],
  opts: { timeoutMs: number }
) => Promise<{ stdout: string; stderr: string; code: number | null; timedOut: boolean }>

export type EngineStatus = 'idle' | 'busy' | 'auth' | 'missing' | 'error'

export interface AskRequest<T> {
  task: Task
  prompt: string
  schema?: z.ZodType<T>
  schemaName?: string
  cache?: boolean
  timeoutMs?: number
}
export interface AskResult<T> {
  data: T | string
  fromCache: boolean
  engine: Engine
}
export interface Bridge {
  ask<T>(req: AskRequest<T>): Promise<AskResult<T>>
  status(): Record<Engine, EngineStatus>
  onStatus(cb: (s: Record<Engine, EngineStatus>) => void): () => void
}

const AUTH_RE = /authentication page|log ?in|login required|not authenticated/i
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

  async function callOnce(task: Task, engine: Engine, model: string | undefined, prompt: string, timeoutMs: number): Promise<string> {
    const { cmd, args } = buildArgs(engine, prompt, model)
    const t0 = now()
    setState(engine, 'busy')
    let res
    try {
      res = await deps.spawn(cmd, args, { timeoutMs })
    } catch (e) {
      const missing = (e as NodeJS.ErrnoException).code === 'ENOENT'
      setState(engine, missing ? 'missing' : 'error')
      throw missing ? new EngineMissingError(engine) : e
    }
    if (AUTH_RE.test(res.stdout) || AUTH_RE.test(res.stderr)) {
      setState(engine, 'auth')
      throw new AuthRequiredError(engine)
    }
    if (res.timedOut) {
      setState(engine, 'error')
      await appendJsonl(deps.usageFile, { ts: t0, task, engine, model, inputTokens: 0, outputTokens: 0, ms: now() - t0, ok: false })
      throw new AiTimeoutError(engine, timeoutMs)
    }
    try {
      const out = parseOutput(engine, res.stdout)
      await appendJsonl(deps.usageFile, { ts: t0, task, engine, model, inputTokens: out.inputTokens, outputTokens: out.outputTokens, ms: now() - t0, ok: true })
      setState(engine, 'idle')
      return out.text
    } catch (e) {
      setState(engine, 'error')
      throw e
    }
  }

  return {
    status: () => ({ ...state }),
    onStatus(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    async ask<T>(req: AskRequest<T>): Promise<AskResult<T>> {
      const choice = (await deps.engines())[req.task]
      const { engine, model } = choice
      const key = createHash('sha256').update([engine, model ?? '', req.prompt, req.schemaName ?? (req.schema ? 'schema' : '')].join('|')).digest('hex')
      const cacheFile = join(deps.cacheDir, `${key}.json`)
      if (req.cache) {
        try {
          return { data: JSON.parse(await readFile(cacheFile, 'utf8')), fromCache: true, engine }
        } catch {
          /* not cached yet */
        }
      }
      const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT
      const data = await enqueue(engine, async () => {
        const text = await callOnce(req.task, engine, model, req.prompt, timeoutMs)
        if (!req.schema) return text
        const first = validate(req.schema, text)
        if (first.ok) return first.value
        const retryPrompt = `${req.prompt}\n\nLa risposta precedente non era valida: ${first.error}. Rispondi solo con JSON valido.`
        const second = validate(req.schema, await callOnce(req.task, engine, model, retryPrompt, timeoutMs))
        if (second.ok) return second.value
        throw new AiSchemaError(second.error)
      })
      if (req.cache) {
        await mkdir(deps.cacheDir, { recursive: true })
        await writeFile(cacheFile, JSON.stringify(data), 'utf8')
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
