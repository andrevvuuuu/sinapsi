import { describe, expect, it } from 'vitest'
import {
  GUESS_CONFIDENCE,
  MISCONCEPTION_CONFIDENCE,
  gradeFromOutcome,
  proposeGrade,
  sessionGrade,
  type Outcome
} from '../../src/shared/memory-types'

describe('memory constants', () => {
  it('defines the unified confidence thresholds', () => {
    expect(MISCONCEPTION_CONFIDENCE).toBe(63)
    expect(GUESS_CONFIDENCE).toBe(25)
  })
})

describe('gradeFromOutcome (tabella unica dei voti)', () => {
  const table: [{ outcome: Outcome; assisted?: boolean; confidence?: number }, number, string][] = [
    // wrong, dontKnow, partial always return 1 (Again), regardless of assisted or confidence
    [{ outcome: 'wrong' }, 1, 'wrong → 1'],
    [{ outcome: 'wrong', assisted: true }, 1, 'wrong assisted → 1'],
    [{ outcome: 'wrong', confidence: 90 }, 1, 'wrong high confidence → 1'],
    [{ outcome: 'dontKnow' }, 1, 'dontKnow → 1'],
    [{ outcome: 'dontKnow', assisted: true }, 1, 'dontKnow assisted → 1'],
    [{ outcome: 'dontKnow', confidence: 10 }, 1, 'dontKnow low confidence → 1'],
    [{ outcome: 'partial' }, 1, 'partial → 1'],
    [{ outcome: 'partial', assisted: true }, 1, 'partial assisted → 1'],
    [{ outcome: 'partial', confidence: 95 }, 1, 'partial high confidence → 1'],

    // correct && (assisted || confidence < GUESS_CONFIDENCE) → 2 (Hard)
    [{ outcome: 'correct', assisted: true }, 2, 'correct assisted → 2'],
    [{ outcome: 'correct', assisted: true, confidence: 90 }, 2, 'correct assisted even with high confidence → 2'],
    [{ outcome: 'correct', confidence: 0 }, 2, 'correct confidence 0 < 25 → 2'],
    [{ outcome: 'correct', confidence: -10 }, 2, 'correct negative confidence < 25 → 2'],
    [{ outcome: 'correct', confidence: 12 }, 2, 'correct confidence 12 (Tiro a indovinare) → 2'],
    [{ outcome: 'correct', confidence: 24 }, 2, 'correct confidence 24 < 25 → 2'],
    [{ outcome: 'correct', confidence: 24.9 }, 2, 'correct float confidence 24.9 < 25 → 2'],

    // correct without assistance and confidence >= GUESS_CONFIDENCE (or undefined) → 3 (Good)
    [{ outcome: 'correct' }, 3, 'correct unaided without confidence → 3'],
    [{ outcome: 'correct', assisted: false }, 3, 'correct assisted=false without confidence → 3'],
    [{ outcome: 'correct', confidence: 25 }, 3, 'correct confidence 25 (boundary) → 3'],
    [{ outcome: 'correct', confidence: 25.1 }, 3, 'correct float confidence 25.1 >= 25 → 3'],
    [{ outcome: 'correct', confidence: 37 }, 3, 'correct confidence 37 (Non sono sicuro) → 3'],
    [{ outcome: 'correct', confidence: 63 }, 3, 'correct confidence 63 (Abbastanza sicuro) → 3'],
    [{ outcome: 'correct', confidence: 88 }, 3, 'correct confidence 88 (Sicurissimo) → 3'],
    [{ outcome: 'correct', confidence: 100 }, 3, 'correct confidence 100 → 3'],

    // Fallback on illegal/unexpected outcome values → 1
    [{ outcome: 'unexpected' as unknown as Outcome }, 1, 'illegal outcome defaults to 1']
  ]

  it.each(table)('%s (%s) → %i', (input, expected) => {
    const grade = gradeFromOutcome(input)
    expect(grade).toBe(expected)
    // Easy (4) is never returned automatically
    expect(grade).not.toBe(4)
  })
})

describe('sessionGrade (wrapper su gradeFromOutcome)', () => {
  it('maps verdicts to gradeFromOutcome', () => {
    expect(sessionGrade({ verdict: 'correct' })).toBe(3)
    expect(sessionGrade({ verdict: 'correct', hintsUsed: 0 })).toBe(3)
    expect(sessionGrade({ verdict: 'correct', hintsUsed: 1 })).toBe(2)
    expect(sessionGrade({ verdict: 'correct', hintsUsed: 3 })).toBe(2)
    expect(sessionGrade({ verdict: 'partial', hintsUsed: 0 })).toBe(1)
    expect(sessionGrade({ verdict: 'partial', hintsUsed: 2 })).toBe(1)
    expect(sessionGrade({ verdict: 'incorrect', hintsUsed: 0 })).toBe(1)
    expect(sessionGrade({ verdict: 'incorrect', hintsUsed: 1 })).toBe(1)
  })
})

describe('proposeGrade (wrapper su gradeFromOutcome)', () => {
  it('maps review results to gradeFromOutcome', () => {
    // Correct & sure (confidence >= 25)
    expect(proposeGrade({ correct: true, confidence: 80 })).toBe(3)
    expect(proposeGrade({ correct: true, confidence: 60 })).toBe(3)
    expect(proposeGrade({ correct: true, confidence: 25 })).toBe(3)

    // Correct but guess (confidence < 25)
    expect(proposeGrade({ correct: true, confidence: 24 })).toBe(2)
    expect(proposeGrade({ correct: true, confidence: 12 })).toBe(2)

    // Partial is now 1
    expect(proposeGrade({ correct: 'partial', confidence: 90 })).toBe(1)
    expect(proposeGrade({ correct: 'partial', confidence: 20 })).toBe(1)

    // Wrong or dontKnow is 1
    expect(proposeGrade({ correct: false, confidence: 90 })).toBe(1)
    expect(proposeGrade({ correct: false, confidence: 50, dontKnow: true })).toBe(1)
    expect(proposeGrade({ correct: true, confidence: 90, dontKnow: true })).toBe(1)
  })
})
