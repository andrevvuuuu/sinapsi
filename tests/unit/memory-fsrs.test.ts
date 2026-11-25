import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatInterval, memoryOf, previewIntervals, displayedR, realClock, studyClock, studyDay, trainingLines } from '../../src/main/memory/fsrs'
import { createEmptyCard, fsrs, generatorParameters, State } from 'ts-fsrs'
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
    // T03 Regola 1: il timestamp della card usa studyClock come da contratto di replay
    const card = { ...createEmptyCard(new Date(studyClock(T0))), stability, last_review: new Date(studyClock(T0)), state: State.Review }
    for (const t of [0.5, 1, 3]) {
      expect(displayedR(card, 3, T0 + t * stability * DAY)).toBeCloseTo((1 + factor * t) ** -w20, 6)
    }
    expect(displayedR(card, 3, T0 + stability * DAY)).toBeCloseTo(0.9, 6)
  })
  it('graduates session reviews at once while ordinary Good stays in Learning', () => {
    const session = memoryOf([R(T0, 3, { via: 'session' })], T0).get('n_a')!
    expect(session.state).toBe('la sai')
    // T03 Regola 3: tetto di prima scadenza per singola riga via session (due <= at + 24h)
    expect(session.due).toBeLessThanOrEqual(T0 + DAY)
    const ordinary = memoryOf([R(T0, 3)], T0).get('n_a')!
    expect(ordinary.state).toBe('la sai')
    expect(ordinary.due).toBeLessThan(T0 + DAY)
  })
  it('knows nothing about a concept never reviewed', () => {
    expect(memoryOf([], T0).get('n_a')).toBeUndefined()
  })
  it('derives the practice lens from all received lines without changing FSRS fields', () => {
    const practice = R(T0 + DAY, 3, { via: 'practice', correct: true, rung: 0 })
    const lines = [
      R(T0, 3),
      practice,
      R(T0 + DAY + 60_000, 3, { via: 'practice', correct: true, rung: 0 })
    ]
    const memory = memoryOf(lines, T0 + DAY + 2 * 60_000).get('n_a')!
    const replayOnly = memoryOf(trainingLines(lines), T0 + DAY + 2 * 60_000).get('n_a')!

    expect(memory.procedural).toEqual({ independent: false, lastPracticeAt: lines[2].at, lastOutcome: true })
    expect(replayOnly.procedural).toEqual({ independent: false, lastPracticeAt: practice.at, lastOutcome: true })
    expect(memory.state).toBe(replayOnly.state)
    expect(memory.R).toBe(replayOnly.R)
    expect(memory.due).toBe(replayOnly.due)
    expect(memory.stability).toBe(replayOnly.stability)
  })
  it('remembers well right after a good review, and forgets with time', () => {
    // T03 Regola 2: due Good a 10 min nello stesso studyDay vedono la seconda ignorata dal replay.
    // Due review su giorni diversi consentono il passaggio di stato con 2 reps.
    const reviews = [R(T0, 3), R(T0 + DAY, 3)]
    const now = memoryOf(reviews, T0 + DAY + 700_000).get('n_a')!
    expect(now.state).toBe('la sai')
    expect(now.R).toBeGreaterThan(0.9)
    expect(now.due).toBeGreaterThan(T0 + DAY + 700_000)
    expect(now.reps).toBe(2)
    // Con stabilità più alta dovuta a 2 review distanziate, il decadimento sotto 0.6 richiede ~240 giorni
    const later = memoryOf(reviews, T0 + DAY + 240 * DAY).get('n_a')!
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
    // T03 Regola 2: la card si consolida in Review con review su giorni distinti prima che Again conti come lapse
    const m = memoryOf([R(T0, 3), R(T0 + DAY, 3), R(T0 + 5 * DAY, 1)], T0 + 5 * DAY).get('n_a')!
    expect(m.lapses).toBe(1)
  })
  it('flags a misconception when the last answer was wrong and sure', () => {
    expect(memoryOf([R(T0, 1, { correct: false, confidence: 80 })], T0).get('n_a')!.misconception).toBe(true)
    expect(memoryOf([R(T0, 1, { correct: false, confidence: 63 })], T0).get('n_a')!.misconception).toBe(true)
    expect(memoryOf([R(T0, 1, { correct: false, confidence: 62 })], T0).get('n_a')!.misconception).toBe(false)
    expect(memoryOf([R(T0, 1, { correct: false, confidence: 30 })], T0).get('n_a')!.misconception).toBe(false)
    expect(memoryOf([R(T0, 1, { correct: false, confidence: 80 }), R(T0 + DAY, 3, { correct: true, confidence: 80 })], T0 + DAY).get('n_a')!.misconception).toBe(false)
  })
  it('keeps concepts apart', () => {
    const m = memoryOf([R(T0, 3), { conceptId: 'n_b', at: T0, grade: 1 }], T0)
    expect(m.size).toBe(2)
  })
})

describe('FSRS replay contract (T03)', () => {
  it('studyDay adotta il rollover alle 04:00 locali', () => {
    const origTz = process.env.TZ
    process.env.TZ = 'Europe/Rome'
    try {
      // In Europe/Rome (UTC+1 il 27 ottobre):
      // 03:59:59 locale = 02:59:59 UTC -> giorno 26
      const beforeRollover = new Date('2026-10-27T02:59:59Z').getTime()
      // 04:00:00 locale = 03:00:00 UTC -> giorno 27
      const atRollover = new Date('2026-10-27T03:00:00Z').getTime()

      expect(studyDay(beforeRollover)).toBe('2026-10-26')
      expect(studyDay(atRollover)).toBe('2026-10-27')
    } finally {
      process.env.TZ = origTz
    }
  })

  it('(a) due Good a 40 min di distanza a cavallo di 00:00 UTC nello stesso giorno locale non fanno crescere S oltre il singolo Good', () => {
    const origTz = process.env.TZ
    process.env.TZ = 'Europe/Rome'
    try {
      // 2026-11-18T23:40:00Z = 00:40 locale del 19/11 (Rome UTC+1)
      // 2026-11-19T00:20:00Z = 01:20 locale del 19/11 (Rome UTC+1)
      // Entrambi prima delle 04:00 -> stesso studyDay '2026-11-18'
      const t1 = new Date('2026-11-18T23:40:00Z').getTime()
      const t2 = new Date('2026-11-19T00:20:00Z').getTime()
      expect(studyDay(t1)).toBe(studyDay(t2))

      const single = memoryOf([R(t1, 3)], t2).get('n_a')!
      const double = memoryOf([R(t1, 3), R(t2, 3)], t2).get('n_a')!

      expect(double.stability).toBe(single.stability)
    } finally {
      process.env.TZ = origTz
    }
  })

  it('(b) due Good lo stesso giorno di studio producono stesso S e stessa due del singolo Good', () => {
    const t1 = new Date('2026-10-27T10:00:00Z').getTime()
    const t2 = t1 + 3 * 3_600_000 // 3 ore dopo, stesso studyDay
    expect(studyDay(t1)).toBe(studyDay(t2))

    const single = memoryOf([R(t1, 3)], t2).get('n_a')!
    const double = memoryOf([R(t1, 3), R(t2, 3)], t2).get('n_a')!

    expect(double.stability).toBe(single.stability)
    expect(double.due).toBe(single.due)
    expect(double.reps).toBe(single.reps)
    expect(double.state).toBe(single.state)
    expect(double.R).toBe(single.R)
    expect(double.lastGrade).toBe(single.lastGrade)
  })

  it('(c) Good poi Again nello stesso giorno di studio applica l’Again', () => {
    const t1 = new Date('2026-10-27T10:00:00Z').getTime()
    const t2 = t1 + 3 * 3_600_000 // stesso giorno
    expect(studyDay(t1)).toBe(studyDay(t2))

    const single = memoryOf([R(t1, 3)], t2).get('n_a')!
    const withAgain = memoryOf([R(t1, 3), R(t2, 1)], t2).get('n_a')!

    expect(withAgain.reps).toBe(2)
    expect(withAgain.stability!).toBeLessThan(single.stability!)
    expect(withAgain.lastGrade).toBe(1)
  })

  it('(d) singola riga via session ha due <= at + 24h senza toccare S ed R', () => {
    const t = new Date('2026-10-27T10:00:00Z').getTime()
    const mem = memoryOf([R(t, 3, { via: 'session' })], t).get('n_a')!

    expect(mem.due).toBeLessThanOrEqual(t + 24 * 3_600_000)
    expect(mem.state).toBe('la sai')
    expect(mem.stability).toBeGreaterThan(0)
    expect(mem.R).toBeCloseTo(1, 1)
  })

  it('(e) trainingLines è coerente con replay ed esclude duplicati same-day salvo un Again', () => {
    const t1 = new Date('2026-10-27T10:00:00Z').getTime()
    const t2 = t1 + 3_600_000 // stesso giorno, Good -> ignorato
    const t3 = t1 + 2 * 3_600_000 // stesso giorno, Again -> ammesso (max 1)
    const t4 = t1 + 3 * 3_600_000 // stesso giorno, Again -> ignorato (secondo Again)
    const t5 = t1 + DAY // giorno successivo -> ammesso

    const raw: ReviewLine[] = [
      R(t1, 3),
      R(t2, 3),
      R(t3, 1),
      R(t4, 1),
      R(t5, 3)
    ]

    const filtered = trainingLines(raw)
    expect(filtered).toHaveLength(3)
    expect(filtered.map((r) => r.at)).toEqual([t1, t3, t5])

    // Coerenza: memoryOf con raw produce lo stesso risultato di memoryOf con filtered
    const memRaw = memoryOf(raw, t5 + DAY).get('n_a')!
    const memFiltered = memoryOf(filtered, t5 + DAY).get('n_a')!

    expect(memRaw).toEqual(memFiltered)
    expect(memRaw.stability).toBe(memFiltered.stability)
    expect(memRaw.due).toBe(memFiltered.due)
    expect(memRaw.reps).toBe(memFiltered.reps)
    expect(memRaw.lapses).toBe(memFiltered.lapses)
  })

  it('misconception in memoryOf legge ReviewLine.misconception o debolezza attiva', () => {
    // last.misconception === true anche con confidence bassa
    expect(memoryOf([R(T0, 1, { misconception: true, confidence: 20 })], T0).get('n_a')!.misconception).toBe(true)
    // debolezza attiva sul concetto
    expect(memoryOf([R(T0, 3)], T0, new Set(['n_a'])).get('n_a')!.misconception).toBe(true)
    // nessuna debolezza né flag né confidenza alta -> false
    expect(memoryOf([R(T0, 1, { confidence: 20 })], T0).get('n_a')!.misconception).toBe(false)
  })

  it('realClock inverts studyClock roundtrip', () => {
    const t = new Date('2026-10-27T14:30:00Z').getTime()
    expect(realClock(studyClock(t))).toBe(t)
  })

  it('same-day rule handles Again followed by Again (extra Again applied) and third Again ignored', () => {
    const t1 = new Date('2026-10-27T10:00:00Z').getTime()
    const t2 = t1 + 30 * 60_000 // stesso giorno: Again in più ammesso
    const t3 = t1 + 60 * 60_000 // stesso giorno: secondo Again in più ignorato
    const lines = [R(t1, 1), R(t2, 1), R(t3, 1)]
    const applied = trainingLines(lines)
    expect(applied).toHaveLength(2)
    expect(applied.map((r) => r.at)).toEqual([t1, t2])
    const mem = memoryOf(lines, t3).get('n_a')!
    expect(mem.reps).toBe(2)
  })

  it('same-day rule ignores Good review following an Again on the same studyDay', () => {
    const t1 = new Date('2026-10-27T10:00:00Z').getTime()
    const t2 = t1 + 30 * 60_000 // stesso giorno: Good ignorato
    const lines = [R(t1, 1), R(t2, 3)]
    const applied = trainingLines(lines)
    expect(applied).toHaveLength(1)
    expect(applied[0].at).toBe(t1)
    const mem = memoryOf(lines, t2).get('n_a')!
    expect(mem.reps).toBe(1)
    expect(mem.state).toBe('debole')
  })

  it('first due date cap applies only to single session review and not multi-review concepts', () => {
    const t1 = new Date('2026-10-27T10:00:00Z').getTime()
    const t2 = t1 + 2 * DAY // giorno diverso, seconda review di sessione
    const single = memoryOf([R(t1, 3, { via: 'session' })], t1).get('n_a')!
    expect(single.due).toBeLessThanOrEqual(t1 + 24 * 3_600_000)

    const multi = memoryOf([R(t1, 3, { via: 'session' }), R(t2, 3, { via: 'session' })], t2).get('n_a')!
    // Con 2 review lo stato avanza e la scadenza supera le 24h
    expect(multi.due).toBeGreaterThan(t2 + 24 * 3_600_000)
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
