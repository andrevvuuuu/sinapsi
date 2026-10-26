import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createBridge, type SpawnFn } from '../../src/main/ai/bridge'
import { nodeSpawn } from '../../src/main/ai/engines'
import { scanVault } from '../../src/main/vault/scan'
import { DEFAULT_ENGINES } from '../../src/shared/settings-schema'

const agyOk = (response: string) => ({ stdout: JSON.stringify({ status: 'SUCCESS', response, usage: { input_tokens: 1, output_tokens: 1 } }), stderr: '', code: 0, timedOut: false })
async function mk(spawn: SpawnFn, usageFile?: string) {
  const dir = await mkdtemp(join(tmpdir(), 'sinapsi-fix-'))
  return { dir, b: createBridge({ spawn, cacheDir: join(dir, 'cache'), usageFile: usageFile ?? join(dir, 'u.jsonl'), engines: async () => DEFAULT_ENGINES }) }
}

describe('review fixes', () => {
  it('accepts a successful answer that mentions "log in"', async () => {
    const { b } = await mk(async () => agyOk('Usa il log in base 2 per stimare'))
    await expect(b.ask({ task: 'extract', prompt: 'x' })).resolves.toMatchObject({ data: 'Usa il log in base 2 per stimare' })
    expect(b.status().agy).toBe('idle')
  })

  it('validates cached data against the schema and refetches on mismatch', async () => {
    let calls = 0
    const { b } = await mk(async () => (calls++, agyOk('{"n":1}')))
    const A = z.object({ n: z.number() })
    const B = z.object({ s: z.string() })
    await b.ask({ task: 'extract', prompt: 'p', schema: A, cache: true })
    await expect(b.ask({ task: 'extract', prompt: 'p', schema: B, cache: true })).rejects.toThrow()
    expect(calls).toBeGreaterThan(1)
  })

  it('keeps a paid answer when the usage log cannot be written', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-fix-'))
    await mkdir(join(dir, 'usage-is-a-dir'))
    const { b } = await mk(async () => agyOk('ciao'), join(dir, 'usage-is-a-dir'))
    await expect(b.ask({ task: 'extract', prompt: 'x' })).resolves.toMatchObject({ data: 'ciao' })
  })

  it('times out even when a grandchild keeps stdout open', async () => {
    const t0 = Date.now()
    const script = "require('child_process').spawn('sleep',['30'],{stdio:'inherit'});setInterval(()=>{},1000)"
    const r = await nodeSpawn(process.execPath, ['-e', script], { timeoutMs: 500 })
    expect(r.timedOut).toBe(true)
    expect(Date.now() - t0).toBeLessThan(5000)
  }, 10000)

  it('continues the scan when a subfolder cannot be listed', async () => {
    const root = resolve('tests/fixtures/vault')
    const idx = await scanVault(root, ['.obsidian', 'Prompts'], {
      readdir: async (p) => {
        if (p.endsWith('Bodybuilding')) throw Object.assign(new Error('perm'), { code: 'EPERM' })
        const { readdir } = await import('node:fs/promises')
        return readdir(p, { withFileTypes: true })
      }
    })
    expect(idx.notes.some((n) => n.title === 'Teorema di Rolle')).toBe(true)
  })

  it('lists old-style iCloud placeholders as unavailable notes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sinapsi-icloud-'))
    await writeFile(join(root, '.Algebra delle Matrici.md.icloud'), 'bplist')
    await writeFile(join(root, 'Vera.md'), 'ciao [[Algebra delle Matrici]]')
    const idx = await scanVault(root, [])
    expect(idx.notes.find((n) => n.title === 'Algebra delle Matrici')).toMatchObject({ available: false })
    expect(idx.notes.find((n) => n.title === 'Vera')!.links[0].resolved).toBe(true)
  })
})
