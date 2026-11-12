import { describe, expect, it, vi } from 'vitest'
import { makeLessonHandlers } from '../../src/main/ipc-handlers'
import type { LessonEntry, LessonEvent } from '../../src/shared/lesson-types'
import type { ReviewLine } from '../../src/shared/memory-types'

const ID = '11111111-1111-4111-8111-111111111111'
const NOW = Date.parse('2026-11-12T12:00:00.000Z')
const entry: LessonEntry = {
  id: ID,
  schema: 1,
  date: '2026-11-12',
  courseId: 'Analisi',
  topic: 'Limiti',
  sourceNote: '../outside.md',
  prerequisites: [],
  core8020: [],
  pacerType: 'C',
  conceptIds: ['c1'],
  confusionQuestions: [],
  activeMisconceptions: [],
  masteryLevel: 'unknown',
  highYieldResources: [],
  digest: { digest: null, recall24h: null, weekly: null },
  createdAt: new Date(NOW).toISOString(),
  updatedAt: new Date(NOW).toISOString()
}

function setup(reviews: ReviewLine[] = []) {
  const events: LessonEvent[] = [{ t: 'lesson-created', at: entry.createdAt, entry }]
  const append = vi.fn(async (event: LessonEvent) => {
    events.push(event)
  })
  const createPractice = vi.fn(async () => 'practice-1')
  const retryPractice = vi.fn()
  const h = makeLessonHandlers({
    read: async () => events,
    append,
    now: () => NOW,
    uuid: () => ID,
    memory: async () => ({}),
    reviews: async () => reviews,
    readNote: async () => 'outside text',
    vaultRoot: async () => '/vault',
    createPractice,
    retryPractice,
    validConceptIds: async () => new Set(['c1'])
  })
  return { h, events, append, createPractice, retryPractice }
}

describe('computed lesson fields', () => {
  it('returns independent practice concepts on get and list', async () => {
    const reviews: ReviewLine[] = [1, 2].map((day) => ({ conceptId: 'c1', at: Date.UTC(2026, 10, day, 12), grade: 3, correct: true, via: 'practice', rung: 0 }))
    const { h } = setup(reviews)
    expect((await h.get(ID)).independentConceptIds).toEqual(['c1'])
    expect((await h.list())[0].independentConceptIds).toEqual(['c1'])
  })
})

describe('lesson IPC handlers', () => {
  it('validates input and rejects concepts absent from the catalog', async () => {
    const { h } = setup()
    await expect(h.create({})).rejects.toThrow()
    await expect(
      h.create({
        date: entry.date,
        courseId: entry.courseId,
        topic: entry.topic,
        prerequisites: [],
        core8020: [],
        pacerType: 'C',
        conceptIds: ['foreign'],
        confusionQuestions: [],
        activeMisconceptions: [],
        masteryLevel: 'unknown',
        highYieldResources: []
      })
    ).rejects.toThrow('concetti non presenti')
  })

  it('ignores source notes outside the vault and writes a launch event', async () => {
    const { h, events, createPractice } = setup()
    expect(await h.launch(ID, 'practice')).toEqual({ view: 'practice', id: 'practice-1' })
    expect(createPractice).toHaveBeenCalledWith(
      expect.objectContaining({ conceptIds: ['c1'], free: '' })
    )
    expect(events.at(-1)).toMatchObject({ t: 'session-launched', id: ID, mode: 'practice' })
  })

  it('returns disabled without writing a launch event', async () => {
    const { h, events } = setup()
    events[0] = { t: 'lesson-created', at: entry.createdAt, entry: { ...entry, conceptIds: [] } }
    const disabled = await h.launch(ID, 'review')
    expect(disabled).toEqual({
      kind: 'disabled',
      reason: 'Nessun concetto della lezione è disponibile per il ripasso'
    })
    expect(events.some((event) => event.t === 'session-launched')).toBe(false)
  })
})
