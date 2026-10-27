import { describe, expect, it, vi } from 'vitest'
import { makeReviewHandlers } from '../../src/main/ipc-handlers'
import type { ReviewService } from '../../src/main/memory/review'
import { settingsSchema } from '../../src/shared/settings-schema'

function setup() {
  const svc: ReviewService = {
    plan: vi.fn(async () => ({ items: [], due: 0 })),
    grade: vi.fn(async () => ({ verdict: 'ok' as const, feedback: 'x', proposed: 3 as const })),
    record: vi.fn(async () => ({}) as never),
    memory: vi.fn(async () => ({})),
    intervals: vi.fn(async () => ({}) as never)
  }
  return { svc, h: makeReviewHandlers(svc) }
}

describe('review handlers', () => {
  it('passes plan options through', async () => {
    const { h, svc } = setup()
    await h.plan({ conceptIds: ['n_a'] })
    expect(svc.plan).toHaveBeenCalledWith({ conceptIds: ['n_a'] })
    await h.plan(undefined)
    expect(svc.plan).toHaveBeenLastCalledWith({})
    await expect(h.plan({ conceptIds: 'n_a' })).rejects.toThrow()
  })
  it('accepts only real grades and confidences', async () => {
    const { h } = setup()
    await expect(h.record({ conceptId: 'n_a', at: 1, grade: 5 })).rejects.toThrow()
    await expect(h.record({ conceptId: 'n_a', at: 1, grade: 3, confidence: 120 })).rejects.toThrow()
    await expect(h.record({ conceptId: 'n_a', at: 1, grade: 3, confidence: 70 })).resolves.toBeDefined()
  })
  it('limits the answer sent for grading', async () => {
    const { h } = setup()
    await expect(h.grade({ conceptId: 'n_a', exercise: { type: 'open', prompt: 'p', answer: 'a' }, answer: 'x'.repeat(10_001), confidence: 50 })).rejects.toThrow()
    await expect(h.grade({ conceptId: 'n_a', exercise: { type: 'open', prompt: 'p', answer: 'a' }, answer: 'mia risposta', confidence: 50 })).resolves.toMatchObject({ verdict: 'ok' })
  })
})

describe('review settings', () => {
  it('defaults to twelve concepts and every exercise type, and keeps at least one type', () => {
    const s = settingsSchema('/x').parse({})
    expect(s.reviewSessionSize).toBe(12)
    expect(s.exerciseTypes).toHaveLength(10)
    expect(settingsSchema('/x').parse({ exerciseTypes: [] }).exerciseTypes).toHaveLength(10)
    expect(settingsSchema('/x').parse({ exerciseTypes: ['mc', 'boh'] }).exerciseTypes).toHaveLength(10)
    expect(settingsSchema('/x').parse({ exerciseTypes: ['mc'] }).exerciseTypes).toEqual(['mc'])
  })
})
