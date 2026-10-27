import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ancestors, deriveGraph } from '../../src/main/graph/derive'
import { graphStore } from '../../src/main/graph/store'
import type { ChainLine, ExtractionLine, PropLine } from '../../src/shared/graph-types'

const P = (id: string, notePath = '/v/A.md', statement = `enunciato ${id}`, name = `nome ${id}`): PropLine => ({ id, name, statement, notePath, at: 1 })
const C = (premises: string[], conclusion: string, id = `arg_${premises.join('')}${conclusion}`, notePath = '/v/A.md'): ChainLine => ({ id, premises, conclusion, notePath, at: 1 })
const E = (notePath: string, hash: string, ok = true, at = 1): ExtractionLine => ({ notePath, hash, at, reason: 'manual', nodes: 1, chains: 0, dropped: 0, ok })

describe('deriveGraph', () => {
  it('merges re-encounters of a concept', () => {
    const g = deriveGraph({ props: [P('n_a'), { ...P('n_a', '/v/B.md', 'altro modo di dirlo', 'nome nuovo'), section: '§2' }], chains: [], extractions: [] })
    expect(g.concepts).toHaveLength(1)
    const a = g.concepts[0]
    expect(a.name).toBe('nome n_a')
    expect(a.statement).toBe('enunciato n_a')
    expect(a.notes).toEqual(['/v/A.md', '/v/B.md'])
    expect(a.aliases).toEqual(['altro modo di dirlo'])
    expect(a.sections['/v/B.md']).toBe('§2')
  })
  it('merges repeated chains and unions their notes', () => {
    const g = deriveGraph({ props: [P('n_a'), P('n_b')], chains: [C(['n_a'], 'n_b', 'arg_1'), C(['n_a'], 'n_b', 'arg_2', '/v/B.md')], extractions: [] })
    expect(g.chains).toEqual([{ id: 'arg_1', premises: ['n_a'], conclusion: 'n_b', notes: ['/v/A.md', '/v/B.md'] }])
  })
  it('drops chains with unknown ids, no premises, or a self conclusion', () => {
    const g = deriveGraph({ props: [P('n_a'), P('n_b')], chains: [C(['n_x'], 'n_b'), C([], 'n_b'), C(['n_a', 'n_b'], 'n_b')], extractions: [] })
    expect(g.chains).toEqual([])
  })
  it('computes inference depth as the longest premise path', () => {
    const g = deriveGraph({ props: ['a', 'b', 'c', 'd'].map((x) => P(x)), chains: [C(['a'], 'b'), C(['b', 'c'], 'd')], extractions: [] })
    const d = Object.fromEntries(g.concepts.map((c) => [c.id, c.depth]))
    expect(d).toEqual({ a: 0, b: 1, c: 0, d: 2 })
  })
  it('survives cycles: members share a depth', () => {
    const g = deriveGraph({ props: ['a', 'b', 'c'].map((x) => P(x)), chains: [C(['a'], 'b'), C(['b'], 'a'), C(['b'], 'c')], extractions: [] })
    const d = Object.fromEntries(g.concepts.map((c) => [c.id, c.depth]))
    expect(d.a).toBe(d.b)
    expect(d.c).toBeGreaterThan(d.b)
  })
  it('lists the ancestors of a concept', () => {
    const g = deriveGraph({ props: ['a', 'b', 'c', 'd'].map((x) => P(x)), chains: [C(['a'], 'b'), C(['b', 'c'], 'd')], extractions: [] })
    expect(ancestors(g, 'd')).toEqual(new Set(['a', 'b', 'c']))
    expect(ancestors(g, 'a')).toEqual(new Set())
  })
  it('remembers the last successful extraction per note', () => {
    const g = deriveGraph({ props: [], chains: [], extractions: [E('/v/A.md', 'h1', true, 1), E('/v/A.md', 'h2', true, 2), E('/v/A.md', 'h3', false, 3)] })
    expect(g.extracted['/v/A.md']).toEqual({ hash: 'h2', at: 2 })
  })
})

describe('graphStore', () => {
  it('appends and reads back the three ledgers', async () => {
    const s = graphStore(await mkdtemp(join(tmpdir(), 'sinapsi-graph-')))
    await s.append('prop', P('n_a'))
    await s.append('chain', C(['n_a'], 'n_a'))
    await s.append('extraction', E('/v/A.md', 'h'))
    const r = await s.read()
    expect(r.props).toHaveLength(1)
    expect(r.chains).toHaveLength(1)
    expect(r.extractions[0].hash).toBe('h')
  })
})
