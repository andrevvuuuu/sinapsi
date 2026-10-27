import { describe, expect, it } from 'vitest'
import { buildCatalog, buildMaterialContext, matchConcepts } from '../../src/main/practice/material'
import type { Concept, GraphData } from '../../src/shared/graph-types'
import type { Memory } from '../../src/shared/memory-types'
import type { Notebook } from '../../src/shared/notebook-types'
import type { VaultIndex, VaultNote } from '../../src/shared/vault-types'

const NOW = 1_000_000_000
const vnote = (title: string, subject: string | null): VaultNote => ({ path: `/v/${title}.md`, title, folder: '', tags: [], aliases: [], links: [], headings: [], blockIds: [], subject, mtime: 1, size: 1, available: true })
const vault: VaultIndex = { root: '/v', scannedAt: 1, subjects: [], notes: [vnote('Teorema di Rolle', 'Analisi'), vnote('Teorema di Lagrange', 'Analisi'), vnote('Glicolisi', 'Fisiologia')] }
const C = (id: string, name: string, note: string): Concept => ({ id, name, statement: `${name}: enunciato`, aliases: [], birth: `/v/${note}.md`, notes: [`/v/${note}.md`], sections: {}, depth: 0 })
const graph: GraphData = {
  concepts: [C('n_r', 'Teorema di Rolle', 'Teorema di Rolle'), C('n_w', 'Teorema di Weierstrass', 'Teorema di Rolle'), C('n_l', 'Teorema di Lagrange', 'Teorema di Lagrange'), C('n_g', 'Glicolisi anaerobica', 'Glicolisi'), C('n_f', 'Teorema di Fermat', 'Teorema di Rolle')],
  chains: [{ id: 'arg_1', premises: ['n_w', 'n_f'], conclusion: 'n_r', notes: [] }, { id: 'arg_2', premises: ['n_g'], conclusion: 'n_l', notes: [] }],
  extracted: {}
}
const mem = (id: string, R: number | null, due: number | null): Memory => ({ conceptId: id, state: 'debole', R, due, reps: 1, lapses: 0, lastAt: 1, misconception: false })
const memory = { n_r: mem('n_r', 0.31, NOW - 1), n_l: mem('n_l', 0.23, NOW - 1), n_w: mem('n_w', 0.5, NOW + 1e9), n_g: mem('n_g', 0.7, NOW + 1e9), n_f: mem('n_f', 0.9, NOW + 1e9) }
const notebooks: Notebook[] = [
  {
    id: 'nb',
    name: 'Analisi 1',
    subject: 'Analisi',
    link: null,
    createdAt: 1,
    sources: [
      { id: '11111111-1111-4111-8111-111111111111', notebookId: 'nb', kind: 'pdf', title: 'Temi d’esame', origin: 't.pdf', addedAt: 1, status: 'ready', info: '34 pagine' },
      { id: '22222222-2222-4222-8222-222222222222', notebookId: 'nb', kind: 'audio', title: 'Lezione', origin: 'l.m4a', addedAt: 1, status: 'processing' }
    ]
  }
]

describe('buildCatalog', () => {
  const cat = buildCatalog({ graph, memory, practiced: new Set(['n_r', 'n_l', 'n_w', 'n_g']), vault, notebooks, now: NOW })
  it('groups concepts by subject and birth note, with memory and practice', () => {
    expect(cat.subjects.map((s) => s.name)).toEqual(['Analisi', 'Fisiologia'])
    const rolle = cat.subjects[0].notes.find((n) => n.title === 'Teorema di Rolle')!
    expect(rolle.concepts.map((c) => c.id)).toEqual(['n_r', 'n_w', 'n_f'])
    expect(rolle.concepts[0]).toEqual({ id: 'n_r', name: 'Teorema di Rolle', R: 0.31, due: true, practiced: true })
  })
  it('lists only ready notebook sources', () => {
    expect(cat.sources).toEqual([{ id: '11111111-1111-4111-8111-111111111111', title: 'Temi d’esame', kind: 'pdf', notebook: 'Analisi 1', info: '34 pagine' }])
  })
  it('suggests the most urgent with the reason: due first, then weakest, then never practiced', () => {
    expect(cat.suggested).toEqual([
      { id: 'n_l', name: 'Teorema di Lagrange', why: 'da ripassare · 23%' },
      { id: 'n_r', name: 'Teorema di Rolle', why: 'da ripassare · 31%' },
      { id: 'n_w', name: 'Teorema di Weierstrass', why: '50% memoria' },
      { id: 'n_g', name: 'Glicolisi anaerobica', why: '70% memoria' },
      { id: 'n_f', name: 'Teorema di Fermat', why: 'mai praticato' }
    ])
  })
})

describe('matchConcepts', () => {
  const cat = buildCatalog({ graph, memory, practiced: new Set(), vault, notebooks, now: NOW })
  it('finds concepts by name or note title, ignoring accents and filler words', () => {
    expect(matchConcepts(cat, 'tutto il teorema di lagrange').sort()).toEqual(['n_l'])
    expect(matchConcepts(cat, 'rolle').sort()).toEqual(['n_f', 'n_r', 'n_w'])
    expect(matchConcepts(cat, 'glicolìsi')).toEqual(['n_g'])
    expect(matchConcepts(cat, 'autovalori')).toEqual([])
  })
})

describe('buildMaterialContext', () => {
  it('gives the tutor the picked concepts, their chains, the notes, the sources and the free text', async () => {
    const text = await buildMaterialContext({
      material: { conceptIds: ['n_r', 'n_w'], sourceIds: ['11111111-1111-4111-8111-111111111111'], free: 'Esercizio 3 del tema di giugno' },
      graph,
      readNote: async (p) => `Testo di ${p}`,
      sourceText: async () => ({ title: 'Temi d’esame', text: { segments: [{ label: 'p. 1', text: 'Esercizio 1: studia f.' }], warnings: [] } })
    })
    expect(text).toContain('n_r | Teorema di Rolle | Teorema di Rolle: enunciato')
    expect(text).toContain('n_w | Teorema di Weierstrass')
    expect(text).toContain('Teorema di Weierstrass + Teorema di Fermat ⇒ Teorema di Rolle')
    expect(text).toContain('Testo di /v/Teorema di Rolle.md')
    expect(text.match(/Testo di \/v\/Teorema di Rolle\.md/g)).toHaveLength(1)
    expect(text).toContain('(Temi d’esame, p. 1) Esercizio 1: studia f.')
    expect(text).toContain('Esercizio 3 del tema di giugno')
  })
  it('works with a free topic only', async () => {
    const text = await buildMaterialContext({ material: { conceptIds: [], sourceIds: [], free: 'autovalori' }, graph, readNote: async () => '', sourceText: async () => null })
    expect(text).toContain('autovalori')
    expect(text).toContain('nessun concetto della mappa')
  })
})
