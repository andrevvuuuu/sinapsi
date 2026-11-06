import { readFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createBridge, type SpawnFn } from '../../src/main/ai/bridge'
import { AiSchemaError } from '../../src/main/ai/errors'
import { createNoteGenerator } from '../../src/main/notes/generator'
import { DEFAULT_ENGINES } from '../../src/shared/settings-schema'
import type { VaultIndex } from '../../src/shared/vault-types'

/** The real Lagrange note: plain-text formulas and blanks inside $…$, so it fails the math check. */
const lagrange = JSON.parse(readFileSync(join(__dirname, '../fixtures/nota-lagrange.json'), 'utf8')).nota
const clean = JSON.parse(readFileSync(join(__dirname, '../fixtures/nota-min.json'), 'utf8'))
const agyOk = (response: string): string => JSON.stringify({ status: 'SUCCESS', response, usage: { input_tokens: 1, output_tokens: 1 } })
const reply = (text: string): Awaited<ReturnType<SpawnFn>> => ({ stdout: agyOk(text), stderr: '', code: 0, timedOut: false })

const SOURCE = '/vault/Matematica/Teorema di Lagrange del Valor Medio.md'
const index: VaultIndex = {
  root: '/vault',
  notes: [{ path: SOURCE, title: 'Teorema di Lagrange del Valor Medio', folder: 'Matematica', tags: [], aliases: [], links: [], headings: [], blockIds: [], subject: 'Matematica', mtime: 1, size: 10, available: true }],
  subjects: [],
  scannedAt: 1
}

let dir: string
let warn: ReturnType<typeof vi.spyOn>
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sinapsi-math-'))
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => warn.mockRestore())

/** A real bridge and a real generator; the engine answers with the given replies, in order. */
type Setup = { g: ReturnType<typeof createNoteGenerator>; prompts: string[] }
function setup(replies: string[]): Setup {
  const prompts: string[] = []
  const spawn: SpawnFn = async (_cmd, args) => (prompts.push(args[1]), reply(replies.shift() ?? '…'))
  const bridge = createBridge({ spawn, cacheDir: join(dir, 'cache'), usageFile: join(dir, 'usage.jsonl'), engines: async () => DEFAULT_ENGINES })
  const g = createNoteGenerator({ bridge, dir: join(dir, 'notes'), workDir: join(dir, 'work'), vault: async () => index, readNote: async () => '## 1. Enunciato\ntesto', session: async () => null, onUpdate: () => undefined })
  return { g, prompts }
}
const done = async (g: Setup['g'], id: string): ReturnType<Setup['g']['get']> => {
  await vi.waitFor(async () => expect((await g.get(id)).status).not.toBe('generating'), { timeout: 3000, interval: 10 })
  return g.get(id)
}

describe('math formatting never costs a note', () => {
  it('sends the note back once for its math, then saves it anyway with a warning', async () => {
    const { g, prompts } = setup([JSON.stringify(lagrange), JSON.stringify(lagrange)])
    const n = await done(g, await g.create({ sourcePath: SOURCE }))
    expect(n.status).toBe('ready')
    expect(n.nota?.title).toBe('Teorema di Lagrange')
    expect(prompts).toHaveLength(2)
    expect(prompts[1]).toMatch(/matematica da sistemare/)
    expect(warn.mock.calls.flat().join(' ')).toMatch(/formule da sistemare/)
  })

  it('takes the fixed note when the retry is clean', async () => {
    const { g, prompts } = setup([JSON.stringify(lagrange), JSON.stringify(clean)])
    const n = await done(g, await g.create({ sourcePath: SOURCE }))
    expect(n).toMatchObject({ status: 'ready', nota: { title: 'Teorema di Rolle' } })
    expect(prompts).toHaveLength(2)
  })

  it('keeps the first note when the retry comes back invalid for another reason: a valid note is never thrown away', async () => {
    const { g, prompts } = setup([JSON.stringify(lagrange), JSON.stringify({ title: 'senza sezioni' })])
    const n = await done(g, await g.create({ sourcePath: SOURCE }))
    expect(prompts).toHaveLength(2)
    expect(n).toMatchObject({ status: 'ready', nota: { title: 'Teorema di Lagrange' } })
    expect(warn.mock.calls.flat().join(' ')).toMatch(/prima risposta accettata/)
  })

  it('still fails a note when neither answer is a valid note', async () => {
    const { g } = setup([JSON.stringify({ title: 'senza sezioni' }), 'non è JSON'])
    const n = await done(g, await g.create({ sourcePath: SOURCE }))
    expect(n.status).toBe('error')
    expect(n.nota).toBeUndefined()
  })

  it('bridge: the fallback schema is used only after the retry, never for the first answer', async () => {
    const strict = z.object({ n: z.number().max(5) })
    const loose = z.object({ n: z.number() })
    const replies = ['{"n":9}', '{"n":7}']
    const prompts: string[] = []
    const b = createBridge({ spawn: async (_c, args) => (prompts.push(args[1]), reply(replies.shift()!)), cacheDir: join(dir, 'c'), usageFile: join(dir, 'u.jsonl'), engines: async () => DEFAULT_ENGINES })
    expect((await b.ask({ task: 'extract', prompt: 'p', schema: strict, fallback: loose })).data).toEqual({ n: 7 })
    expect(prompts).toHaveLength(2)
    const b2 = createBridge({ spawn: async () => reply('{"n":"x"}'), cacheDir: join(dir, 'c2'), usageFile: join(dir, 'u2.jsonl'), engines: async () => DEFAULT_ENGINES })
    await expect(b2.ask({ task: 'extract', prompt: 'p', schema: strict, fallback: loose })).rejects.toBeInstanceOf(AiSchemaError)
  })
})
