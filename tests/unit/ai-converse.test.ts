import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createBridge } from '../../src/main/ai/bridge'
import { DEFAULT_MODELS } from '../../src/shared/settings-schema'
import * as openrouter from '../../src/main/ai/openrouter'

vi.mock('../../src/main/ai/openrouter', async (importOriginal) => {
  const actual = await importOriginal<typeof openrouter>()
  return {
    ...actual,
    chatCompletion: vi.fn()
  }
})

const Schema = z.object({ n: z.number() })
const JS = { type: 'object' }
const orOk = (text: string, model = 'anthropic/claude-sonnet-5.5') => ({
  text,
  inputTokens: 10,
  outputTokens: 5,
  model
})

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sinapsi-conv-'))
  vi.clearAllMocks()
})

async function make(apiKey = 'test-key') {
  return createBridge({
    cacheDir: join(dir, 'c'),
    conversationsDir: join(dir, 'convs'),
    usageFile: join(dir, 'u.jsonl'),
    models: async () => DEFAULT_MODELS,
    apiKey: async () => apiKey
  })
}

describe('converse', () => {
  it('starts an OpenRouter conversation with system prompt, schema and stores history', async () => {
    vi.mocked(openrouter.chatCompletion).mockResolvedValueOnce(orOk('{"n":1}'))
    const b = await make()
    const r = await b.converse({
      task: 'teach',
      conversationId: 'sid-1',
      resume: false,
      systemPrompt: 'SYS',
      prompt: 'ciao',
      schema: Schema,
      jsonSchema: JS
    })
    expect(r).toMatchObject({ data: { n: 1 }, conversationId: 'sid-1', model: DEFAULT_MODELS.teach })
    expect(openrouter.chatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        model: DEFAULT_MODELS.teach,
        messages: [
          { role: 'system', content: 'SYS' },
          { role: 'user', content: 'ciao' }
        ]
      })
    )
  })

  it('resumes with existing history and appends the new turn', async () => {
    vi.mocked(openrouter.chatCompletion)
      .mockResolvedValueOnce(orOk('{"n":1}'))
      .mockResolvedValueOnce(orOk('{"n":2}'))

    const b = await make()
    await b.converse({
      task: 'teach',
      conversationId: 'sid-1',
      resume: false,
      systemPrompt: 'SYS',
      prompt: 'ciao',
      schema: Schema,
      jsonSchema: JS
    })

    const r2 = await b.converse({
      task: 'teach',
      conversationId: 'sid-1',
      resume: true,
      systemPrompt: 'SYS',
      prompt: 'avanti',
      schema: Schema,
      jsonSchema: JS
    })
    expect(r2.data).toEqual({ n: 2 })
    expect(openrouter.chatCompletion).toHaveBeenLastCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'system', content: 'SYS' },
          { role: 'user', content: 'ciao' },
          { role: 'assistant', content: '{"n":1}' },
          { role: 'user', content: 'avanti' }
        ]
      })
    )
  })

  it('retries an invalid reply inside the conversation', async () => {
    vi.mocked(openrouter.chatCompletion)
      .mockResolvedValueOnce(orOk('invalid-json'))
      .mockResolvedValueOnce(orOk('{"n":3}'))

    const b = await make()
    const r = await b.converse({
      task: 'teach',
      conversationId: 'sid-1',
      resume: false,
      systemPrompt: 'SYS',
      prompt: 'x',
      schema: Schema,
      jsonSchema: JS
    })
    expect(r.data).toEqual({ n: 3 })
    expect(openrouter.chatCompletion).toHaveBeenCalledTimes(2)
  })

  it('defaults the teacher to the configured model', () => {
    expect(DEFAULT_MODELS.teach).toBe('anthropic/claude-sonnet-5.5')
  })
})
