import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatInterval, memoryOf, previewIntervals, displayedR } from '../../src/main/memory/fsrs'
import { createEmptyCard, fsrs, generatorParameters, Rating, State } from 'ts-fsrs'
import { memoryStore } from '../../src/main/memory/store'
import type { ReviewLine } from '../../src/shared/memory-types'

const T0 = new Date('2026-10-27T10:00:00Z').getTime()
const DAY = 86_400_000
const R = (at: number, grade: 1 | 2 | 3 | 4, extra: Partial<ReviewLine> = {}): ReviewLine => ({ conceptId: 'n_a', at, grade, ...extra })

describe('memoryOf', () => {
  it('uses the scheduler FSRS-6 curve with fractional elapsed days', () => {
    const sched = fsrs(generatorParameters({ enable_fuzz: false }))
    const w20 = sched.parameters.w[20]
    const factor = 0.9 ** (-1 / w20) - 1
    const stability = 5
    const card = { ...createEmptyCard(new Date(T0)), stability, last_review: new Date(T0), state: State.Review }
    for (const t of [0.5, 1, 3]) {
      expect(displayedR(card, 3, T0 + t * stability * DAY)).toBeCloseTo((1 + factor * t) ** -w20, 6)
    }
    expect(displayedR(card, 3, T0 + stability * DAY)).toBeCloseTo(0.9, 6)
  })
  it('graduates session reviews at once while ordinary Good stays in Learning', () => {
    const session = memoryOf([R(T0, 3, { via: 'session' })], T0).get('n_a')!
    expect(session.state).toBe('la sai')
    expect(session.due).toBeCloseTo(T0 + 2 * DAY, -4)
    const ordinary = memoryOf([R(T0, 3)], T0).get('n_a')!
    expect(ordinary.state).toBe('la sai')
    expect(ordinary.due).toBeLessThan(T0 + DAY)
  })
  it('knows nothing about a concept never reviewed', () => {
    expect(memoryOf([], T0).get('n_a')).toBeUndefined()
  })
  it('remembers well right after a good review, and forgets with time', () => {
    const reviews = [R(T0, 3), R(T0 + 600_000, 3)]
    const now = memoryOf(reviews, T0 + 700_000).get('n_a')!
    expect(now.state).toBe('la sai')
    expect(now.R).toBeGreaterThan(0.9)
    expect(now.due).toBeGreaterThan(T0 + 700_000)
    expect(now.reps).toBe(2)
    const later = memoryOf(reviews, T0 + 120 * DAY).get('n_a')!
    expect(later.R).toBeLessThan(0.6)
    expect(later.state).toBe('debole')
  })
  it('is the same whatever the order of the lines', () => {
    const lines = [R(T0, 3), R(T0 + DAY, 1), R(T0 + 2 * DAY, 3)]
    const a = memoryOf(lines, T0 + 3 * DAY).get('n_a')
    const b = memoryOf([lines[2], lines[0], lines[1]], T0 + 3 * DAY).get('n_a')
    expect(b).toEqual(a)
  })
  it('counts a lapse after a success', () => {
    const m = memoryOf([R(T0, 3), R(T0 + 600_000, 3), R(T0 + 5 * DAY, 1)], T0 + 5 * DAY).get('n_a')!
    expect(m.lapses).toBe(1)
  })
  it('flags a misconception when the last answer was wrong and sure', () => {
    expect(memoryOf([R(T0, 1, { correct: false, confidence: 80 })], T0).get('n_a')!.misconception).toBe(true)
    expect(memoryOf([R(T0, 1, { correct: false, confidence: 30 })], T0).get('n_a')!.misconception).toBe(false)
    expect(memoryOf([R(T0, 1, { correct: false, confidence: 80 }), R(T0 + DAY, 3, { correct: true, confidence: 80 })], T0 + DAY).get('n_a')!.misconception).toBe(false)
  })
  it('keeps concepts apart', () => {
    const m = memoryOf([R(T0, 3), { conceptId: 'n_b', at: T0, grade: 1 }], T0)
    expect(m.size).toBe(2)
  })
})

describe('intervals', () => {
  it('previews four increasing intervals in Italian', () => {
    const p = previewIntervals([], T0)
    expect(Object.keys(p)).toEqual(['1', '2', '3', '4'])
    expect(p[1]).toMatch(/min/)
    expect(previewIntervals([R(T0, 3), R(T0 + 600_000, 3)], T0 + 3 * DAY)[4]).toMatch(/giorni|mesi/)
  })
  it('formats durations', () => {
    expect(formatInterval(10 * 60_000)).toBe('10 min')
    expect(formatInterval(DAY)).toBe('1 giorno')
    expect(formatInterval(4 * DAY)).toBe('4 giorni')
    expect(formatInterval(95 * DAY)).toBe('3 mesi')
    expect(formatInterval(2 * 3_600_000)).toBe('2 ore')
  })
})

describe('memoryStore', () => {
  it('appends and reads reviews', async () => {
    const s = memoryStore(await mkdtemp(join(tmpdir(), 'sinapsi-mem-')))
    await s.append(R(T0, 3))
    expect(await s.read()).toEqual([R(T0, 3)])
  })
})
