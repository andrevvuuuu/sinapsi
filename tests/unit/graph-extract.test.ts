import { describe, expect, it } from 'vitest'
import { buildExtractPrompt } from '../../src/main/graph/extract-prompt'
import { ExtractReplySchema, mergeExtraction, pickCandidates } from '../../src/main/graph/extract'
import type { Concept, GraphData } from '../../src/shared/graph-types'
import type { VaultIndex, VaultNote } from '../../src/shared/vault-types'

let n = 0
const ctx = (known: string[] = []) => ({ notePath: '/v/B.md', known: new Set(known), mint: () => `n_${(++n).toString().padStart(12, '0')}`, mintChain: () => `arg_${(++n).toString().padStart(12, '0')}`, now: 5 })
const parse = (raw: unknown) => {
  const r = ExtractReplySchema.safeParse(raw)
  if (!r.success) throw r.error
  return r.data
}

describe('mergeExtraction', () => {
  it('mints ids for new propositions and resolves chains', () => {
    const { props, chains, dropped } = mergeExtraction(
      parse({ propositions: [{ id: 'p1', name: 'Fermat', statement: 'Un estremo interno è stazionario.', section: '§2' }, { id: 'p2', name: 'Rolle', statement: 'Esiste c con f′(c)=0.' }], chains: [{ premises: ['p1'], conclusion: 'p2' }] }),
      ctx()
    )
    expect(dropped).toBe(0)
    expect(props).toHaveLength(2)
    expect(props[0]).toMatchObject({ name: 'Fermat', notePath: '/v/B.md', section: '§2', at: 5 })
    expect(props[0].id).toMatch(/^n_\d{12}$/)
    expect(chains).toHaveLength(1)
    expect(chains[0]).toMatchObject({ premises: [props[0].id], conclusion: props[1].id, notePath: '/v/B.md' })
    expect(chains[0].id).toMatch(/^arg_/)
  })
  it('records a reference to an existing concept as a re-encounter in this note', () => {
    const { props } = mergeExtraction(parse({ propositions: [{ ref: 'n_known', section: '§3' }], chains: [] }), ctx(['n_known']))
    expect(props).toEqual([{ id: 'n_known', name: '', statement: '', notePath: '/v/B.md', section: '§3', at: 5 }])
  })
  it('drops references to concepts that do not exist', () => {
    const r = mergeExtraction(parse({ propositions: [{ ref: 'n_ghost' }], chains: [] }), ctx())
    expect(r.props).toEqual([])
    expect(r.dropped).toBe(1)
  })
  it('lets chains use known ids directly and drops unresolvable ones', () => {
    const r = mergeExtraction(
      parse({ propositions: [{ id: 'p1', name: 'x', statement: 'y' }], chains: [{ premises: ['n_known'], conclusion: 'p1' }, { premises: ['p9'], conclusion: 'p1' }] }),
      ctx(['n_known'])
    )
    expect(r.chains).toHaveLength(1)
    expect(r.chains[0].premises).toEqual(['n_known'])
    expect(r.dropped).toBe(1)
  })
  it('merges a chain stated twice in one reply', () => {
    const r = mergeExtraction(
      parse({ propositions: [{ id: 'p1', name: 'a', statement: 'a' }, { id: 'p2', name: 'b', statement: 'b' }, { id: 'p3', name: 'c', statement: 'c' }], chains: [{ premises: ['p1', 'p2'], conclusion: 'p3' }, { premises: ['p2', 'p1'], conclusion: 'p3' }] }),
      ctx()
    )
    expect(r.chains).toHaveLength(1)
  })
  it('keeps the valid part of a malformed reply', () => {
    const r = parse({ propositions: [{ id: 'p1', name: 'a', statement: 'a' }, { id: 'p2' }, 'boh'], chains: [{ premises: 'p1', conclusion: 'p1' }] })
    expect(r.propositions).toHaveLength(1)
    expect(r.chains).toHaveLength(0)
    expect(r.dropped).toBe(3)
  })
})

const concept = (id: string, birth: string, name: string, statement = name, notes = [birth]): Concept => ({ id, name, statement, aliases: [], birth, notes, sections: {}, depth: 0 })
const vnote = (path: string, subject: string, links: string[] = []): VaultNote => ({
  path,
  title: path.split('/').pop()!.replace('.md', ''),
  folder: '',
  tags: [],
  aliases: [],
  links: links.map((t) => ({ target: t, resolved: true })),
  headings: [],
  blockIds: [],
  subject,
  mtime: 1,
  size: 1,
  available: true
})

describe('pickCandidates', () => {
  const index: VaultIndex = {
    root: '/v',
    scannedAt: 1,
    subjects: [],
    notes: [vnote('/v/Lagrange.md', 'matematica', ['Rolle']), vnote('/v/Rolle.md', 'matematica'), vnote('/v/Limiti.md', 'matematica'), vnote('/v/Bicipite.md', 'bodybuilding'), vnote('/v/Fermat.md', 'matematica', ['Lagrange'])]
  }
  const g: GraphData = {
    extracted: {},
    chains: [],
    concepts: [
      concept('n_bic', '/v/Bicipite.md', 'Flessione del gomito', 'Il bicipite flette il gomito'),
      concept('n_lim', '/v/Limiti.md', 'Limite notevole', 'Il limite di sin x su x vale uno'),
      concept('n_der', '/v/Limiti.md', 'Derivata', 'La derivata è il limite del rapporto incrementale'),
      concept('n_fer', '/v/Fermat.md', 'Fermat', 'Un estremo interno ha derivata nulla'),
      concept('n_rol', '/v/Rolle.md', 'Rolle', 'Esiste un punto a derivata nulla'),
      concept('n_own', '/v/Lagrange.md', 'Lagrange', 'Tangente parallela alla secante')
    ]
  }
  const text = 'La derivata come limite del rapporto incrementale, e la secante.'
  it('orders own, linked, then same-subject concepts by shared words', () => {
    const ids = pickCandidates(g, index, '/v/Lagrange.md', text).map((c) => c.id)
    expect(ids.slice(0, 3)).toEqual(['n_own', 'n_rol', 'n_fer'])
    expect(ids.indexOf('n_der')).toBeLessThan(ids.indexOf('n_lim'))
    expect(ids).not.toContain('n_bic')
  })
  it('respects the cap', () => {
    expect(pickCandidates(g, index, '/v/Lagrange.md', text, 2)).toHaveLength(2)
  })
})

describe('buildExtractPrompt', () => {
  it('carries the goal, the candidates, the format and the note', () => {
    const p = buildExtractPrompt({ noteTitle: 'Teorema di Lagrange', noteText: '## 1. Enunciato\nSia f…', candidates: [concept('n_rol', '/v/Rolle.md', 'Rolle', 'Esiste un punto a derivata nulla')] })
    expect(p).toContain('n_rol | Rolle | Esiste un punto a derivata nulla')
    expect(p).toContain('"propositions"')
    expect(p).toContain('"ref"')
    expect(p).toContain('Non usare strumenti')
    expect(p).toContain('## 1. Enunciato')
    expect(p).toContain('Teorema di Lagrange')
  })
})

describe('extract prompt and LaTeX', () => {
  it('asks for doubled backslashes inside JSON strings', () => {
    expect(buildExtractPrompt({ noteTitle: 't', noteText: 'x', candidates: [] })).toContain('ogni backslash va raddoppiato (\\\\frac')
  })
})
