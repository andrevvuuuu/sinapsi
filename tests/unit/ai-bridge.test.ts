import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createBridge } from '../../src/main/ai/bridge'
import { extractJson } from '../../src/main/ai/json'
import { AiTimeoutError, AuthRequiredError } from '../../src/main/ai/errors'
import { DEFAULT_MODELS } from '../../src/shared/settings-schema'
import * as openrouter from '../../src/main/ai/openrouter'

vi.mock('../../src/main/ai/openrouter', async (importOriginal) => {
  const actual = await importOriginal<typeof openrouter>()
  return {
    ...actual,
    chatCompletion: vi.fn()
  }
})

const orOk = (text: string, model = 'anthropic/claude-haiku-5.5') => ({
  text,
  inputTokens: 100,
  outputTokens: 5,
  model
})

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sinapsi-ai-'))
  vi.clearAllMocks()
})

function bridge(apiKey: string | null = 'test-key') {
  return createBridge({
    cacheDir: join(dir, 'cache'),
    usageFile: join(dir, 'usage.jsonl'),
    models: async () => DEFAULT_MODELS,
    apiKey: async () => apiKey
  })
}

describe('AI bridge', () => {
  it('throws AuthRequiredError when no key is configured', async () => {
    const b = bridge(null)
    await expect(b.ask({ task: 'extract', prompt: 'ciao' })).rejects.toBeInstanceOf(AuthRequiredError)
    expect(b.status()).toBe('no-key')
  })

  it('routes extract to the configured default model and logs usage', async () => {
    vi.mocked(openrouter.chatCompletion).mockResolvedValueOnce(orOk('concetti estratti'))
    const b = bridge()
    const r = await b.ask({ task: 'extract', prompt: 'test' })
    expect(r).toMatchObject({ data: 'concetti estratti', model: DEFAULT_MODELS.extract, fromCache: false })
    expect(openrouter.chatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'test-key',
        model: DEFAULT_MODELS.extract,
        messages: [{ role: 'user', content: 'test' }]
      })
    )
    const usage = JSON.parse((await readFile(join(dir, 'usage.jsonl'), 'utf8')).trim())
    expect(usage).toMatchObject({ task: 'extract', model: DEFAULT_MODELS.extract, inputTokens: 100, outputTokens: 5, ok: true })
  })

  it('retries once when response does not match schema', async () => {
    vi.mocked(openrouter.chatCompletion)
      .mockResolvedValueOnce(orOk('not json'))
      .mockResolvedValueOnce(orOk('{"ok":true}'))

    const b = bridge()
    const r = await b.ask({
      task: 'extract',
      prompt: 'dammi json',
      schema: z.object({ ok: z.boolean() })
    })
    expect(r.data).toEqual({ ok: true })
    expect(openrouter.chatCompletion).toHaveBeenCalledTimes(2)
  })

  it('serves a repeated cached request without calling OpenRouter', async () => {
    vi.mocked(openrouter.chatCompletion).mockResolvedValue(orOk('risposta una volta'))
    const b = bridge()
    const r1 = await b.ask({ task: 'note', prompt: 'p', cache: true })
    const r2 = await b.ask({ task: 'note', prompt: 'p', cache: true })
    expect(r1.data).toBe('risposta una volta')
    expect(r2.data).toBe('risposta una volta')
    expect(r2.fromCache).toBe(true)
    expect(openrouter.chatCompletion).toHaveBeenCalledTimes(1)
  })

  it('handles timeout as AiTimeoutError', async () => {
    vi.mocked(openrouter.chatCompletion).mockRejectedValueOnce(new AiTimeoutError(5000))
    const b = bridge()
    await expect(b.ask({ task: 'extract', prompt: 'x' })).rejects.toBeInstanceOf(AiTimeoutError)
    expect(b.status()).toBe('error')
  })
})

describe('extractJson', () => {
  it('reads raw, fenced and text-wrapped JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 })
    expect(extractJson('Ecco:\n```json\n[1,2]\n```\nfine')).toEqual([1, 2])
    expect(extractJson('Risposta: {"b":{"c":2}} grazie')).toEqual({ b: { c: 2 } })
  })
})

describe('extractJson with LaTeX written with single backslashes', () => {
  it('repairs invalid escapes such as \\sum and \\mathbb', () => {
    expect(extractJson('{"s":"$\\sum_i \\mathbb{R}$"}')).toEqual({ s: '$\\sum_i \\mathbb{R}$' })
  })
  it('keeps LaTeX commands that start like JSON escapes when the text needs repair', () => {
    expect(extractJson('{"s":"$\\frac{a}{b} \\to \\beta \\nabla \\rho \\in A$"}')).toEqual({ s: '$\\frac{a}{b} \\to \\beta \\nabla \\rho \\in A$' })
  })
  it('leaves real escapes alone', () => {
    expect(extractJson('{"s":"riga\\nriga \\"citata\\" \\u00e8 \\\\in","t":"\\in"}')).toEqual({ s: 'riga\nriga "citata" è \\in', t: '\\in' })
  })
})
