import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { Task } from '../../shared/settings-schema'
import { appendJsonl } from '../store/jsonl'
import { createConversationStore, type ConversationStore } from './conversation-store'
import { AiSchemaError, AuthRequiredError } from './errors'
import { extractJson } from './json'
import { chatCompletion, type OpenRouterMessage, type OpenRouterContent } from './openrouter'

export type OpenRouterStatus = 'idle' | 'busy' | 'no-key' | 'error'

export interface AskRequest<T> {
  task: Task
  prompt: string
  schema?: z.ZodType<T>
  schemaName?: string
  fallback?: z.ZodType<T>
  cache?: boolean
  timeoutMs?: number
  cwd?: string
  noTools?: boolean
  readOnly?: boolean
  model?: string
  images?: string[]
}

export interface AskResult<T> {
  data: T | string
  fromCache: boolean
  model: string
  /** Kept for backward compatibility with callers storing note metadata */
  engine?: string
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
  model?: string
}

export interface Bridge {
  ask<T>(req: AskRequest<T>): Promise<AskResult<T>>
  converse<T>(
    req: ConverseRequest<T>
  ): Promise<{ data: T; conversationId: string; model: string; engine?: string }>
  status(): OpenRouterStatus
  onStatus(cb: (s: OpenRouterStatus) => void): () => void
}

const DEFAULT_TIMEOUT = 180_000

export function createBridge(deps: {
  cacheDir: string
  usageFile: string
  conversationsDir?: string
  models: () => Promise<Record<Task, string>>
  apiKey: () => Promise<string | null>
  now?: () => number
}): Bridge {
  const now = deps.now ?? Date.now
  let currentStatus: OpenRouterStatus = 'idle'
  const listeners = new Set<(s: OpenRouterStatus) => void>()
  const convStore: ConversationStore = createConversationStore(
    deps.conversationsDir ?? join(deps.cacheDir, 'conversations')
  )

  const setStatus = (s: OpenRouterStatus): void => {
    currentStatus = s
    listeners.forEach((l) => l(currentStatus))
  }

  let queue: Promise<unknown> = Promise.resolve()
  function enqueue<R>(job: () => Promise<R>): Promise<R> {
    const run = queue.then(job, job)
    queue = run.catch(() => undefined)
    return run
  }

  async function logUsage(rec: Record<string, unknown>): Promise<void> {
    try {
      await appendJsonl(deps.usageFile, rec)
    } catch (e) {
      console.warn('[ai] registro consumi non scritto', e)
    }
  }

  async function resolveModel(task: Task, override?: string): Promise<string> {
    if (override) return override
    const mapping = await deps.models()
    return mapping[task]
  }

  async function converse<T>(
    req: ConverseRequest<T>
  ): Promise<{ data: T; conversationId: string; model: string; engine?: string }> {
    const apiKey = await deps.apiKey()
    if (!apiKey) {
      setStatus('no-key')
    }
    const model = await resolveModel(req.task, req.model)
    const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT
    const t0 = now()

    return enqueue(async () => {
      setStatus('busy')
      let history: OpenRouterMessage[] = []
      if (req.resume) {
        history = await convStore.load(req.conversationId)
      }

      if (history.length === 0 && req.systemPrompt) {
        history.push({ role: 'system', content: req.systemPrompt })
      } else if (req.systemPrompt && history[0]?.role === 'system') {
        history[0] = { role: 'system', content: req.systemPrompt }
      }

      history.push({ role: 'user', content: req.prompt })

      try {
        const key = apiKey ?? (await deps.apiKey()) ?? ''
        const first = await chatCompletion({
          model,
          messages: [...history],
          jsonSchema: req.jsonSchema,
          timeoutMs,
          apiKey: key
        })

        await logUsage({
          ts: t0,
          task: req.task,
          model,
          inputTokens: first.inputTokens,
          outputTokens: first.outputTokens,
          ms: now() - t0,
          ok: true
        })

        const v1 = validate(req.schema, first.text)
        if (v1.ok) {
          history.push({ role: 'assistant', content: first.text })
          await convStore.save(req.conversationId, history)
          setStatus('idle')
          return { data: v1.value, conversationId: req.conversationId, model, engine: model }
        }

        // Schema validation failed: single retry
        const retryPrompt = `La risposta precedente non era valida: ${v1.error}. Rispondi di nuovo, solo con JSON valido secondo lo schema.`
        const retryMessages: OpenRouterMessage[] = [
          ...history,
          { role: 'assistant', content: first.text },
          { role: 'user', content: retryPrompt }
        ]

        const tRetry = now()
        const second = await chatCompletion({
          model,
          messages: retryMessages,
          jsonSchema: req.jsonSchema,
          timeoutMs,
          apiKey: key
        })

        await logUsage({
          ts: tRetry,
          task: req.task,
          model,
          inputTokens: second.inputTokens,
          outputTokens: second.outputTokens,
          ms: now() - tRetry,
          ok: true
        })

        const v2 = validate(req.schema, second.text)
        if (v2.ok) {
          history.push({ role: 'assistant', content: second.text })
          await convStore.save(req.conversationId, history)
          setStatus('idle')
          return { data: v2.value, conversationId: req.conversationId, model, engine: model }
        }

        setStatus('error')
        throw new AiSchemaError(v2.error)
      } catch (e) {
        setStatus('error')
        await logUsage({
          ts: t0,
          task: req.task,
          model,
          inputTokens: 0,
          outputTokens: 0,
          ms: now() - t0,
          ok: false
        })
        throw e
      }
    })
  }

  async function ask<T>(req: AskRequest<T>): Promise<AskResult<T>> {
    const apiKey = await deps.apiKey()
    if (!apiKey) {
      setStatus('no-key')
      throw new AuthRequiredError('OpenRouter')
    }
    const model = await resolveModel(req.task, req.model)
    const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT
    const t0 = now()

    const schemaFingerprint = req.schemaName ?? schemaId(req.schema)
    const cacheKey = createHash('sha256')
      .update([model, req.prompt, schemaFingerprint].join('|'))
      .digest('hex')
    const cacheFile = join(deps.cacheDir, `${cacheKey}.json`)

    if (req.cache) {
      try {
        const cached = JSON.parse(await readFile(cacheFile, 'utf8'))
        if (!req.schema) return { data: cached, fromCache: true, model, engine: model }
        const ok = req.schema.safeParse(cached)
        if (ok.success) return { data: ok.data, fromCache: true, model, engine: model }
      } catch {
        // cache miss
      }
    }

    const data = await enqueue(async () => {
      setStatus('busy')
      try {
        const key = apiKey ?? (await deps.apiKey()) ?? ''
        let userContent: OpenRouterContent = req.prompt
        if (req.images && req.images.length > 0) {
          userContent = [
            { type: 'text', text: req.prompt },
            ...req.images.map((img) => ({
              type: 'image_url' as const,
              image_url: { url: img }
            }))
          ]
        }

        const messages: OpenRouterMessage[] = [{ role: 'user', content: userContent }]
        const jsonSchema = req.schema ? schemaJson(req.schema) : undefined

        const first = await chatCompletion({
          model,
          messages,
          jsonSchema,
          timeoutMs,
          apiKey: key
        })

        await logUsage({
          ts: t0,
          task: req.task,
          model,
          inputTokens: first.inputTokens,
          outputTokens: first.outputTokens,
          ms: now() - t0,
          ok: true
        })

        if (!req.schema) {
          setStatus('idle')
          return first.text
        }

        const firstResult = validate(req.schema, first.text)
        if (firstResult.ok) {
          setStatus('idle')
          return firstResult.value
        }

        const firstLoose = req.fallback ? validate(req.fallback, first.text) : null
        const retryPrompt = `${req.prompt}\n\nLa risposta precedente non era valida: ${firstResult.error}. Rispondi solo con JSON valido.`
        const tRetry = now()

        const secondMessages: OpenRouterMessage[] = [
          { role: 'user', content: userContent },
          { role: 'assistant', content: first.text },
          { role: 'user', content: retryPrompt }
        ]

        const second = await chatCompletion({
          model,
          messages: secondMessages,
          jsonSchema,
          timeoutMs,
          apiKey: key
        })

        await logUsage({
          ts: tRetry,
          task: req.task,
          model,
          inputTokens: second.inputTokens,
          outputTokens: second.outputTokens,
          ms: now() - tRetry,
          ok: true
        })

        const secondResult = validate(req.schema, second.text)
        if (secondResult.ok) {
          setStatus('idle')
          return secondResult.value
        }

        const loose = req.fallback ? validate(req.fallback, second.text) : null
        const kept = loose?.ok ? loose : firstLoose?.ok ? firstLoose : null
        if (kept) {
          console.warn(
            `[ai] ${req.task}: ${loose?.ok ? 'seconda' : 'prima'} risposta accettata senza i controlli facoltativi (${secondResult.error})`
          )
          setStatus('idle')
          return kept.value
        }

        setStatus('error')
        throw new AiSchemaError(secondResult.error)
      } catch (e) {
        setStatus('error')
        await logUsage({
          ts: t0,
          task: req.task,
          model,
          inputTokens: 0,
          outputTokens: 0,
          ms: now() - t0,
          ok: false
        })
        throw e
      }
    })

    if (req.cache) {
      try {
        await mkdir(deps.cacheDir, { recursive: true })
        await writeFile(cacheFile, JSON.stringify(data), 'utf8')
      } catch (e) {
        console.warn('[ai] cache non scritta', e)
      }
    }

    return { data: data as T | string, fromCache: false, model, engine: model }
  }

  return {
    ask,
    converse,
    status: () => currentStatus,
    onStatus(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    }
  }
}

function validate<T>(
  schema: z.ZodType<T>,
  text: string
): { ok: true; value: T } | { ok: false; error: string } {
  let json: unknown
  try {
    json = extractJson(text)
  } catch {
    return { ok: false, error: 'non contiene JSON' }
  }
  const r = schema.safeParse(json)
  return r.success
    ? { ok: true, value: r.data }
    : { ok: false, error: r.error.message.slice(0, 300) }
}

function schemaId(schema?: z.ZodType<unknown>): string {
  if (!schema) return ''
  try {
    return JSON.stringify(z.toJSONSchema(schema))
  } catch {
    return 'schema'
  }
}

function schemaJson(schema: z.ZodType<unknown>): object | undefined {
  try {
    const raw = { ...(z.toJSONSchema(schema) as Record<string, unknown>) }
    delete raw.$schema
    return raw
  } catch {
    return undefined
  }
}
