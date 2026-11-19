import { describe, expect, it } from 'vitest'
import { reviewSessions } from '../../src/main/memory/history'
import type { ReviewLine } from '../../src/shared/memory-types'

const MIN = 60_000
const r = (conceptId: string, at: number, extra: Partial<ReviewLine> = {}): ReviewLine => ({ conceptId, at, grade: 3, ...extra })
const names = new Map([['a', 'Rolle'], ['b', 'Lagrange'], ['c', 'Fermat'], ['d', 'Taylor']])

describe('reviewSessions', () => {
  it('groups reviews closer than 30 minutes, newest first, leaving out practice', () => {
    const s = reviewSessions([r('a', 0), r('b', 5 * MIN), r('a', 6 * MIN), r('c', 7 * MIN, { via: 'practice' }), r('c', 120 * MIN), r('d', 125 * MIN), r('a', 126 * MIN), r('b', 127 * MIN)], names)
    expect(s).toEqual([
      { id: `r${120 * MIN}`, at: 127 * MIN, count: 4, conceptIds: ['c', 'd', 'a', 'b'], topic: 'Fermat, Taylor, Rolle e altri 1' },
      { id: 'r0', at: 6 * MIN, count: 3, conceptIds: ['a', 'b'], topic: 'Rolle, Lagrange' }
    ])
  })
  it('leaves out reviews with via: "session" as well as practice', () => {
    const s = reviewSessions([
      r('a', 0),
      r('b', 5 * MIN, { via: 'session' }),
      r('c', 6 * MIN, { via: 'review' }),
      r('d', 7 * MIN, { via: 'practice' })
    ], names)
    expect(s).toHaveLength(1)
    expect(s[0].conceptIds).toEqual(['a', 'c'])
    expect(s[0].count).toBe(2)
  })
  it('returns empty array when all reviews are practice or session', () => {
    expect(reviewSessions([r('a', 0, { via: 'practice' }), r('b', 5 * MIN, { via: 'session' })], names)).toEqual([])
  })
  it('is empty without reviews', () => {
    expect(reviewSessions([], names)).toEqual([])
  })
})
