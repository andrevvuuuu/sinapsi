import { describe, expect, it } from 'vitest'
import { examClass, retrievabilityAt } from '../../src/shared/retention'
import type { Memory } from '../../src/shared/memory-types'

const memory = (patch: Partial<Memory> = {}): Memory => ({ conceptId: 'c', state: 'la sai', R: 1, due: null, reps: 4, lapses: 0, lastAt: 1_000, misconception: false, stability: 10, ...patch })

describe('exam retention', () => {
  it('uses fractional days and classifies retention', () => {
    expect(retrievabilityAt(memory(), 1_000)).toBeCloseTo(1)
    expect(examClass(memory(), 1_000)).toBe('solid')
    expect(examClass(memory({ reps: 2 }), 1_000)).toBe('faded')
  })
  it('prioritizes unseen and misconception states', () => {
    expect(examClass(memory({ reps: 0, lastAt: null }), 1_000)).toBe('unseen')
    expect(examClass(memory({ misconception: true }), 1_000)).toBe('misconception')
    expect(retrievabilityAt(memory({ stability: undefined }), 1_000)).toBeNull()
  })
})
