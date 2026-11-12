import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildWeekPlan } from '../../src/main/planner/plan'
import type { ExamEntry } from '../../src/shared/exam-types'
import type { LessonEntry } from '../../src/shared/lesson-types'
import { settingsSchema } from '../../src/shared/settings-schema'

const date = '2026-11-12'
afterEach(() => vi.useRealTimers())
const exam = (courseId: string, days = 30): ExamEntry => ({
  id: crypto.randomUUID(), courseId, date: '2026-12-12', weight: 0.5,
  createdAt: `${date}T12:00:00.000Z`, updatedAt: `${date}T12:00:00.000Z`
})
const lesson = (courseId: string, id: string, masteryLevel: LessonEntry['masteryLevel'] = 'unknown', examWeight = 0.5): LessonEntry => ({
  id, schema: 1, date, courseId, topic: id, prerequisites: [], core8020: [], pacerType: 'C', conceptIds: [id],
  confusionQuestions: [], activeMisconceptions: [], masteryLevel, highYieldResources: [],
  digest: { digest: null, recall24h: null, weekly: null }, examWeight,
  createdAt: `${date}T12:00:00.000Z`, updatedAt: `${date}T12:00:00.000Z`
})
const input = (overrides: Partial<Parameters<typeof buildWeekPlan>[0]> = {}): Parameters<typeof buildWeekPlan>[0] => ({
  today: date, exams: [], lessons: [], memories: {}, studyHours: [3, 3, 3, 3, 3, 2, 1], buffer: 0.15, ...overrides
})

describe('buildWeekPlan', () => {
  it('uses weekday availability, subtracts buffer and leaves zero-hour days empty', () => {
    const plan = buildWeekPlan(input({ today: '2026-11-16', exams: [exam('A')], studyHours: [1, 2, 3, 4, 5, 6, 0] }))
    expect(plan.days[0].minutes).toBe(60)
    expect(plan.days[0].bufferMinutes).toBe(9)
    expect(plan.days[0].blocks.reduce((sum, block) => sum + block.minutes, 0)).toBe(51)
    expect(plan.days[6].minutes).toBe(0)
    expect(plan.days[6].blocks).toEqual([])
  })

  it('uses a maximum of two 30-minute blocks and interleaves three courses', () => {
    const plan = buildWeekPlan(input({ exams: [exam('A'), exam('B'), exam('C')], lessons: [lesson('A','a'), lesson('B','b'), lesson('C','c')], studyHours: Array(7).fill(3) }))
    expect(plan.days.every((day) => day.blocks.length <= 2)).toBe(true)
    expect(plan.days.every((day) => day.blocks.every((block) => block.minutes >= 30))).toBe(true)
    expect(plan.days[0].blocks).toHaveLength(2)
    for (const course of ['A', 'B', 'C']) expect(plan.days.filter((day) => day.blocks.some((block) => block.courseId === course)).length).toBeLessThan(7)
    const twoCourseHours = (hoursPerDay: number): number[] => {
      const hours = Array(7).fill(0)
      hours[(new Date(2026, 10, 12, 12).getDay() + 6) % 7] = hoursPerDay
      return hours
    }
    const twoCourses = [exam('A'), exam('B')]
    expect(buildWeekPlan(input({ exams: twoCourses, studyHours: twoCourseHours(1) })).days[0].blocks).toHaveLength(1)
    expect(buildWeekPlan(input({ exams: twoCourses, studyHours: twoCourseHours(1.5) })).days[0].blocks).toHaveLength(2)
  })

  it('selects the phase at 20 and 10 day boundaries and simulates inside ten days', () => {
    const forDate = (today: string, examDate: string): string => {
      const hours = Array(7).fill(0)
      const [year, month, day] = today.split('-').map(Number)
      hours[(new Date(year, month - 1, day, 12).getDay() + 6) % 7] = 2
      return buildWeekPlan(input({ today, exams: [{ ...exam('A'), date: examDate }], studyHours: hours })).days[0].blocks[0]?.phase
    }
    expect(forDate('2026-11-12', '2026-12-03')).toBe('fondamenta')
    expect(forDate('2026-11-12', '2026-11-22')).toBe('pratica')
    expect(forDate('2026-11-12', '2026-11-21')).toBe('simulazioni')
    expect(forDate('2026-11-12', '2026-11-20')).toBe('simulazioni')
    const hours = Array(7).fill(0)
    hours[(new Date(2026, 10, 12, 12).getDay() + 6) % 7] = 2
    const sim = buildWeekPlan(input({ today: date, exams: [{ ...exam('A'), date: '2026-11-20' }], lessons: [lesson('A','a')], studyHours: hours })).days[0].blocks[0]
    expect(sim.kind).toBe('exam-sim')
    expect(sim.conceptIds).toEqual(['a'])
  })

  it('orders pending digest lessons before unknown weighted lessons and includes pending-only courses', () => {
    const lessons = [
      lesson('Solo', 'later'),
      lesson('A', 'low', 'unknown', 0.1),
      {
        ...lesson('A', 'high', 'unknown', 0.9),
        digest: { digest: '2026-11-12T20:00:00.000Z', recall24h: '2026-11-13T20:00:00.000Z', weekly: null }
      },
      {
        ...lesson('A', 'medium', 'unknown', 0.4),
        digest: { digest: '2026-10-01T12:00:00.000Z', recall24h: '2026-10-02T12:00:00.000Z', weekly: '2026-10-10T12:00:00.000Z' }
      }
    ]
    const hours = Array(7).fill(0)
    hours[(new Date(2026, 10, 12, 12).getDay() + 6) % 7] = 2
    const plan = buildWeekPlan(input({ lessons, studyHours: hours }))
    expect(plan.days[0].blocks.map((block) => block.courseId)).toContain('Solo')
    const a = plan.days[0].blocks.find((block) => block.courseId === 'A')
    expect(a?.lessonIds).toEqual(['low', 'high', 'medium'])
  })

  it('places partial lessons after the unknown mastery sprint', () => {
    const completed = (entry: LessonEntry): LessonEntry => ({
      ...entry,
      digest: { digest: '2026-10-01T12:00:00.000Z', recall24h: '2026-10-02T12:00:00.000Z', weekly: '2026-10-10T12:00:00.000Z' }
    })
    const lessons = [completed(lesson('A', 'partial', 'partial', 1)), completed(lesson('A', 'unknown', 'unknown', 0.6))]
    const plan = buildWeekPlan(input({ exams: [exam('A')], lessons, studyHours: [3, 3, 3, 3, 3, 2, 1] }))
    expect(plan.days[0].blocks[0]?.lessonIds).toEqual(['unknown', 'partial'])
  })

  it('evaluates pending digestions against each planned local date, not the wall clock', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-02T12:00:00.000Z'))
    const completedDigest = {
      ...lesson('Solo', 'digest'),
      digest: { digest: '2026-11-11T10:00:00.000Z', recall24h: null, weekly: null }
    }
    const plan = buildWeekPlan(input({ lessons: [completedDigest] }))
    expect(plan.days[0].blocks[0]?.courseId).toBe('Solo')
    expect(plan.days[0].blocks[0]?.reason).toBe('1 digestioni in sospeso')
  })
})

describe('planner settings', () => {
  it('defaults availability and buffer and catches out-of-range values', () => {
    const schema = settingsSchema('/home')
    const defaults = schema.parse({})
    expect(defaults.studyHours).toEqual([3, 3, 3, 3, 3, 2, 1])
    expect(defaults.planBuffer).toBe(0.15)
    const damaged = schema.parse({ studyHours: [22], planBuffer: 0.5 })
    expect(damaged.studyHours).toEqual([3, 3, 3, 3, 3, 2, 1])
    expect(damaged.planBuffer).toBe(0.15)
  })
})
