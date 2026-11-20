import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createBridge, type SpawnFn } from '../../src/main/ai/bridge'
import { buildArgs, ONE_SHOT_SYSTEM } from '../../src/main/ai/engines'
import { extractJson } from '../../src/main/ai/json'
import { AiTimeoutError, AuthRequiredError, EngineMissingError } from '../../src/main/ai/errors'
import { DEFAULT_ENGINES } from '../../src/shared/settings-schema'

const agyOk = (response: string, convId?: string) =>
  JSON.stringify({
    status: 'SUCCESS',
    response,
    conversation_id: convId,
    usage: { input_tokens: 100, output_tokens: 5 }
  })
const claudeOk = (result: string, sessionId?: string, structuredOutput?: unknown) =>
  JSON.stringify({
    is_error: false,
    result,
    session_id: sessionId,
    structured_output: structuredOutput,
    usage: { input_tokens: 50, output_tokens: 3 }
  })
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
    expect(calls[0]).toEqual(['agy', '-p', 'x', '--output-format', 'json', '--print-timeout', '170s', '--disable-slash-commands', '--model', 'gemini-3.8-flash-medium'])
    const usage = JSON.parse((await readFile(join(dir, 'usage.jsonl'), 'utf8')).trim())
    expect(usage).toMatchObject({ task: 'extract', engine: 'agy', inputTokens: 100, outputTokens: 5, ok: true })
  })

  it('routes teach to claude with lockdown and fixed system prompt', async () => {
    const calls: string[][] = []
    const b = bridge(async (cmd, args) => (calls.push([cmd, ...args]), ok(claudeOk('OK'))))
    const r = await b.ask({ task: 'teach', prompt: 'spiega' })
    expect(r).toMatchObject({ data: 'OK', engine: 'claude' })
    expect(calls[0]).toEqual([
      'claude',
      '-p',
      'spiega',
      '--output-format',
      'json',
      '--model',
      'sonnet',
      '--system-prompt',
      ONE_SHOT_SYSTEM,
      '--tools',
      '',
      '--disallowedTools',
      'Bash Edit Write Read Glob Grep WebFetch WebSearch Task NotebookEdit',
      '--strict-mcp-config',
      '--setting-sources',
      ''
    ])
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

  it('retries once when the reply does not match the schema (fallback with full prompt when no conversationId)', async () => {
    const prompts: string[] = []
    const replies = ['ciao', '{"ok":true}']
    const b = bridge(async (_c, args) => (prompts.push(args[1]), ok(agyOk(replies.shift()!))))
    const r = await b.ask({ task: 'extract', prompt: 'dammi json', schema: z.object({ ok: z.boolean() }) })
    expect(r.data).toEqual({ ok: true })
    expect(prompts[1]).toContain('dammi json')
    expect(prompts[1]).toContain('non era valida')
  })

  it('economic retry uses --resume and short prompt without original prompt when conversationId is present', async () => {
    const calls: { args: string[] }[] = []
    const replies = [
      claudeOk('risposta non valida', 'session-abc'),
      claudeOk('', 'session-abc', { ok: true })
    ]
    const b = bridge(async (_c, args) => {
      calls.push({ args })
      return ok(replies.shift()!)
    })
    const r = await b.ask({
      task: 'teach',
      prompt: 'prompt molto lungo',
      schema: z.object({ ok: z.boolean() })
    })
    expect(r.data).toEqual({ ok: true })
    expect(calls).toHaveLength(2)
    const secondArgs = calls[1].args
    expect(secondArgs).toContain('--resume')
    expect(secondArgs[secondArgs.indexOf('--resume') + 1]).toBe('session-abc')
    const secondPrompt = secondArgs[1]
    expect(secondPrompt).not.toContain('prompt molto lungo')
    expect(secondPrompt).toMatch(/La risposta precedente non era valida: .* Rispondi di nuovo, solo con JSON valido secondo il formato richiesto\./)
  })

  it('passes --json-schema for object and array schemas on claude, but not for unknown or transformed schemas', async () => {
    const calls: string[][] = []
    const b = bridge(async (_c, args) => {
      calls.push(args)
      if (args[1] === 'p2') return ok(claudeOk('[]', 'sid', ['hello']))
      return ok(claudeOk('{}', 'sid', { count: 42 }))
    })

    // Object schema: passes --json-schema
    await b.ask({
      task: 'teach',
      prompt: 'p1',
      schema: z.object({ count: z.number() })
    })
    expect(calls[0]).toContain('--json-schema')

    // Array schema with items: passes --json-schema
    calls.length = 0
    await b.ask({
      task: 'teach',
      prompt: 'p2',
      schema: z.array(z.string())
    })
    expect(calls[0]).toContain('--json-schema')

    // z.unknown(): does NOT pass --json-schema
    calls.length = 0
    await b.ask({
      task: 'teach',
      prompt: 'p3',
      schema: z.unknown()
    })
    expect(calls[0]).not.toContain('--json-schema')

    // transformed z.unknown(): does NOT pass --json-schema
    calls.length = 0
    await b.ask({
      task: 'teach',
      prompt: 'p4',
      schema: z.unknown().transform(() => ({ count: 42 }))
    })
    expect(calls[0]).not.toContain('--json-schema')
  })

  it('runs interactive job immediately while background job is running on same engine, maintaining busy status', async () => {
    let releaseBg!: () => void
    let bgStartedResolve!: () => void
    const bgStarted = new Promise<void>((r) => {
      bgStartedResolve = r
    })

    const b = bridge(async (_c, args) => {
      if (args[1] === 'bg-prompt') {
        bgStartedResolve()
        await new Promise<void>((r) => {
          releaseBg = r
        })
        return ok(claudeOk('bg-result'))
      }
      if (args[1] === 'inter-prompt') {
        return ok(claudeOk('inter-result'))
      }
      return ok(claudeOk('other'))
    })

    const bgJob = b.ask({
      task: 'teach',
      prompt: 'bg-prompt',
      priority: 'background'
    })

    await bgStarted
    expect(b.status().claude).toBe('busy')

    // Interactive job enqueued while bg is running starts immediately
    const interJob = b.ask({
      task: 'teach',
      prompt: 'inter-prompt',
      priority: 'interactive'
    })

    const interRes = await interJob
    expect(interRes.data).toBe('inter-result')

    // While bg is still running, claude status should remain busy
    expect(b.status().claude).toBe('busy')

    // Now finish bg job
    releaseBg()
    const bgRes = await bgJob
    expect(bgRes.data).toBe('bg-result')

    // All jobs done, engine should be idle
    expect(b.status().claude).toBe('idle')
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

describe('buildArgs', () => {
  it('buildArgs claude with empty opts contains tools lockdown, strict mcp, setting sources and ONE_SHOT_SYSTEM', () => {
    const { cmd, args } = buildArgs('claude', 'prompt', {})
    expect(cmd).toBe('claude')
    expect(args[args.indexOf('--tools') + 1]).toBe('')
    expect(args).toContain('--strict-mcp-config')
    expect(args[args.indexOf('--setting-sources') + 1]).toBe('')
    expect(args[args.indexOf('--system-prompt') + 1]).toBe(ONE_SHOT_SYSTEM)
  })

  it('buildArgs claude with readOnly is identical to original (Read allowed, no system prompt)', () => {
    const { cmd, args } = buildArgs('claude', 'prompt', { readOnly: true })
    expect(cmd).toBe('claude')
    expect(args[args.indexOf('--tools') + 1]).toBe('Read')
    expect(args[args.indexOf('--allowedTools') + 1]).toBe('Read')
    expect(args).toContain('--strict-mcp-config')
    expect(args[args.indexOf('--setting-sources') + 1]).toBe('')
    expect(args).not.toContain('--system-prompt')
    expect(args).not.toContain('--disallowedTools')
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
