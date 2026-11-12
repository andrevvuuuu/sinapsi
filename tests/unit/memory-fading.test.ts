import { describe, expect, it } from 'vitest'
import { independentConcepts } from '../../src/main/memory/fading'
import type { ReviewLine } from '../../src/shared/memory-types'

const line = (at: number, patch: Partial<ReviewLine> = {}): ReviewLine => ({ conceptId: 'c1', at, grade: 3, correct: true, via: 'practice', rung: 0, ...patch })
describe('independentConcepts', () => {
  it('requires two local calendar days of correct rung-zero practice', () => {
    expect(independentConcepts([line(Date.UTC(2026, 0, 1, 10)), line(Date.UTC(2026, 0, 2, 10))])).toEqual(new Set(['c1']))
    expect(independentConcepts([line(Date.UTC(2026, 0, 1, 10)), line(Date.UTC(2026, 0, 1, 12))])).toEqual(new Set())
    expect(independentConcepts([line(Date.UTC(2026, 0, 1), { rung: undefined }), line(Date.UTC(2026, 0, 2), { rung: undefined })])).toEqual(new Set())
    expect(independentConcepts([line(Date.UTC(2026, 0, 1), { rung: 1 }), line(Date.UTC(2026, 0, 2), { rung: 1 })])).toEqual(new Set())
    expect(independentConcepts([line(Date.UTC(2026, 0, 1), { correct: false }), line(Date.UTC(2026, 0, 2), { correct: false })])).toEqual(new Set())
  })
})
