import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createBridge, type SpawnFn } from '../../src/main/ai/bridge'
import { DEFAULT_ENGINES } from '../../src/shared/settings-schema'

const Schema = z.object({ n: z.number() })
const JS = { type: 'object' }
const claudeOut = (extra: object) => ({ stdout: JSON.stringify({ is_error: false, result: '', session_id: 'sid-1', usage: { input_tokens: 1, output_tokens: 1 }, ...extra }), stderr: '', code: 0, timedOut: false })
const agyOut = (response: string) => ({ stdout: JSON.stringify({ status: 'SUCCESS', response, conversation_id: 'conv-9', usage: { input_tokens: 1, output_tokens: 1 } }), stderr: '', code: 0, timedOut: false })

async function make(spawn: SpawnFn, engines = DEFAULT_ENGINES) {
  const dir = await mkdtemp(join(tmpdir(), 'sinapsi-conv-'))
  return createBridge({ spawn, cacheDir: join(dir, 'c'), usageFile: join(dir, 'u.jsonl'), engines: async () => engines })
}

describe('converse', () => {
  it('starts a Claude conversation with id, system prompt, schema and no tools', async () => {
    const calls: string[][] = []
    const b = await make(async (_c, args) => (calls.push(args), claudeOut({ structured_output: { n: 1 } })))
    const r = await b.converse({ task: 'teach', conversationId: 'sid-1', resume: false, systemPrompt: 'SYS', prompt: 'ciao', schema: Schema, jsonSchema: JS })
    expect(r).toMatchObject({ data: { n: 1 }, conversationId: 'sid-1', engine: 'claude' })
    const a = calls[0]
    expect(a.slice(0, 2)).toEqual(['-p', 'ciao'])
    expect(a[a.indexOf('--session-id') + 1]).toBe('sid-1')
    expect(a[a.indexOf('--system-prompt') + 1]).toBe('SYS')
    expect(JSON.parse(a[a.indexOf('--json-schema') + 1])).toEqual(JS)
    expect(a[a.indexOf('--model') + 1]).toBe('sonnet')
    expect(a).toContain('--disallowedTools')
    expect(a[a.indexOf('--setting-sources') + 1]).toBe('')
  })

  it('resumes without resending the system prompt', async () => {
    const calls: string[][] = []
    const b = await make(async (_c, args) => (calls.push(args), claudeOut({ result: '{"n":2}' })))
    await b.converse({ task: 'teach', conversationId: 'sid-1', resume: true, systemPrompt: 'SYS', prompt: 'avanti', schema: Schema, jsonSchema: JS })
    expect(calls[0][calls[0].indexOf('--resume') + 1]).toBe('sid-1')
    expect(calls[0]).not.toContain('--system-prompt')
  })

  it('retries an invalid reply inside the same conversation', async () => {
    const calls: string[][] = []
    const replies = [claudeOut({ result: 'boh' }), claudeOut({ result: '{"n":3}' })]
    const b = await make(async (_c, args) => (calls.push(args), replies.shift()!))
    const r = await b.converse({ task: 'teach', conversationId: 'sid-1', resume: false, systemPrompt: 'SYS', prompt: 'x', schema: Schema, jsonSchema: JS })
    expect(r.data).toEqual({ n: 3 })
    expect(calls[1]).toContain('--resume')
    expect(calls[1][1]).toContain('non era valida')
  })

  it('uses --conversation to resume with agy', async () => {
    const calls: string[][] = []
    const engines = { ...DEFAULT_ENGINES, teach: { engine: 'agy' as const } }
    const b = await make(async (_c, args) => (calls.push(args), agyOut('{"n":4}')), engines)
    const r = await b.converse({ task: 'teach', conversationId: 'conv-9', resume: true, systemPrompt: 'SYS', prompt: 'x', schema: Schema, jsonSchema: JS })
    expect(r).toMatchObject({ data: { n: 4 }, conversationId: 'conv-9', engine: 'agy' })
    expect(calls[0][calls[0].indexOf('--conversation') + 1]).toBe('conv-9')
  })

  it('defaults the teacher to Claude Sonnet', () => {
    expect(DEFAULT_ENGINES.teach).toEqual({ engine: 'claude', model: 'sonnet' })
  })
})
