import { describe, expect, it } from 'vitest'
import { confusableSiblings } from '../../src/shared/siblings'
import type { GraphData } from '../../src/shared/graph-types'

function makeGraph(): GraphData {
  const concepts: GraphData['concepts'] = [
    { id: 'chosen', name: 'Chosen', statement: '', aliases: [], birth: 'note-a', notes: ['note-a'], sections: {}, depth: 2 },
    { id: 'same-birth', name: 'Same birth', statement: '', aliases: [], birth: 'note-a', notes: ['note-a'], sections: {}, depth: 2 },
    { id: 'shared-premise', name: 'Shared premise', statement: '', aliases: [], birth: 'note-b', notes: ['note-b'], sections: {}, depth: 3 },
    { id: 'other-conclusion', name: 'Other conclusion', statement: '', aliases: [], birth: 'note-c', notes: ['note-c'], sections: {}, depth: 3 },
    { id: 'premise-one', name: 'Premise one', statement: '', aliases: [], birth: 'note-d', notes: ['note-d'], sections: {}, depth: 1 },
    { id: 'premise-two', name: 'Premise two', statement: '', aliases: [], birth: 'note-e', notes: ['note-e'], sections: {}, depth: 1 }
  ]
  return {
    concepts,
    chains: [
      { id: 'chain-one', premises: ['premise-one'], conclusion: 'chosen', notes: [] },
      { id: 'chain-two', premises: ['premise-one', 'premise-two'], conclusion: 'shared-premise', notes: [] },
      { id: 'chain-three', premises: ['premise-one'], conclusion: 'other-conclusion', notes: [] }
    ],
    extracted: {},
    retired: [],
    dormant: []
  }
}

describe('confusableSiblings', () => {
  it('returns same-birth concepts and never returns chosen ids', () => {
    const result = confusableSiblings(makeGraph(), ['chosen', 'same-birth'])

    expect(result.get('chosen')).toContain('other-conclusion')
    expect(result.get('chosen')).not.toContain('chosen')
    expect(result.get('chosen')).not.toContain('same-birth')
  })

  it('ranks a concept sharing a chain premise above a same-birth-only concept', () => {
    const graph = makeGraph()
    graph.chains = graph.chains.filter((chain) => chain.conclusion !== 'other-conclusion')

    expect(confusableSiblings(graph, ['chosen'], 2).get('chosen')).toEqual([
      'shared-premise',
      'same-birth'
    ])
  })

  it('limits the number of siblings per concept', () => {
    expect(confusableSiblings(makeGraph(), ['chosen'], 1).get('chosen')).toHaveLength(1)
  })

  it('omits chosen ids that are missing from the graph', () => {
    expect(confusableSiblings(makeGraph(), ['missing'])).not.toHaveProperty('missing')
  })

  it('returns deterministic results', () => {
    const graph = makeGraph()

    expect(confusableSiblings(graph, ['chosen', 'same-birth'])).toEqual(
      confusableSiblings(graph, ['chosen', 'same-birth'])
    )
  })
})
