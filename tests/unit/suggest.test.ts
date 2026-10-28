import { describe, expect, it } from 'vitest'
import { suggest, type SuggestInput } from '../../src/main/suggest/suggest'
import type { Memory } from '../../src/shared/memory-types'
import type { VaultLink, VaultNote } from '../../src/shared/vault-types'

const link = (title: string): VaultLink => ({ target: title, path: `/v/${title}.md`, resolved: true })
const note = (title: string, links: string[] = [], over: Partial<VaultNote> = {}): VaultNote => ({
  path: `/v/${title}.md`,
  title,
  folder: '',
  tags: [],
  aliases: [],
  links: links.map(link),
  headings: [],
  blockIds: [],
  subject: 'Analisi 1',
  mtime: 1,
  size: 1,
  available: true,
  ...over
})
const NOW = 1_000_000_000
function input(notes: VaultNote[], over: Partial<SuggestInput> = {}): SuggestInput {
  return { index: { root: '/v', scannedAt: 1, subjects: [], notes }, notes: [], sessions: [], practiced: new Set(), memory: {}, graph: { concepts: [], chains: [], extracted: {} }, now: NOW, ...over }
}
const ready = (...titles: string[]) => titles.map((t) => ({ sourcePath: `/v/${t}.md`, status: 'ready' as const }))
const mem = (id: string, R: number | null, over: Partial<Memory> = {}): Memory => ({ conceptId: id, state: 'incerto', R, due: null, reps: 1, lapses: 0, lastAt: 1, misconception: false, ...over })
const concept = (id: string, name: string, birth: string) => ({ id, name, statement: 's', aliases: [], birth: `/v/${birth}.md`, notes: [`/v/${birth}.md`], sections: {}, depth: 0 })

const MOC = note('Analisi 1 MOC', ['Numeri Naturali', 'Induzione', 'Numeri Interi', 'Da scrivere'], { type: 'MOC' })
const course = [MOC, note('Numeri Naturali'), note('Induzione', ['Numeri Naturali']), note('Numeri Interi', ['Induzione'])]

describe('Apprendimento', () => {
  it('a course not started begins from its first note', () => {
    const s = suggest(input(course)).learn
    expect(s[0]).toMatchObject({ label: 'Numeri Naturali', reason: 'primo passo di Analisi 1', action: { kind: 'learn', topic: 'Numeri Naturali' } })
  })
  it('the next note in the course order after what is studied', () => {
    const s = suggest(input(course, { notes: ready('Numeri Naturali') })).learn
    expect(s[0]).toMatchObject({ label: 'Induzione', reason: 'prossimo passo in Analisi 1' })
    expect(s.map((c) => c.label)).not.toContain('Numeri Naturali')
  })
  it('a note the next one builds on comes first', () => {
    const notes = [note('Analisi 1 MOC', ['A', 'B', 'C'], { type: 'MOC' }), note('A'), note('B', ['Extra']), note('C'), note('Extra', [], { subject: 'Algebra' })]
    const s = suggest(input(notes, { notes: ready('A') })).learn
    expect(s[0]).toMatchObject({ label: 'Extra', reason: 'serve per capire «B»' })
  })
  it('a finished learning session counts as studied', () => {
    const s = suggest(input(course, { sessions: [{ id: 's', topic: 'naturali', phase: 'done', notePath: '/v/Numeri Naturali.md', updatedAt: 1 }] })).learn
    expect(s[0].label).toBe('Induzione')
  })
  it('an unfinished session is offered first, to resume', () => {
    const s = suggest(input(course, { sessions: [{ id: 's9', topic: 'Induzione', phase: 'teach', notePath: '/v/Induzione.md', updatedAt: NOW - 1000 }] })).learn
    expect(s[0]).toMatchObject({ label: 'Induzione', reason: 'sessione da finire', action: { kind: 'resume', id: 's9' } })
    expect(s.filter((c) => c.label === 'Induzione')).toHaveLength(1)
  })
  it('a note many others build on is a base worth studying', () => {
    const notes = [note('Limiti'), note('Continuità', ['Limiti']), note('Derivate', ['Limiti']), note('Serie', ['Limiti'])]
    expect(suggest(input(notes)).learn[0]).toMatchObject({ label: 'Limiti', reason: 'base di 3 note' })
  })
  it('survives links in a cycle, a vault with no MOC and no links, and no vault at all', () => {
    const cyc = [note('Analisi 1 MOC', ['A', 'B'], { type: 'MOC' }), note('A', ['B']), note('B', ['A'])]
    expect(suggest(input(cyc, { notes: ready('A') })).learn.length).toBeGreaterThan(0)
    expect(suggest(input([note('Sola')])).learn).toEqual([])
    expect(suggest(input([], { index: null })).learn).toEqual([])
  })
  it('never more than three, never the same note twice, never a MOC', () => {
    const notes = [note('X MOC', ['a', 'b'], { type: 'MOC' }), note('Y MOC', ['c'], { type: 'MOC' }), note('Z MOC', ['d'], { type: 'MOC' }), note('W MOC', ['e'], { type: 'MOC' }), ...['a', 'b', 'c', 'd', 'e'].map((t) => note(t))]
    const s = suggest(input(notes)).learn
    expect(s.length).toBe(3)
    expect(new Set(s.map((c) => c.label)).size).toBe(3)
    expect(s.some((c) => /MOC/.test(c.label))).toBe(false)
  })
})

describe('Ripasso', () => {
  const graph = {
    concepts: [concept('n_a', 'Assioma di Peano', 'Numeri Naturali'), concept('n_b', 'Buon ordinamento', 'Induzione'), concept('n_c', 'Induzione forte', 'Induzione'), concept('n_d', 'Divisione', 'Numeri Interi')],
    chains: [
      { id: 'c1', premises: ['n_a'], conclusion: 'n_b', notes: [] },
      { id: 'c2', premises: ['n_a', 'n_b'], conclusion: 'n_c', notes: [] }
    ],
    extracted: {}
  }
  it('what is due today, a fragile foundation, a misconception', () => {
    const memory = { n_d: mem('n_d', 0.7, { due: NOW - 1 }), n_a: mem('n_a', 0.45), n_c: mem('n_c', 0.9, { misconception: true }) }
    const s = suggest(input(course, { graph, memory })).review
    expect(s[0]).toMatchObject({ label: 'Ripasso del giorno', reason: '1 concetto in scadenza', action: { kind: 'review', conceptIds: ['n_d'] } })
    expect(s[1]).toMatchObject({ label: 'Assioma di Peano', reason: 'base di 2 concetti · 45%', action: { kind: 'review', conceptIds: ['n_a'] } })
    expect(s[2]).toMatchObject({ label: 'Induzione forte', reason: 'sbagliato con sicurezza' })
  })
  it('nothing reviewed yet: nothing to suggest', () => {
    expect(suggest(input(course, { graph })).review).toEqual([])
  })
})

describe('Pratica', () => {
  const graph = { concepts: ['Numeri Naturali', 'Induzione', 'Numeri Interi'].map((t, i) => concept(`n_${i}`, `C${i}`, t)), chains: [], extracted: {} }
  it('a studied note never practiced, an exam once a subject has 3 studied notes, a half-remembered concept', () => {
    const memory = { n_0: mem('n_0', 0.65) }
    const s = suggest(input(course, { graph, memory, notes: ready('Numeri Naturali', 'Induzione', 'Numeri Interi'), practiced: new Set(['n_0', 'n_1']) })).practice
    expect(s[0]).toMatchObject({ label: 'Numeri Interi', reason: 'studiata, mai messa in pratica', action: { kind: 'practice', conceptIds: ['n_2'] } })
    expect(s[1]).toMatchObject({ label: 'Simulazione d’esame · Analisi 1', reason: '3 note studiate', action: { kind: 'practice', conceptIds: ['n_0', 'n_1', 'n_2'], exam: true } })
    expect(s[2]).toMatchObject({ label: 'C0', reason: 'a metà · 65%' })
  })
  it('nothing studied: nothing to practice', () => {
    expect(suggest(input(course, { graph })).practice).toEqual([])
  })
})
