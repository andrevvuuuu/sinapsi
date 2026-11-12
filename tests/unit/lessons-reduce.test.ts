import { describe, it, expect } from 'vitest'
import { pendingDigest, reduceLessons } from '../../src/main/lessons/reduce'
import type { LessonEntry } from '../../src/shared/lesson-types'
const entry = (at = '2026-01-01T00:00:00.000Z'): LessonEntry => ({
  id: '00000000-0000-4000-8000-000000000001',
  schema: 1,
  date: '2026-01-01',
  courseId: 'c',
  topic: 't',
  prerequisites: [],
  core8020: [],
  pacerType: 'C',
  conceptIds: [],
  confusionQuestions: [],
  activeMisconceptions: [],
  masteryLevel: 'unknown',
  highYieldResources: [],
  digest: { digest: at, recall24h: null, weekly: null },
  createdAt: at,
  updatedAt: at
})
describe('lesson reducer', () => {
  it('tracks digest deadlines and excludes archived entries', () => {
    const e = entry()
    expect(pendingDigest(e, Date.parse(e.createdAt))).toBeNull()
    expect(pendingDigest({ ...e, digest: { ...e.digest, digest: null } }, 0)).toBe('digest')
    expect(pendingDigest(e, Date.parse(e.createdAt) + 86400000)).toBe('recall24h')
    expect(
      pendingDigest(
        { ...e, digest: { ...e.digest, recall24h: e.createdAt } },
        Date.parse(e.createdAt) + 7 * 86400000
      )
    ).toBe('weekly')
    expect(
      reduceLessons([
        { t: 'lesson-created', at: e.createdAt, entry: e },
        { t: 'lesson-archived', at: e.updatedAt, id: e.id }
      ])
    ).toEqual([])
  })
})
