import { describe, expect, it } from 'vitest'
import { suspectPremises, weakPrerequisites } from '../../src/shared/cascade'

describe('weakPrerequisites', () => {
  const input = {
    parents: { goal: ['mid', 'root', 'solid'], mid: ['root'], root: ['goal', 'unseen'] },
    depth: { goal: 3, mid: 2, root: 1, unseen: 0, solid: 1 },
    memory: {
      goal: { R: 0.2, stability: 1 }, mid: { R: 0.2, stability: 1 },
      root: { R: 0.2, stability: 1 }, unseen: undefined,
      solid: { R: 0.99, stability: 30 }
    }
  }
  it('orders by depth and excludes never-seen and solid concepts', () => {
    expect(weakPrerequisites(input, 'goal')).toEqual(['root', 'mid'])
  })
  it('is cycle-safe and respects the cap', () => {
    expect(weakPrerequisites(input, 'goal', { cap: 1 })).toEqual(['root'])
  })
})

describe('suspectPremises', () => {
  it('finds unseen or weak concepts with at least two struggling descendants', () => {
    const concepts = ['p', 'a', 'b'].map((id) => ({ id, name: id, statement: id, aliases: [], birth: '', notes: [], sections: {}, depth: 0 }))
    const graph = { concepts, chains: [{ id: '1', premises: ['p'], conclusion: 'a', notes: [] }, { id: '2', premises: ['p'], conclusion: 'b', notes: [] }], extracted: {}, retired: [], dormant: [] }
    const mem = new Map([['a', { conceptId: 'a', state: 'debole' as const, R: 0.2, due: null, reps: 3, lapses: 1, lastAt: 1, misconception: false }], ['b', { conceptId: 'b', state: 'debole' as const, R: 0.2, due: null, reps: 3, lapses: 0, lastAt: 1, misconception: true }]])
    expect(suspectPremises(graph, mem)).toEqual(['p'])
  })
})
