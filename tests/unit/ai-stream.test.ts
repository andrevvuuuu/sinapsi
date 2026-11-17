import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createBridge, type SpawnFn } from '../../src/main/ai/bridge'
import { AiAbortError } from '../../src/main/ai/errors'
import { DEFAULT_ENGINES } from '../../src/shared/settings-schema'

const ok = (stdout: string) => ({ stdout, stderr: '', code: 0, timedOut: false })
async function make(spawn: SpawnFn) {
  const dir = await mkdtemp(join(tmpdir(), 'sinapsi-stream-'))
  return { bridge: createBridge({ spawn, cacheDir: join(dir, 'c'), usageFile: join(dir, 'u.jsonl'), engines: async () => DEFAULT_ENGINES }), usage: join(dir, 'u.jsonl') }
}
const result = JSON.stringify({ type: 'result', is_error: false, structured_output: { lesson: 'ciao' }, session_id: 'sid', usage: { input_tokens: 2, output_tokens: 3, cache_read_input_tokens: 4, cache_creation_input_tokens: 5 }, total_cost_usd: 0.0009 })

describe('Claude stream bridge', () => {
  it('streams growing field values across split NDJSON chunks and parses final usage', async () => {
    const seen: string[] = []
    const { bridge, usage } = await make(async (_cmd, args, opts) => {
      expect(args.slice(args.indexOf('--output-format'), args.indexOf('--output-format') + 4)).toEqual(['--output-format', 'stream-json', '--verbose', '--include-partial-messages'])
      const sample = [
        JSON.stringify({ type: 'stream_event', event: { delta: { type: 'input_json_delta', partial_json: '{"lesson": "ciao\\n\\"mo' } } }) + '\n',
        JSON.stringify({ type: 'stream_event', event: { delta: { type: 'input_json_delta', partial_json: 'ndo\\u0021 \\\\ ok' } } }) + '\n',
        result + '\n'
      ].join('')
      for (const part of [sample.slice(0, 37), sample.slice(37, 81), sample.slice(81)]) opts.onOutput?.(part)
      return ok(sample)
    })
    const r = await bridge.ask({ task: 'teach', prompt: 'x', onPartial: (v) => seen.push(v), schema: z.object({ lesson: z.string() }) })
    expect(r.data).toEqual({ lesson: 'ciao' })
    expect(seen).toEqual(['ciao\n"mo', 'ciao\n"mondo! \\ ok'])
    expect(JSON.parse((await readFile(usage, 'utf8')).trim())).toMatchObject({ cacheReadTokens: 4, cacheCreationTokens: 5, costUsd: 0.0009, retry: false })
  })

  it('gives interactive work precedence among queued work', async () => {
    const starts: string[] = []
    let release!: () => void
    let started!: () => void
    const gate = new Promise<void>((r) => { release = r })
    const first = new Promise<void>((r) => { started = r })
    const { bridge } = await make(async (_cmd, args) => {
      starts.push(args[1]); if (starts.length === 1) { started(); await gate }
      return ok(JSON.stringify({ status: 'SUCCESS', response: args[1] }))
    })
    const a = bridge.ask({ task: 'extract', prompt: 'running' })
    await first
    const b = bridge.ask({ task: 'extract', prompt: 'background' })
    const c = bridge.ask({ task: 'extract', prompt: 'interactive', priority: 'interactive' })
    release(); await Promise.all([a, b, c])
    expect(starts).toEqual(['running', 'interactive', 'background'])
  })

  it('removes queued aborts and passes running signals through to spawn', async () => {
    let release!: () => void
    let started!: () => void
    const gate = new Promise<void>((r) => { release = r })
    const didStart = new Promise<void>((r) => { started = r })
    const observed: (AbortSignal | undefined)[] = []
    const { bridge } = await make(async (_cmd, args, opts) => {
      observed.push(opts.signal)
      if (args[1] === 'running') { started(); await gate }
      return ok(JSON.stringify({ status: 'SUCCESS', response: 'ok' }))
    })
    const first = bridge.ask({ task: 'extract', prompt: 'running' })
    await didStart
    const queuedController = new AbortController()
    const queued = bridge.ask({ task: 'extract', prompt: 'queued', signal: queuedController.signal })
    queuedController.abort()
    await expect(queued).rejects.toBeInstanceOf(AiAbortError)
    const runningController = new AbortController()
    const running = bridge.ask({ task: 'extract', prompt: 'abort me', signal: runningController.signal })
    release()
    await first
    while (observed.length < 2) await new Promise((r) => setTimeout(r, 0))
    runningController.abort()
    await expect(running).rejects.toBeInstanceOf(AiAbortError)
    expect(observed).toHaveLength(2)
  })
})
