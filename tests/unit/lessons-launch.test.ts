import { it, expect } from 'vitest'
import { resolveLessonLaunch } from '../../src/main/lessons/launch'
import type { LessonEntry } from '../../src/shared/lesson-types'
const base: LessonEntry = {
  id: '00000000-0000-4000-8000-000000000001',
  schema: 1,
  date: '2026-01-01',
  courseId: 'c',
  topic: 't',
  prerequisites: [],
  core8020: [],
  pacerType: 'C',
  conceptIds: ['a', 'b'],
  confusionQuestions: [],
  activeMisconceptions: [],
  masteryLevel: 'unknown',
  highYieldResources: [],
  digest: {
    digest: '2026-01-01T00:00:00.000Z',
    recall24h: '2026-01-02T00:00:00.000Z',
    weekly: '2026-01-09T00:00:00.000Z'
  },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
}
it('chooses due concepts only and limits practice to lesson concepts', () => {
  expect(
    resolveLessonLaunch(
      base,
      {
        a: {
          conceptId: 'a',
          state: 'debole',
          R: 0.2,
          due: 10,
          reps: 1,
          lapses: 0,
          lastAt: null,
          misconception: false
        },
        b: {
          conceptId: 'b',
          state: 'debole',
          R: 0.2,
          due: 200,
          reps: 1,
          lapses: 0,
          lastAt: null,
          misconception: false
        }
      },
      100
    )
  ).toEqual({ kind: 'review', conceptIds: ['a'] })
  const r = resolveLessonLaunch({ ...base, conceptIds: ['b', 'a'] }, {}, 100, 'practice', 'source')
  expect(
    r.kind === 'practice' && r.material.conceptIds.every((x) => base.conceptIds.includes(x))
  ).toBe(true)
})
