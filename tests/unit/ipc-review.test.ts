import { describe, expect, it, vi } from 'vitest'
import { makeReviewHandlers, resolveOtherEngine } from '../../src/main/ipc-handlers'
import type { ReviewService } from '../../src/main/memory/review'
import { settingsSchema } from '../../src/shared/settings-schema'

function setup() {
  const svc: ReviewService = {
    plan: vi.fn(async () => ({ items: [], due: 0, toStudy: [] })),
    prerequisites: vi.fn(async () => []),
    contest: vi.fn(async () => ({ verdict: 'ok' as const, feedback: 'x', proposed: 3 as const })),
    prepare: vi.fn(async () => {}),
    explain: vi.fn(async () => ({ kind: 'verdict' as const, verdict: 'ok' as const, feedback: 'x', proposed: 3 as const })),
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
  it('passes the exam date and the gain order through to the plan', async () => {
    const { h, svc } = setup()
    await h.plan({ order: 'gain', examAt: 1_800_000_000_000 })
    expect(svc.plan).toHaveBeenLastCalledWith({ order: 'gain', examAt: 1_800_000_000_000 })
    await expect(h.plan({ order: 'random' })).rejects.toThrow()
  })
  it('accepts a «Spiega la catena» result: checked idea units or a skip', async () => {
    const { h, svc } = setup()
    await h.record({ conceptId: 'n_a', at: 1, type: 'chain', checked: [true, false] })
    expect(svc.record).toHaveBeenLastCalledWith({ conceptId: 'n_a', at: 1, type: 'chain', checked: [true, false] })
    await h.record({ conceptId: 'n_a', at: 1, type: 'chain', record: false })
    expect(svc.record).toHaveBeenLastCalledWith({ conceptId: 'n_a', at: 1, type: 'chain', record: false })
    await expect(h.record({ conceptId: 'n_a', at: 1, type: 'chain', checked: 'tutti' })).rejects.toThrow()
  })
  it('limits the answer sent for grading', async () => {
    const { h } = setup()
    await expect(h.grade({ conceptId: 'n_a', exercise: { type: 'open', prompt: 'p', answer: 'a' }, answer: 'x'.repeat(10_001), confidence: 50 })).rejects.toThrow()
    await expect(h.grade({ conceptId: 'n_a', exercise: { type: 'open', prompt: 'p', answer: 'a' }, answer: 'mia risposta', confidence: 50 })).resolves.toMatchObject({ verdict: 'ok' })
  })
  it('forwards prerequisites requests with validated id and budget', async () => {
    const { h, svc } = setup()
    await h.prerequisites('concept-1', 5)
    expect(svc.prerequisites).toHaveBeenCalledWith('concept-1', 5)
    await expect(h.prerequisites('', 5)).rejects.toThrow()
    await expect(h.prerequisites('concept-1', -1)).rejects.toThrow()
    await expect(h.prerequisites('concept-1', 2.5)).rejects.toThrow()
  })
  it('forwards contest requests and validates bounds', async () => {
    const { h, svc } = setup()
    const validReq = {
      conceptId: 'concept-1',
      exercise: { type: 'open' as const, prompt: 'p', answer: 'a' },
      answer: 'my contest answer',
      confidence: 75
    }
    await h.contest(validReq)
    expect(svc.contest).toHaveBeenCalledWith(validReq)
    await expect(h.contest({ ...validReq, answer: 'x'.repeat(10_001) })).rejects.toThrow()
    await expect(h.contest({ ...validReq, confidence: -1 })).rejects.toThrow()
    await expect(h.contest({ ...validReq, confidence: 101 })).rejects.toThrow()
  })
  it('accepts contested flag in ReviewLine records', async () => {
    const { h, svc } = setup()
    await h.record({ conceptId: 'n_a', at: 1, grade: 3, contested: true })
    expect(svc.record).toHaveBeenCalledWith(expect.objectContaining({ conceptId: 'n_a', contested: true }))
    await h.record({ conceptId: 'n_a', at: 1, grade: 3, contested: false })
    expect(svc.record).toHaveBeenCalledWith(expect.objectContaining({ conceptId: 'n_a', contested: false }))
  })
})

describe('resolveOtherEngine', () => {
  it('resolves alternative engine based on settings', () => {
    const defaultSettings = settingsSchema('/x').parse({})
    // Default teach=claude, grade=claude -> other is agy
    expect(resolveOtherEngine(defaultSettings)).toEqual({
      engine: 'agy',
      model: 'gemini-3.8-flash-medium'
    })

    // Both agy -> other is claude
    const bothAgy = {
      ...defaultSettings,
      engines: {
        ...defaultSettings.engines,
        teach: { engine: 'agy' as const, model: 'gemini-3.8-flash-medium' },
        grade: { engine: 'agy' as const, model: 'gemini-3.8-flash-medium' }
      }
    }
    expect(resolveOtherEngine(bothAgy)).toEqual({
      engine: 'claude',
      model: 'sonnet'
    })

    // Different: teach=claude, grade=agy -> returns grade
    const diff = {
      ...defaultSettings,
      engines: {
        ...defaultSettings.engines,
        teach: { engine: 'claude' as const, model: 'sonnet' },
        grade: { engine: 'agy' as const, model: 'gemini-3.8-flash-high' }
      }
    }
    expect(resolveOtherEngine(diff)).toEqual({
      engine: 'agy',
      model: 'gemini-3.8-flash-high'
    })
  })
})

describe('review settings', () => {
  it('defaults to twelve concepts and every exercise type, and keeps at least one type', () => {
    const s = settingsSchema('/x').parse({})
    expect(s.reviewSessionSize).toBe(12)
    expect(s.exerciseTypes).toHaveLength(12)
    expect(settingsSchema('/x').parse({ exerciseTypes: [] }).exerciseTypes).toHaveLength(12)
    expect(settingsSchema('/x').parse({ exerciseTypes: ['mc', 'boh'] }).exerciseTypes).toHaveLength(12)
    expect(settingsSchema('/x').parse({ exerciseTypes: ['mc'] }).exerciseTypes).toEqual(['mc'])
  })
})
