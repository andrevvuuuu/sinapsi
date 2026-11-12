import { describe, expect, it, vi } from 'vitest'
import { makeExamHandlers } from '../../src/main/ipc-handlers'
import type { ExamEvent } from '../../src/shared/exam-types'

const ID = '11111111-1111-4111-8111-111111111111'
function setup() {
  const events: ExamEvent[] = []
  const append = vi.fn(async (event: ExamEvent) => { events.push(event) })
  const handlers = makeExamHandlers({ read: async () => events, append, now: () => Date.parse('2026-11-12T12:00:00Z'), uuid: () => ID })
  return { handlers, events, append }
}

describe('exam handlers', () => {
  it('validates, creates, updates, archives, and hides archived exams from list', async () => {
    const { handlers, events } = setup()
    await expect(handlers.create({ courseId:'A', date:'bad' })).rejects.toThrow()
    await expect(handlers.create({ courseId:'A', date:'2026-11-20', unknown:true })).rejects.toThrow()
    const entry = await handlers.create({ courseId:'A', title:'Parziale', date:'2026-11-20', weight:0.8 })
    expect(entry.date).toBe('2026-11-20')
    await expect(handlers.update(ID, { date:'not-a-date' })).rejects.toThrow()
    await handlers.update(ID, { title:'Scritto' })
    expect((await handlers.list())[0].title).toBe('Scritto')
    await handlers.archive(ID)
    expect(await handlers.list()).toEqual([])
    expect(events.map((event) => event.t)).toEqual(['exam-created','exam-updated','exam-archived'])
  })
})
