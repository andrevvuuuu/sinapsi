import { describe, expect, it } from 'vitest'
import { proceduralLens } from '../../src/shared/procedural'

const BASE_TIME = new Date(2026, 10, 3, 10).getTime()

function createLine(conceptId: string, at: number, via: string, correct: boolean, rung: number) {
  return { conceptId, at, grade: 1, via, correct, rung }
}

describe('proceduralLens', () => {
  it('ignores lines without via practice', () => {
    const lines = [
      createLine('concept-1', BASE_TIME, 'review', true, 0),
      createLine('concept-2', BASE_TIME + 1000, 'practice', true, 0)
    ]
    const map = proceduralLens(lines)
    expect(map.has('concept-1')).toBe(false)
    expect(map.has('concept-2')).toBe(true)
  })

  it('lastPracticeAt and lastOutcome come from the most recent practice line', () => {
    const lines = [
      createLine('concept-1', BASE_TIME, 'practice', false, 0),
      createLine('concept-1', BASE_TIME + 5000, 'practice', true, 0)
    ]
    const map = proceduralLens(lines)
    const lens = map.get('concept-1')!
    expect(lens.lastPracticeAt).toBe(BASE_TIME + 5000)
    expect(lens.lastOutcome).toBe(true)
  })

  it('two correct rung-0 lines on the same day -> independent false', () => {
    const lines = [
      createLine('concept-1', BASE_TIME, 'practice', true, 0),
      createLine('concept-1', BASE_TIME + 1000, 'practice', true, 0)
    ]
    const map = proceduralLens(lines)
    const lens = map.get('concept-1')!
    expect(lens.independent).toBe(false)
  })

  it('two correct rung-0 lines on two different days -> independent true', () => {
    const day2Time = BASE_TIME + 86400000 // 24 hours later
    const lines = [
      createLine('concept-1', BASE_TIME, 'practice', true, 0),
      createLine('concept-1', day2Time, 'practice', true, 0)
    ]
    const map = proceduralLens(lines)
    const lens = map.get('concept-1')!
    expect(lens.independent).toBe(true)
  })

  it('correct lines with rung 2 do not count toward independent', () => {
    const day2Time = BASE_TIME + 86400000 // 24 hours later
    const lines = [
      createLine('concept-1', BASE_TIME, 'practice', true, 0),
      createLine('concept-1', day2Time, 'practice', true, 2)
    ]
    const map = proceduralLens(lines)
    const lens = map.get('concept-1')!
    expect(lens.independent).toBe(false)
  })
})
