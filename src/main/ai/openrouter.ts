import { AiOutputError, AiTimeoutError, AuthRequiredError } from './errors'

export const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1'

export type OpenRouterTextPart = { type: 'text'; text: string }
export type OpenRouterImagePart = { type: 'image_url'; image_url: { url: string } }
export type OpenRouterContent = string | (OpenRouterTextPart | OpenRouterImagePart)[]

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant'
  content: OpenRouterContent
}

export interface OpenRouterModelInfo {
  id: string
  name: string
  supported_parameters?: string[]
  architecture?: {
    input_modalities?: string[]
  }
}

export interface ChatCompletionOptions {
  model: string
  messages: OpenRouterMessage[]
  jsonSchema?: object
  timeoutMs?: number
  signal?: AbortSignal
  apiKey: string
}

export interface ChatCompletionResult {
  text: string
  inputTokens: number
  outputTokens: number
  model: string
}

let cachedModels: { list: OpenRouterModelInfo[]; at: number } | null = null
const CACHE_TTL = 3_600_000 // 1 hour

export async function fetchOpenRouterModels(): Promise<OpenRouterModelInfo[]> {
  const now = Date.now()
  if (cachedModels && now - cachedModels.at < CACHE_TTL) {
    return cachedModels.list
  }
  try {
    const res = await fetch(`${OPENROUTER_API_BASE}/models`)
    if (!res.ok) return cachedModels?.list ?? []
    const json = (await res.json()) as { data?: OpenRouterModelInfo[] }
    const list = json.data ?? []
    cachedModels = { list, at: now }
    return list
  } catch {
    return cachedModels?.list ?? []
  }
}

export async function supportsStructuredOutputs(modelId: string): Promise<boolean> {
  const models = await fetchOpenRouterModels()
  const found = models.find((m) => m.id === modelId)
  if (!found || !found.supported_parameters) return false
  return (
    found.supported_parameters.includes('structured_outputs') ||
    found.supported_parameters.includes('response_format')
  )
}

export async function verifyOpenRouterKey(apiKey: string): Promise<{
  ok: boolean
  label?: string
  usage?: number
  limit?: number | null
  error?: string
}> {
  if (!apiKey || !apiKey.trim()) {
    return { ok: false, error: 'Chiave non fornita' }
  }
  try {
    const res = await fetch(`${OPENROUTER_API_BASE}/auth/key`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`
      }
    })
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: 'Chiave OpenRouter non valida o revocata' }
    }
    if (!res.ok) {
      return { ok: false, error: `Errore OpenRouter (${res.status})` }
    }
    const json = (await res.json()) as {
      data?: {
        label?: string
        usage?: number
        limit?: number | null
      }
    }
    const d = json.data
    return {
      ok: true,
      label: d?.label,
      usage: d?.usage,
      limit: d?.limit
    }
  } catch (e) {
    return {
      ok: false,
      error: `Impossibile verificare la chiave: ${e instanceof Error ? e.message : String(e)}`
    }
  }
}

function parseRetryAfter(header: string | null): number {
  if (!header) return 1000
  const seconds = Number(header)
  if (!Number.isNaN(seconds) && seconds > 0) {
    return Math.min(10_000, Math.max(500, seconds * 1000))
  }
  const date = Date.parse(header)
  if (!Number.isNaN(date)) {
    const delta = date - Date.now()
    if (delta > 0) return Math.min(10_000, Math.max(500, delta))
  }
  return 1000
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export async function chatCompletion(opts: ChatCompletionOptions): Promise<ChatCompletionResult> {
  const timeoutMs = opts.timeoutMs ?? 180_000
  const maxRetries = 2
  let attempt = 0

  if (!opts.apiKey) {
    throw new AuthRequiredError('OpenRouter')
  }

  // Check if model natively supports structured outputs
  const structuredAllowed = opts.jsonSchema ? await supportsStructuredOutputs(opts.model) : false

  const bodyPayload: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages
  }

  if (opts.jsonSchema && structuredAllowed) {
    bodyPayload.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'response',
        strict: true,
        schema: opts.jsonSchema
      }
    }
    bodyPayload.provider = {
      require_parameters: true
    }
  }

  while (attempt <= maxRetries) {
    attempt++
    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)

    if (opts.signal) {
      if (opts.signal.aborted) {
        clearTimeout(timer)
        controller.abort()
      } else {
        opts.signal.addEventListener('abort', () => controller.abort(), { once: true })
      }
    }

    try {
      const res = await fetch(`${OPENROUTER_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://sinapsi.app',
          'X-Title': 'Sinapsi'
        },
        body: JSON.stringify(bodyPayload),
        signal: controller.signal
      })
      clearTimeout(timer)

      if (res.status === 401 || res.status === 403) {
        throw new AuthRequiredError('OpenRouter')
      }
      if (res.status === 402) {
        throw new AiOutputError('Crediti OpenRouter esauriti: controlla il saldo su openrouter.ai')
      }

      // Retry on 429
      if (res.status === 429 && attempt <= maxRetries) {
        const backoff = parseRetryAfter(res.headers.get('Retry-After'))
        await sleep(backoff)
        continue
      }

      // Retry on 5xx
      if (res.status >= 500 && res.status <= 599 && attempt <= maxRetries) {
        await sleep(1000 * Math.pow(2, attempt - 1))
        continue
      }

      if (!res.ok) {
        let errMessage = `risposta non valida (codice ${res.status})`
        try {
          const errBody = (await res.json()) as { error?: { message?: string } }
          if (errBody?.error?.message) errMessage = errBody.error.message
        } catch {
          // ignore json parse error
        }
        throw new AiOutputError(`OpenRouter: ${errMessage}`)
      }

      let parsed: {
        choices?: Array<{ message?: { content?: string } }>
        usage?: { prompt_tokens?: number; completion_tokens?: number }
      }
      try {
        parsed = await res.json()
      } catch {
        throw new AiOutputError('OpenRouter: risposta non in JSON')
      }

      const content = parsed.choices?.[0]?.message?.content
      if (typeof content !== 'string') {
        throw new AiOutputError('OpenRouter: contenuto della risposta mancante o non valido')
      }

      const inputTokens = parsed.usage?.prompt_tokens ?? 0
      const outputTokens = parsed.usage?.completion_tokens ?? 0

      return {
        text: content.trim(),
        inputTokens,
        outputTokens,
        model: opts.model
      }
    } catch (e) {
      clearTimeout(timer)
      if (timedOut || (e instanceof Error && e.name === 'AbortError')) {
        throw new AiTimeoutError('OpenRouter', timeoutMs)
      }
      if (
        e instanceof AuthRequiredError ||
        e instanceof AiOutputError ||
        e instanceof AiTimeoutError
      ) {
        throw e
      }
      // Network or fetch errors: retry if attempts remaining
      if (attempt <= maxRetries) {
        await sleep(1000 * Math.pow(2, attempt - 1))
        continue
      }
      throw new AiOutputError(
        `OpenRouter: errore di rete (${e instanceof Error ? e.message : String(e)})`
      )
    }
  }

  throw new AiOutputError('OpenRouter: troppi tentativi falliti')
}
