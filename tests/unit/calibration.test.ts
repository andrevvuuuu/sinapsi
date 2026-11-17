import { describe, expect, it } from 'vitest'
import {
  calibrationByLevel,
  calibrationLine,
  calibrationOf,
  calibrationTrend,
  firstReviewAgainRate
} from '../../src/shared/calibration'

const item = (self: number, ai: number, max = 10) => ({ id: 'e', max, self, ai })

describe('calibration', () => {
  it('measures the bias per problem and the totals in thirtieths', () => {
    const c = calibrationOf([item(10, 6), item(8, 8), item(7.5, 5.5)])
    expect(c).toEqual({ n: 3, selfTotal: 26, aiTotal: 20, bias: 2, absError: 2 })
    expect(calibrationLine(c)).toBe('Ti sei sopravvalutato di 2 punti in media a esercizio.')
  })
  it('says underestimated, calibrated, or calibrated only on average', () => {
    expect(calibrationLine(calibrationOf([item(5, 6), item(4, 5)]))).toBe(
      'Ti sei sottovalutato di 1 punto in media a esercizio.'
    )
    expect(calibrationLine(calibrationOf([item(5, 5), item(4, 4.5)]))).toBe(
      'Ben calibrato: il tuo voto coincide con la correzione.'
    )
    expect(calibrationLine(calibrationOf([item(9, 6), item(3, 6)]))).toBe(
      'In media ben calibrato, ma sul singolo esercizio sbagli di 3 punti.'
    )
    expect(calibrationLine(calibrationOf([]))).toBe('Nessun esercizio da confrontare.')
    expect(calibrationLine({ n: 1, bias: -1.5, absError: 1.5 })).toBe(
      'Ti sei sottovalutato di 1,5 punti in media a esercizio.'
    )
  })
  it('the trend weighs every problem of every exam once', () => {
    const c = calibrationTrend([
      { id: 'a', topic: 'A', at: 1, items: [item(10, 4)] },
      { id: 'b', topic: 'B', at: 2, items: [item(6, 6), item(6, 6)] }
    ])
    expect(c).toMatchObject({ n: 3, bias: 2 })
  })

  it('groups review calibration by the four confidence levels', () => {
    const reviews = [
      { conceptId: 'a', at: 1, grade: 3 as const, confidence: 20, correct: true },
      { conceptId: 'b', at: 2, grade: 1 as const, confidence: 45, correct: false },
      { conceptId: 'c', at: 3, grade: 3 as const, confidence: 63, correct: true },
      { conceptId: 'd', at: 4, grade: 1 as const, confidence: 90, correct: false }
    ]
    expect(calibrationByLevel(reviews)).toEqual([
      { level: 12, n: 1, correctRate: 1 },
      { level: 37, n: 1, correctRate: 0 },
      { level: 63, n: 1, correctRate: 1 },
      { level: 88, n: 1, correctRate: 0 }
    ])
  })

  it('compares the first Again after a session review with concepts without session reviews', () => {
    const reviews = [
      { conceptId: 'session', at: 1, grade: 3 as const, via: 'session' as const },
      { conceptId: 'session', at: 2, grade: 1 as const },
      { conceptId: 'session', at: 3, grade: 3 as const },
      { conceptId: 'plain', at: 1, grade: 1 as const }
    ]
    expect(firstReviewAgainRate(reviews)).toEqual({
      afterSession: { n: 1, againRate: 1 },
      noSession: { n: 1, againRate: 1 }
    })
  })
})
