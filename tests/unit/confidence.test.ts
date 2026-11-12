import { describe, expect, it } from 'vitest'
import { confidenceCalibration, confidenceLine } from '../../src/shared/confidence'
import type { ReviewLine } from '../../src/shared/memory-types'

const row = (id: string, at: number, confidence?: number, correct?: boolean, grade: 1 | 2 | 3 | 4 = 1): ReviewLine => ({ conceptId: id, at, grade, confidence, correct })

describe('confidence calibration', () => {
  it('ignores missing confidence and uses correct before grade', () => {
    const c = confidenceCalibration([row('a', 1, undefined), row('a', 2, 80, false, 4), row('b', 3, 20, undefined, 3)])
    expect(c.overall).toEqual({ n: 2, meanConfidence: 50, accuracy: 50, gap: 0 })
  })
  it('omits small groups and orders confident errors newest first, capped at 20', () => {
    const lines = Array.from({ length: 24 }, (_, i) => row(`c${i}`, i, 75, false))
    const grouped = confidenceCalibration([...lines, ...Array.from({ length: 4 }, (_, i) => row('small', 30 + i, 25, true))], () => 'subject')
    expect(grouped.groups[0].n).toBe(28)
    expect(grouped.confidentErrors).toHaveLength(20)
    expect(grouped.confidentErrors[0].at).toBe(23)
  })
  it('describes empty, balanced, overconfident, and underconfident results', () => {
    expect(confidenceLine({ n: 0, meanConfidence: 0, accuracy: 0, gap: 0 })).toContain('Ancora nessuna')
    expect(confidenceLine({ n: 5, meanConfidence: 55, accuracy: 50, gap: 5 })).toContain('Ben calibrato')
    expect(confidenceLine({ n: 5, meanConfidence: 80, accuracy: 60, gap: 20 })).toContain('più sicuro')
    expect(confidenceLine({ n: 5, meanConfidence: 40, accuracy: 70, gap: -30 })).toContain('più di quanto pensi')
  })
})
