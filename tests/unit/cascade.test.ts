import { describe, expect, it } from 'vitest'
import { weakPrerequisites } from '../../src/shared/cascade'

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
