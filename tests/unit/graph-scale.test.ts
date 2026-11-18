import { describe, expect, it } from 'vitest'
import { aggregate, drillDown, orphans, shouldAggregate } from '../../src/renderer/src/graph/model'
import { warmUp } from '../../src/renderer/src/graph/layout'
import type { GraphData } from '../../src/shared/graph-types'
import type { VaultIndex } from '../../src/shared/vault-types'

const concept = (id: string, birth: string, depth = 0) => ({
  id, name: id.toUpperCase(), statement: id, aliases: [], birth, notes: [birth], sections: {}, depth
})
const graph: GraphData = {
  concepts: [concept('a', '/Users/x/vault/Matematica/one.md'), concept('b', '/Users/x/vault/Matematica/two.md', 1), concept('c', '/Users/x/vault/Biologia/three.md'), concept('d', '/Users/x/vault/solo.md')],
  chains: [
    { id: 'ab', premises: ['a'], conclusion: 'b', notes: [] },
    { id: 'bc', premises: ['b'], conclusion: 'c', notes: [] }
  ],
  extracted: {}, retired: ['old'], dormant: ['sleep']
}

const index: VaultIndex = { root: '/Users/x/vault', scannedAt: 1, subjects: [], notes: [
  ...['one.md', 'two.md'].map((name) => ({ path: `/Users/x/vault/Matematica/${name}`, title: name, folder: 'Matematica', tags: [], aliases: [], headings: [], blockIds: [], subject: 'matematica', mtime: 1, size: 1, available: true, links: [] })),
  { path: '/Users/x/vault/Biologia/three.md', title: 'three', folder: 'Biologia', tags: [], aliases: [], headings: [], blockIds: [], subject: 'biologia', mtime: 1, size: 1, available: true, links: [] },
  { path: '/Users/x/vault/solo.md', title: 'solo', folder: '', tags: [], aliases: [], headings: [], blockIds: [], subject: null, mtime: 1, size: 1, available: true, links: [] }
] }
const subjectOf = (path: string): string | null => index.notes.find((note) => note.path === path)?.subject ?? null

describe('graph scale helpers', () => {
  it('warms in slices, reports completion and stops on abort', async () => {
    const layout = { warmup: 20, tick: (n: number) => { ticks += n } } as never
    let ticks = 0
    const progress: number[] = []
    await warmUp(layout, { maxTicks: 20, budgetMs: 1, onProgress: (p) => progress.push(p) })
    expect(ticks).toBe(20)
    expect(progress.at(-1)).toBe(1)

    ticks = 0
    const controller = new AbortController()
    const aborted = warmUp(layout, { maxTicks: 100_000, budgetMs: 1, signal: controller.signal })
    controller.abort()
    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' })
    expect(ticks).toBeLessThan(100_000)
  })

  it('aggregates by subject and note and counts crossing chains', () => {
    expect(shouldAggregate(400)).toBe(true)
    expect(shouldAggregate(399)).toBe(false)
    const result = aggregate(graph, undefined, 'subject', subjectOf)
    expect(result.clusters.map((c) => c.id)).toEqual(['subject:matematica', 'subject:biologia', 'subject:—'])
    expect(result.links).toEqual([{ from: 'subject:matematica', to: 'subject:biologia', count: 1 }])
    expect(aggregate(graph, undefined, 'note', subjectOf).clusters[0]).toMatchObject({ id: 'note:/Users/x/vault/Matematica/one.md', label: 'one' })
  })

  it('drills into a cluster and retains retired and dormant identifiers', () => {
    const subgraph = drillDown(graph, 'subject:matematica', 'subject', subjectOf)
    expect(subgraph.concepts.map((c) => c.id)).toEqual(['a', 'b'])
    expect(subgraph.chains.map((c) => c.id)).toEqual(['ab'])
    expect(subgraph.retired).toEqual(['old'])
    expect(subgraph.dormant).toEqual(['sleep'])
  })

  it('lists isolated and depth-zero concepts with no outgoing use, in stable order', () => {
    expect(orphans(graph)).toEqual([
      { id: 'd', reason: 'isolated' },
      { id: 'c', reason: 'no-outgoing' }
    ])
  })
})
