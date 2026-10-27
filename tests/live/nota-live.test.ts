import { mkdtemp, readFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createBridge } from '../../src/main/ai/bridge'
import { nodeSpawn } from '../../src/main/ai/engines'
import { createNoteGenerator, type NoteMeta } from '../../src/main/notes/generator'
import { scanVault } from '../../src/main/vault/scan'
import { DEFAULT_ENGINES, DEFAULT_EXCLUDED } from '../../src/shared/settings-schema'

// A real nota viva from Andrea's vault note. LIVE_AI=1 (LIVE_NOTES_DIR=<folder> keeps the result,
// e.g. the app's notes folder, to look at it in the app). Model override: LIVE_NOTE_MODEL.
describe.runIf(process.env.LIVE_AI === '1')('live nota viva', () => {
  it('writes the Lagrange note with the Obsidian sections, figures and quizzes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-live-nota-'))
    const engines = { ...DEFAULT_ENGINES, ...(process.env.LIVE_NOTE_MODEL ? { note: { engine: 'agy' as const, model: process.env.LIVE_NOTE_MODEL } } : {}) }
    const bridge = createBridge({ spawn: nodeSpawn, cacheDir: join(dir, 'c'), usageFile: join(dir, 'usage.jsonl'), engines: async () => engines })
    const vault = await scanVault(join(homedir(), 'Obsidian Vault'), DEFAULT_EXCLUDED)
    const source = vault.notes.find((n) => n.title === 'Teorema di Lagrange del Valor Medio')!
    expect(source?.available).toBe(true)
    let done: (m: NoteMeta) => void = () => undefined
    const finished = new Promise<NoteMeta>((r) => (done = r))
    const t0 = Date.now()
    const gen = createNoteGenerator({
      bridge,
      dir: process.env.LIVE_NOTES_DIR ?? join(dir, 'notes'),
      workDir: join(dir, 'ai-work'),
      vault: async () => vault,
      readNote: (p) => readFile(p, 'utf8'),
      session: async () => null,
      onUpdate: (m) => m.status !== 'generating' && done(m)
    })
    const id = await gen.create({ sourcePath: source.path })
    const meta = await finished
    const stored = await gen.get(id)
    const usage = await readFile(join(dir, 'usage.jsonl'), 'utf8')
    console.log(`[live nota] ${meta.status} in ${Math.round((Date.now() - t0) / 1000)} s, dropped ${stored.dropped}, error ${stored.error ?? '—'}\n${usage}`)
    expect(stored.status).toBe('ready')
    const nota = stored.nota!
    const blocks = nota.sections.flatMap((s) => s.blocks.flatMap((b) => (b.type === 'tabs' ? b.tabs.flatMap((t) => t.blocks) : [b])))
    const count = (t: string): number => blocks.filter((b) => b.type === t).length
    console.log(`[live nota] ${nota.sections.length} sections: ${nota.sections.map((s) => s.title).join(' | ')}`)
    console.log(`[live nota] blocks: ${JSON.stringify(Object.fromEntries([...new Set(blocks.map((b) => b.type))].map((t) => [t, count(t)])))}`)
    expect(nota.sections.length).toBeGreaterThanOrEqual(5)
    expect(count('figure') + blocks.filter((b) => b.type === 'proof' && b.figure).length).toBeGreaterThanOrEqual(1)
    expect(count('quiz')).toBeGreaterThanOrEqual(1)
    expect(stored.dropped ?? 0).toBeLessThanOrEqual(Math.ceil(0.2 * (blocks.length + (stored.dropped ?? 0))))
    // The sections follow the note's own "##" headings, in order.
    const headings = source.headings.map((h) => h.toLowerCase())
    const firstWords = (t: string): string => t.toLowerCase().replace(/^\d+[.)]?\s*/, '').split(/\s+/).slice(0, 2).join(' ')
    const positions = nota.sections.map((s) => headings.findIndex((h) => h.includes(firstWords(s.title)))).filter((i) => i >= 0)
    expect(positions.length).toBeGreaterThanOrEqual(Math.min(5, nota.sections.length - 1))
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  }, 600_000)
})
