import { describe, expect, it } from 'vitest'
import { deriveGraph } from '../../src/main/graph/derive'
import { minimalTree, resolveGoals, treeBrief } from '../../src/main/session/minimal-tree'
import type { Memory } from '../../src/shared/memory-types'
const graph = deriveGraph({
  props: [
    { id: 'a', name: 'Base', statement: 'A', notePath: 'n', at: 1 },
    { id: 'b', name: 'Risultato', statement: 'B', notePath: 'n', at: 2 }
  ],
  chains: [{ id: 'c', premises: ['a'], conclusion: 'b', notePath: 'n', at: 3 }],
  extractions: []
})
describe('minimal tree', () => {
  it('resolves, prunes, roles and formats chains', () => {
    const goals = resolveGoals(graph, 'risultato')
    expect(goals).toEqual(['b'])
    const tree = minimalTree(graph, goals, new Map(), [], { solidDays: 14 })
    expect(tree.nodes.map((n) => [n.id, n.role])).toEqual([
      ['a', 'base'],
      ['b', 'derivata']
    ])
    expect(treeBrief(tree)).toContain('a ⇒ b')
  })

  it('prunes a solid ancestor while preserving the goal', () => {
    const memory: Memory = {
      conceptId: 'a',
      state: 'la sai',
      R: 0.9,
      due: 0,
      reps: 5,
      lapses: 0,
      lastAt: 1,
      misconception: false,
      stability: 20
    }
    const tree = minimalTree(graph, ['b'], new Map([['a', memory]]), [], { solidDays: 14 })
    expect(tree.goalIds).toEqual(['b'])
    expect(tree.nodes.map((node) => node.id)).toEqual(['b'])
    expect(tree.pruned).toEqual(['a'])
    expect(tree.chains).toEqual([])
  })

  it('falls back to deepest concepts from the selected note and marks base/derivata roles', () => {
    expect(resolveGoals(graph, 'nothing matches', 'n')).toEqual(['b'])
    const tree = minimalTree(graph, ['b'], new Map(), [], { solidDays: 14 })
    expect(tree.nodes.map((node) => [node.id, node.role])).toEqual([
      ['a', 'base'],
      ['b', 'derivata']
    ])
    expect(treeBrief(tree)).toContain('ALBERO MINIMO')
    expect(treeBrief(tree)).toContain('a ⇒ b')
  })
})
