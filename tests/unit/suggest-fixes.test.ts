import { describe, expect, it, vi } from 'vitest'
import { createSuggester, suggest, type SuggestInput } from '../../src/main/suggest/suggest'
import type { VaultNote } from '../../src/shared/vault-types'

const note = (title: string, links: string[] = [], over: Partial<VaultNote> = {}): VaultNote => ({
  path: `/v/${over.folder ?? ''}${title}.md`,
  title,
  folder: '',
  tags: [],
  aliases: [],
  links: links.map((t) => ({ target: t, path: `/v/${t}.md`, resolved: true })),
  headings: [],
  blockIds: [],
  subject: 'Analisi 1',
  mtime: 1,
  size: 1,
  available: true,
  ...over
})
const input = (notes: VaultNote[], over: Partial<SuggestInput> = {}): SuggestInput => ({ index: { root: '/v', scannedAt: 1, subjects: [], notes }, notes: [], sessions: [], practiced: new Set(), memory: {}, graph: { concepts: [], chains: [], extracted: {} }, now: 1e9, ...over })
const ready = (...t: string[]): { sourcePath: string; status: 'ready' }[] => t.map((x) => ({ sourcePath: `/v/${x}.md`, status: 'ready' as const }))
const moc = note('Analisi 1 MOC', ['Insiemi', 'Funzione', 'Limite', 'Derivata'], { type: 'MOC' })

describe('final review fixes', () => {
  it('a link forward in the course ("vedi [[Limite]]") is not a prerequisite', () => {
    const notes = [moc, note('Insiemi', ['Funzione']), note('Funzione', ['Limite']), note('Limite', ['Derivata']), note('Derivata')]
    expect(suggest(input(notes)).learn[0]).toMatchObject({ label: 'Insiemi', reason: 'primo passo di Analisi 1' })
    expect(suggest(input(notes, { notes: ready('Insiemi') })).learn[0]).toMatchObject({ label: 'Funzione', reason: 'prossimo passo in Analisi 1' })
  })
  it('forward links do not make a note a "base"', () => {
    const notes = [moc, note('Insiemi', ['Derivata']), note('Funzione', ['Derivata']), note('Limite', ['Derivata']), note('Derivata')]
    const s = suggest(input(notes, { notes: ready('Insiemi') })).learn
    expect(s[0].label).toBe('Funzione')
    expect(s.some((c) => c.reason.startsWith('base di'))).toBe(false)
  })
  it('the next step comes after the last studied note, not in a gap left on purpose', () => {
    const notes = [moc, note('Insiemi'), note('Funzione'), note('Limite'), note('Derivata')]
    expect(suggest(input(notes, { notes: ready('Insiemi', 'Limite') })).learn[0].label).toBe('Derivata')
  })
  it('never suggests a note still in iCloud, or one a session would not open by its title', () => {
    const notes = [moc, note('Insiemi', [], { available: false }), note('Funzione'), note('Limite'), note('Derivata'), note('Funzione', [], { folder: 'Algebra/' })]
    // "Funzione" exists twice: a session on that title might open the other one.
    const labels = suggest(input([notes[5], ...notes.slice(0, 5)])).learn.map((c) => c.label)
    expect(labels).not.toContain('Insiemi')
    expect(labels).not.toContain('Funzione')
    expect(labels[0]).toBe('Limite')
  })
  it('every unfinished session keeps its note out of the new suggestions', () => {
    const notes = [moc, note('Insiemi'), note('Funzione'), note('Limite'), note('Derivata')]
    const sessions = [
      { id: 'new', topic: 'Funzione', phase: 'teach' as const, notePath: '/v/Funzione.md', updatedAt: 1e9 - 10 },
      { id: 'old', topic: 'Insiemi', phase: 'teach' as const, notePath: '/v/Insiemi.md', updatedAt: 1e9 - 100 }
    ]
    const labels = suggest(input(notes, { sessions })).learn.map((c) => c.label)
    expect(labels.filter((l) => l === 'Insiemi')).toEqual([])
  })
  it('offers up to three unstudied registry lessons from oldest date and fills the rest from vault suggestions', () => {
    const lessons = ['2026-03-03', '2026-01-01', '2026-02-02', '2026-04-04'].map((date, i) => ({
      id: `lesson-${i}`,
      schema: 1 as const,
      date,
      courseId: 'Educazione Civica',
      topic: `Lezione ${i}`,
      prerequisites: [],
      core8020: [],
      pacerType: 'R' as const,
      conceptIds: [],
      confusionQuestions: [],
      activeMisconceptions: [],
      masteryLevel: 'unknown' as const,
      highYieldResources: [],
      digest: {},
      createdAt: `${date}T09:00:00.000Z`,
      updatedAt: `${date}T09:00:00.000Z`
    }))
    const learn = suggest(input([moc, note('Insiemi')], {
      lessons,
      studiedLessons: new Set(['lesson-3'])
    })).learn
    expect(learn.map((chip) => chip.label)).toEqual(['Lezione 1', 'Lezione 2', 'Lezione 0'])
    expect(learn[0].reason).toBe('Educazione Civica · 2026-01-01')
  })
  it('uses the index the vault watcher already holds instead of scanning the vault again', async () => {
    const idx = input([moc]).index!
    const scan = vi.fn(async () => idx)
    const get = createSuggester({ cachedIndex: () => idx, scan, notes: async () => [], sessions: async () => [], practiced: async () => new Set<string>(), memory: async () => ({}), graph: async () => ({ concepts: [], chains: [], extracted: {} }), now: () => 1 })
    await get()
    expect(scan).not.toHaveBeenCalled()
    const cold = createSuggester({ cachedIndex: () => null, scan, notes: async () => [], sessions: async () => [], practiced: async () => new Set<string>(), memory: async () => ({}), graph: async () => ({ concepts: [], chains: [], extracted: {} }), now: () => 1 })
    await cold()
    expect(scan).toHaveBeenCalledTimes(1)
  })
})
