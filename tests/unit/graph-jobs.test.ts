import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createExtractor } from '../../src/main/graph/jobs'
import { graphStore, type GraphStore } from '../../src/main/graph/store'
import { DEFAULT_ENGINES, settingsSchema } from '../../src/shared/settings-schema'
import type { VaultIndex, VaultNote } from '../../src/shared/vault-types'

const vnote = (title: string, subject: string | null, available = true): VaultNote => ({
  path: `/v/${title}.md`, title, folder: '', tags: [], aliases: [], links: [], headings: [], blockIds: [], subject, mtime: 1, size: 1, available
})
const index: VaultIndex = { root: '/v', scannedAt: 1, subjects: [], notes: [vnote('Alfa', 'storia'), vnote('Rolle', 'matematica'), vnote('Nuvola', 'matematica', false)] }
const reply = (name: string) => ({ data: { propositions: [{ id: 'p1', name, statement: `${name} vale.` }], chains: [], dropped: 0 }, fromCache: false, engine: 'agy' as const })

let dir: string
let store: GraphStore
let texts: Record<string, string>
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sinapsi-jobs-'))
  store = graphStore(dir)
  texts = { '/v/Alfa.md': 'testo alfa', '/v/Rolle.md': 'testo rolle' }
})
function setup(ask = vi.fn(async (req: { prompt: string }) => reply(req.prompt.includes('Rolle') ? 'Rolle' : 'Alfa')), now = () => new Date(2026, 9, 27, 15).getTime(), priorities = async () => [] as string[]) {
  const onChange = vi.fn()
  const x = createExtractor({ bridge: { ask } as never, store, vault: async () => index, readNote: async (p) => texts[p], workDir: join(dir, 'w'), now, onChange, priorities })
  return { x, ask, onChange }
}
const BG = { idleSeconds: 600, enabled: true, dailyLimit: 6 }

describe('extractor', () => {
  it('extracts a note into the graph', async () => {
    const { x, ask, onChange } = setup()
    await x.request('/v/Rolle.md', 'manual')
    expect((ask.mock.calls[0][0] as { task: string; cwd: string }).task).toBe('extract')
    const g = await x.graph()
    expect(g.concepts.map((c) => c.name)).toEqual(['Rolle'])
    expect(g.extracted['/v/Rolle.md']).toBeTruthy()
    expect(onChange).toHaveBeenCalled()
  })
  it('skips an unchanged note, but a manual request re-extracts', async () => {
    const { x, ask } = setup()
    await x.request('/v/Rolle.md', 'study')
    await x.request('/v/Rolle.md', 'study')
    expect(ask).toHaveBeenCalledTimes(1)
    await x.request('/v/Rolle.md', 'manual')
    expect(ask).toHaveBeenCalledTimes(2)
    // A neighbour edited in Obsidian: extracted again even though its own text did not change.
    await x.request('/v/Rolle.md', 'linked')
    expect(ask).toHaveBeenCalledTimes(3)
    texts['/v/Rolle.md'] = 'testo cambiato'
    await x.request('/v/Rolle.md', 'study')
    expect(ask).toHaveBeenCalledTimes(4)
  })
  it('offers the note its own concepts again when re-extracting', async () => {
    const { x, ask } = setup()
    await x.request('/v/Rolle.md', 'manual')
    await x.request('/v/Rolle.md', 'manual')
    const g = await x.graph()
    expect((ask.mock.calls[1][0] as { prompt: string }).prompt).toContain(`${g.concepts[0].id} | Rolle`)
  })
  it('runs one extraction per note even when asked twice at once', async () => {
    const { x, ask } = setup()
    await Promise.all([x.request('/v/Rolle.md', 'manual'), x.request('/v/Rolle.md', 'manual')])
    expect(ask).toHaveBeenCalledTimes(1)
  })
  it('keeps the Mac awake while it extracts, and lets it sleep after', async () => {
    const release = vi.fn()
    const keepAwake = vi.fn(() => release)
    const x = createExtractor({ bridge: { ask: vi.fn(async () => reply('Rolle')) } as never, store, vault: async () => index, readNote: async (p) => texts[p], workDir: join(dir, 'w'), onChange: () => undefined, keepAwake })
    await x.request('/v/Rolle.md', 'manual')
    expect(keepAwake).toHaveBeenCalledTimes(1)
    expect(release).toHaveBeenCalledTimes(1)
  })
  it('rejects notes that are not readable in the vault', async () => {
    const { x } = setup()
    await expect(x.request('/v/Nuvola.md', 'manual')).rejects.toThrow('Nota non trovata nel vault')
    await expect(x.request('/etc/passwd', 'manual')).rejects.toThrow('Nota non trovata nel vault')
  })
  it('records a failure and reports it', async () => {
    const { x } = setup(vi.fn(async () => Promise.reject(new Error('quota finita'))))
    await x.request('/v/Rolle.md', 'manual')
    expect(x.status().lastError).toMatchObject({ notePath: '/v/Rolle.md' })
    expect(x.status().lastError?.message).toContain('quota finita')
    const r = await store.read()
    expect(r.extractions[0]).toMatchObject({ ok: false })
  })
})

describe('background extraction', () => {
  it('waits for the Mac to be idle and for the setting', async () => {
    const { x, ask } = setup()
    expect(await x.backgroundTick({ ...BG, idleSeconds: 120 })).toBeNull()
    expect(await x.backgroundTick({ ...BG, enabled: false })).toBeNull()
    expect(ask).not.toHaveBeenCalled()
  })
  it('respects the daily limit', async () => {
    const { x } = setup()
    expect(await x.backgroundTick({ ...BG, dailyLimit: 1 })).not.toBeNull()
    expect(await x.backgroundTick({ ...BG, dailyLimit: 1 })).toBeNull()
  })
  it('re-extracts in the background a note edited after its extraction', async () => {
    const { x } = setup()
    await x.request('/v/Rolle.md', 'manual')
    await x.request('/v/Alfa.md', 'manual')
    expect(await x.backgroundTick(BG)).toBeNull()
    index.notes[1] = { ...index.notes[1], mtime: new Date(2026, 9, 28).getTime() }
    texts['/v/Rolle.md'] = 'testo nuovo'
    expect(await x.backgroundTick(BG)).toBe('/v/Rolle.md')
    index.notes[1] = { ...index.notes[1], mtime: 1 }
  })
  it('does not pick again a note touched without real changes', async () => {
    let clock = new Date(2026, 9, 27, 15).getTime()
    const { x, ask } = setup(undefined, () => clock)
    await x.request('/v/Rolle.md', 'manual')
    await x.request('/v/Alfa.md', 'manual')
    index.notes[1] = { ...index.notes[1], mtime: new Date(2026, 9, 27, 15, 30).getTime() }
    clock = new Date(2026, 9, 27, 16).getTime()
    try {
      expect(await x.backgroundTick(BG)).toBe('/v/Rolle.md')
      expect(ask).toHaveBeenCalledTimes(2)
      expect(await x.backgroundTick(BG)).toBeNull()
    } finally {
      index.notes[1] = { ...index.notes[1], mtime: 1 }
    }
  })
  it('starts from the subjects being studied and never from unavailable notes', async () => {
    const { x } = setup(undefined, undefined, async () => ['matematica'])
    expect(await x.backgroundTick(BG)).toBe('/v/Rolle.md')
    expect(await x.backgroundTick(BG)).toBe('/v/Alfa.md')
    expect(await x.backgroundTick(BG)).toBeNull()
  })
})

describe('settings for extraction', () => {
  it('defaults', () => {
    const s = settingsSchema('/Users/x').parse({})
    expect(s.backgroundExtraction).toBe(true)
    expect(s.dailyExtractionLimit).toBe(6)
    expect(DEFAULT_ENGINES.extract).toEqual({ engine: 'agy', model: 'gemini-3.8-flash-medium' })
  })
})
