import { describe, expect, it } from 'vitest'
import { buildModel } from '../../src/renderer/src/graph/model'
import type { Concept, GraphData } from '../../src/shared/graph-types'
import type { VaultIndex, VaultNote } from '../../src/shared/vault-types'

const vnote = (title: string, opts: Partial<VaultNote> & { links?: [string, boolean][] } = {}): VaultNote => ({
  path: `/Users/x/vault/${title}.md`,
  title,
  folder: '',
  tags: [],
  aliases: [],
  headings: [],
  blockIds: [],
  subject: 'matematica',
  mtime: 1,
  size: 1,
  available: true,
  ...opts,
  links: (opts.links ?? []).map(([target, resolved]) => ({ target, resolved }))
})
const index: VaultIndex = {
  root: '/Users/x/vault',
  scannedAt: 1,
  subjects: [{ id: 'matematica', color: '#de77a9' }],
  notes: [
    vnote('Teorema di Rolle', { links: [['Teorema di Lagrange', true]] }),
    vnote('Teorema di Lagrange', { links: [['Teorema di Rolle', true], ['Teorema di Cauchy', false]] }),
    vnote('Analisi 1 MOC', { links: [['Teorema di Rolle', true], ['Teorema di Taylor', false], ['Teorema di Taylor', false]] }),
    vnote('Bicipite', { subject: 'bodybuilding' })
  ]
}
const C = (id: string, birth: string, name: string, notes = [birth], depth = 0): Concept => ({ id, name, statement: `${name}: enunciato`, aliases: [], birth, notes, sections: {}, depth })
const g: GraphData = {
  extracted: { '/Users/x/vault/Teorema di Rolle.md': { hash: 'h', at: 1 }, '/Users/x/vault/Teorema di Lagrange.md': { hash: 'h', at: 1 } },
  concepts: [
    C('n_w', '/Users/x/vault/Teorema di Rolle.md', 'Weierstrass'),
    C('n_f', '/Users/x/vault/Teorema di Rolle.md', 'Fermat'),
    C('n_r', '/Users/x/vault/Teorema di Rolle.md', 'Rolle', ['/Users/x/vault/Teorema di Rolle.md', '/Users/x/vault/Teorema di Lagrange.md'], 1),
    C('n_l', '/Users/x/vault/Teorema di Lagrange.md', 'Lagrange', undefined, 2)
  ],
  chains: [
    { id: 'arg_1', premises: ['n_w', 'n_f'], conclusion: 'n_r', notes: ['/Users/x/vault/Teorema di Rolle.md'] },
    { id: 'arg_2', premises: ['n_r'], conclusion: 'n_l', notes: ['/Users/x/vault/Teorema di Lagrange.md'] }
  ]
}

describe('buildModel', () => {
  const m = buildModel(g, index)
  it('makes one region per note with concepts born there', () => {
    expect(m.regions.map((r) => r.title).sort()).toEqual(['Teorema di Lagrange', 'Teorema di Rolle'])
    expect(m.regions.find((r) => r.title === 'Teorema di Rolle')!.concepts).toEqual(['n_w', 'n_f', 'n_r'])
    expect(m.concepts.find((c) => c.id === 'n_r')).toMatchObject({ region: '/Users/x/vault/Teorema di Rolle.md', notes: ['/Users/x/vault/Teorema di Rolle.md', '/Users/x/vault/Teorema di Lagrange.md'] })
  })
  it('turns a two-premise chain into a junction with three arrows', () => {
    expect(m.junctions).toEqual([{ id: 'arg_1', premises: ['n_w', 'n_f'], conclusion: 'n_r', depth: 0.5 }])
    expect(m.arrows.filter((a) => a.chain === 'arg_1')).toEqual([
      { from: 'n_w', to: 'arg_1', chain: 'arg_1', head: false },
      { from: 'n_f', to: 'arg_1', chain: 'arg_1', head: false },
      { from: 'arg_1', to: 'n_r', chain: 'arg_1', head: true }
    ])
    expect(m.arrows.filter((a) => a.chain === 'arg_2')).toEqual([{ from: 'n_r', to: 'n_l', chain: 'arg_2', head: true }])
  })
  it('keeps notes without concepts as Obsidian notes', () => {
    expect(m.notes.map((n) => n.title).sort()).toEqual(['Analisi 1 MOC', 'Bicipite'])
    expect(m.notes.find((n) => n.title === 'Analisi 1 MOC')!.moc).toBe(true)
  })
  it('dedupes wikilinks between notes', () => {
    expect(m.wikilinks).toHaveLength(2)
    expect(m.wikilinks).toContainEqual(['/Users/x/vault/Teorema di Lagrange.md', '/Users/x/vault/Teorema di Rolle.md'])
  })
  it('lists as frontier only unresolved links of MOC notes', () => {
    expect(m.frontier).toEqual([{ name: 'Teorema di Taylor', course: 'Analisi 1 MOC' }])
  })
  it('knows parents, children and the deepest level', () => {
    expect(m.parents.get('n_r')).toEqual(['n_w', 'n_f'])
    expect(m.kids.get('n_r')).toEqual(['n_l'])
    expect(m.maxDepth).toBe(2)
  })
  it('searches concepts, regions and notes ignoring case and accents', () => {
    const hits = m.search('lagr')
    expect(hits.map((h) => h.label)).toEqual(['Lagrange', 'Teorema di Lagrange'])
    expect(hits.map((h) => h.kind)).toEqual(['concept', 'region'])
    expect(m.search('BICÌPITE')[0]).toMatchObject({ kind: 'note', id: '/Users/x/vault/Bicipite.md' })
    expect(m.search('teorema', 1)).toHaveLength(1)
    expect(m.search('  ')).toEqual([])
  })
  it('gives each region a stable colour', () => {
    const a = buildModel(g, index).regions.map((r) => r.hue)
    expect(a).toEqual(m.regions.map((r) => r.hue))
    for (const h of a) expect(h).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('names a subject after the folder that matches its tag', () => {
    const idx: VaultIndex = {
      ...index,
      subjects: [{ id: 'educazionecivica', color: '#000000' }, { id: 'bodybuilding', color: '#111111' }],
      notes: [{ ...vnote('Costituzione', { subject: 'educazionecivica' }), folder: 'Educazione Civica/Diritti' }, vnote('Panca', { subject: 'bodybuilding' })]
    }
    const mm = buildModel({ concepts: [], chains: [], extracted: {} }, idx)
    expect(mm.subjectName('educazionecivica')).toBe('Educazione Civica')
    expect(mm.subjectName('bodybuilding')).toBe('Bodybuilding')
    expect(mm.subjectName(null)).toBe('')
  })
})

import { filterBySubject, liveOnly, subjectsOf } from '../../src/renderer/src/graph/model'

const subjectGraph: GraphData = {
  concepts: [
    C('a', '/Users/x/vault/Matematica/a.md', 'A'),
    C('b', '/Users/x/vault/Generale/b.md', 'B')
  ],
  chains: [{ id: 'ab', premises: ['a'], conclusion: 'b', notes: [] }],
  extracted: {},
  retired: ['x'],
  dormant: ['y']
}
const subjectIndex: VaultIndex = { ...index, notes: [
  vnote('a', { path: '/Users/x/vault/Matematica/a.md', subject: 'matematica' }),
  vnote('b', { path: '/Users/x/vault/Generale/b.md', subject: null })
] }
const subjectOf = (path: string): string | null => subjectIndex.notes.find((note) => note.path === path)?.subject ?? null

describe('graph subject helpers', () => {
  it('lists unique subjects including notes without one', () => {
    expect(subjectsOf(subjectGraph, subjectOf)).toEqual(['matematica', null])
    expect(subjectsOf(subjectGraph, subjectOf)).not.toContain('Users')
  })
  it('filters concepts, drops incomplete chains and preserves retired and dormant ids', () => {
    const filtered = filterBySubject(subjectGraph, 'matematica', subjectOf)
    expect(filtered.concepts.map((c) => c.id)).toEqual(['a'])
    expect(filtered.chains).toEqual([])
    expect(filtered.retired).toEqual(['x'])
    expect(filtered.dormant).toEqual(['y'])
    expect(filterBySubject(subjectGraph, null, subjectOf).concepts.map((c) => c.id)).toEqual(['b'])
    expect(filterBySubject(subjectGraph, undefined, subjectOf)).toBe(subjectGraph)
  })
  it('keeps frontier links in the live graph', () => {
    const source = { ...index, notes: index.notes.map((n) => n.path === '/Users/x/vault/Teorema di Rolle.md' ? { ...n, links: [{ target: 'Missing', resolved: false }] } : n) }
    const live = liveOnly(subjectGraph, source, ['/Users/x/vault/Teorema di Rolle.md'])
    expect(live.index.notes[0].links.some((l) => !l.resolved)).toBe(true)
  })
})
