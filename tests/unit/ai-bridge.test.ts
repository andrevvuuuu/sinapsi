import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createBridge, type SpawnFn } from '../../src/main/ai/bridge'
import { extractJson } from '../../src/main/ai/json'
import { AiTimeoutError, AuthRequiredError, EngineMissingError } from '../../src/main/ai/errors'
import { DEFAULT_ENGINES } from '../../src/shared/settings-schema'

const agyOk = (response: string) => JSON.stringify({ status: 'SUCCESS', response, usage: { input_tokens: 100, output_tokens: 5 } })
const claudeOk = (result: string) => JSON.stringify({ is_error: false, result, usage: { input_tokens: 50, output_tokens: 3 } })
const ok = (stdout: string) => ({ stdout, stderr: '', code: 0, timedOut: false })

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sinapsi-ai-'))
})
function bridge(spawn: SpawnFn) {
  return createBridge({ spawn, cacheDir: join(dir, 'cache'), usageFile: join(dir, 'usage.jsonl'), engines: async () => DEFAULT_ENGINES })
}

describe('AI bridge', () => {
  it('gives agy a print timeout matching a long request, a working folder and no slash commands', async () => {
    const calls: { args: string[]; cwd?: string }[] = []
    const b = bridge(async (_cmd, args, o) => (calls.push({ args, cwd: o.cwd }), ok(agyOk('ok'))))
    await b.ask({ task: 'note', prompt: 'n', timeoutMs: 480_000, cwd: '/tmp/lavoro' })
    const a = calls[0].args
    expect(a[a.indexOf('--print-timeout') + 1]).toBe('470s')
    expect(a).toContain('--disable-slash-commands')
    expect(calls[0].cwd).toBe('/tmp/lavoro')
  })

  it('writes the nota viva with Gemini Flash medium by default', () => {
    expect(DEFAULT_ENGINES.note).toEqual({ engine: 'agy', model: 'gemini-3.8-flash-medium' })
  })

  it('routes extract to agy with the Gemini model and logs usage', async () => {
    const calls: string[][] = []
    const b = bridge(async (cmd, args) => (calls.push([cmd, ...args]), ok(agyOk('ciao'))))
    const r = await b.ask({ task: 'extract', prompt: 'x' })
    expect(r).toMatchObject({ data: 'ciao', engine: 'agy', fromCache: false })
    expect(calls[0]).toEqual(['agy', '-p', 'x', '--output-format', 'json', '--print-timeout', '170s', '--disable-slash-commands', '--model', 'gemini-3.8-flash-high'])
    const usage = JSON.parse((await readFile(join(dir, 'usage.jsonl'), 'utf8')).trim())
    expect(usage).toMatchObject({ task: 'extract', engine: 'agy', inputTokens: 100, outputTokens: 5, ok: true })
  })

  it('routes teach to claude', async () => {
    const calls: string[][] = []
    const b = bridge(async (cmd, args) => (calls.push([cmd, ...args]), ok(claudeOk('OK'))))
    const r = await b.ask({ task: 'teach', prompt: 'spiega' })
    expect(r).toMatchObject({ data: 'OK', engine: 'claude' })
    expect(calls[0]).toEqual(['claude', '-p', 'spiega', '--output-format', 'json', '--model', 'sonnet'])
  })

  it('reports a login prompt as AuthRequiredError', async () => {
    const b = bridge(async () => ({ stdout: 'Opening authentication page in your browser. Do you want to continue? [Y/n]:', stderr: '', code: null, timedOut: true }))
    await expect(b.ask({ task: 'extract', prompt: 'x' })).rejects.toBeInstanceOf(AuthRequiredError)
    expect(b.status().agy).toBe('auth')
  })

  it('times out a hung call and keeps serving the next one', async () => {
    let n = 0
    const b = bridge(async () => (n++ === 0 ? { stdout: '', stderr: '', code: null, timedOut: true } : ok(agyOk('dopo'))))
    await expect(b.ask({ task: 'extract', prompt: 'x' })).rejects.toBeInstanceOf(AiTimeoutError)
    await expect(b.ask({ task: 'extract', prompt: 'y' })).resolves.toMatchObject({ data: 'dopo' })
  })

  it('runs one call at a time per engine but engines in parallel', async () => {
    const log: string[] = []
    const b = bridge(async (cmd, args) => {
      log.push(`start ${cmd} ${args[1]}`)
      await new Promise((r) => setTimeout(r, 20))
      log.push(`end ${cmd} ${args[1]}`)
      return ok(cmd === 'agy' ? agyOk('a') : claudeOk('c'))
    })
    await Promise.all([b.ask({ task: 'extract', prompt: '1' }), b.ask({ task: 'note', prompt: '2' }), b.ask({ task: 'teach', prompt: '3' })])
    expect(log.indexOf('end agy 1')).toBeLessThan(log.indexOf('start agy 2'))
    expect(log.indexOf('start claude 3')).toBeLessThan(log.indexOf('end agy 1'))
  })

  it('retries once when the reply does not match the schema', async () => {
    const prompts: string[] = []
    const replies = ['ciao', '{"ok":true}']
    const b = bridge(async (_c, args) => (prompts.push(args[1]), ok(agyOk(replies.shift()!))))
    const r = await b.ask({ task: 'extract', prompt: 'dammi json', schema: z.object({ ok: z.boolean() }) })
    expect(r.data).toEqual({ ok: true })
    expect(prompts[1]).toContain('non era valida')
  })

  it('serves a repeated cached request without calling the engine', async () => {
    let calls = 0
    const b = bridge(async () => (calls++, ok(agyOk('uno'))))
    await b.ask({ task: 'note', prompt: 'p', cache: true })
    const r = await b.ask({ task: 'note', prompt: 'p', cache: true })
    expect(calls).toBe(1)
    expect(r).toMatchObject({ data: 'uno', fromCache: true })
  })

  it('reports a missing command as EngineMissingError', async () => {
    const b = bridge(async () => {
      throw Object.assign(new Error('spawn agy ENOENT'), { code: 'ENOENT' })
    })
    await expect(b.ask({ task: 'extract', prompt: 'x' })).rejects.toBeInstanceOf(EngineMissingError)
    expect(b.status().agy).toBe('missing')
  })
})

describe('extractJson', () => {
  it('reads raw, fenced and text-wrapped JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 })
    expect(extractJson('Ecco:\n```json\n[1,2]\n```\nfine')).toEqual([1, 2])
    expect(extractJson('Risposta: {"b":{"c":2}} grazie')).toEqual({ b: { c: 2 } })
  })
})
