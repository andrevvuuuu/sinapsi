import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPracticeRunner } from '../../src/main/practice/runner'
import { memoryStore, weaknessStore, type MemoryStore, type WeaknessStore } from '../../src/main/memory/store'
import type { PracticeTurn } from '../../src/shared/practice-protocol'

describe('T15 — Practice Triage, Confidence & Discrimination', () => {
  let dir: string
  let mem: MemoryStore
  let weaknesses: WeaknessStore

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sinapsi-t15-'))
    mem = memoryStore(join(dir, 'm'))
    weaknesses = weaknessStore(join(dir, 'w'))
  })

  function createTestRunner(
    turns: PracticeTurn[],
    options: {
      siblings?: (ids: string[]) => Promise<{ targetId: string; siblingId: string; targetName: string; siblingName: string }[]>
      targetDetails?: (ids: string[]) => Promise<{ id: string; name: string; statement: string }[]>
    } = {}
  ) {
    const turnsQueue = [...turns]
    const converse = vi.fn(async (req: { conversationId: string; schema: { parse(x: unknown): unknown } }) => {
      const t = turnsQueue.shift()
      if (!t) throw new Error('nessun turno')
      return { data: req.schema.parse(t), conversationId: req.conversationId, engine: 'claude' as const }
    })
    const onUpdate = vi.fn()
    const runner = createPracticeRunner({
      bridge: { converse, ask: vi.fn() } as never,
      dir: join(dir, 'p'),
      material: async () => 'CONCETTI SCELTI\nn_1 | Rolle\nn_2 | Lagrange',
      topic: async () => 'Rolle, Lagrange',
      memory: mem,
      weaknesses,
      siblings: options.siblings,
      targetDetails: options.targetDetails,
      onUpdate,
      now: () => 1000
    })
    return { runner, converse, onUpdate }
  }

  describe('Triage eligibility gating (proceduralLens)', () => {
    it('is inactive when chosen concepts have never been practiced procedurally', async () => {
      const { runner } = createTestRunner([
        { phase: 'warmup', blocks: [], problem: { id: 'p1', statement: 'Es 1', mode: 'recall', targets: ['n_1'], modelSolution: 'Sol' } }
      ])
      const id = await runner.create({ conceptIds: ['n_1'], sourceIds: [], free: '' })
      await runner.retry(id)
      const state = await runner.get(id)
      expect(state.triageEligible).toBe(false)
      expect(state.problems[0].triageActive).toBe(false)
      await expect(runner.submit(id, { kind: 'triage', text: 'Teorema di Rolle' })).rejects.toThrow(
        /il triage non è attivo/
      )
    })

    it('is inactive when at least one chosen concept failed its last procedural practice', async () => {
      // n_1 had success, but n_2 had failure in its last practice review
      await mem.append({ conceptId: 'n_1', at: 10, grade: 3, correct: true, via: 'practice', ref: 'r1' })
      await mem.append({ conceptId: 'n_2', at: 10, grade: 3, correct: true, via: 'practice', ref: 'r2' })
      await mem.append({ conceptId: 'n_2', at: 20, grade: 1, correct: false, via: 'practice', ref: 'r3' })

      const { runner } = createTestRunner([
        { phase: 'warmup', blocks: [], problem: { id: 'p1', statement: 'Es 1', mode: 'recall', targets: ['n_1', 'n_2'], modelSolution: 'Sol' } }
      ])
      const id = await runner.create({ conceptIds: ['n_1', 'n_2'], sourceIds: [], free: '' })
      await runner.retry(id)
      const state = await runner.get(id)
      expect(state.triageEligible).toBe(false)
      expect(state.problems[0].triageActive).toBe(false)
    })

    it('is active when every chosen concept has procedural lastOutcome === true', async () => {
      await mem.append({ conceptId: 'n_1', at: 10, grade: 3, correct: true, via: 'practice', ref: 'r1' })
      await mem.append({ conceptId: 'n_2', at: 20, grade: 3, correct: true, via: 'practice', ref: 'r2' })

      const { runner } = createTestRunner([
        { phase: 'warmup', blocks: [], problem: { id: 'p1', statement: 'Es 1', mode: 'recall', targets: ['n_1'], modelSolution: 'Sol' } }
      ])
      const id = await runner.create({ conceptIds: ['n_1', 'n_2'], sourceIds: [], free: '' })
      await runner.retry(id)
      const state = await runner.get(id)
      expect(state.triageEligible).toBe(true)
      expect(state.problems[0].triageActive).toBe(true)
    })

    it('is inactive for free topic without concepts', async () => {
      const { runner } = createTestRunner([
        { phase: 'warmup', blocks: [], problem: { id: 'p1', statement: 'Es 1', mode: 'recall', targets: [], modelSolution: 'Sol' } }
      ])
      const id = await runner.create({ conceptIds: [], sourceIds: [], free: 'tema libero' })
      await runner.retry(id)
      const state = await runner.get(id)
      expect(state.triageEligible).toBe(false)
      expect(state.problems[0].triageActive).toBe(false)
    })
  })

  describe('Triage submission lifecycle', () => {
    beforeEach(async () => {
      await mem.append({ conceptId: 'n_1', at: 10, grade: 3, correct: true, via: 'practice', ref: 'r1' })
    })

    it('allows submitting triage before first attempt without invoking tutor turn', async () => {
      const { runner, converse } = createTestRunner([
        { phase: 'warmup', blocks: [], problem: { id: 'p1', statement: 'Es 1', mode: 'recall', targets: ['n_1'], modelSolution: 'Sol' } },
        { phase: 'warmup', blocks: [{ type: 'text', md: 'Ottima scelta di strumento.' }] }
      ])
      const id = await runner.create({ conceptIds: ['n_1'], sourceIds: [], free: '' })
      await runner.retry(id) // poses p1

      expect(converse).toHaveBeenCalledTimes(1) // only initial problem pose

      // Learner submits triage
      await runner.submit(id, { kind: 'triage', text: 'Teorema di Rolle' })

      // Tutor is NOT invoked yet; awaiting remains 'learner'
      expect(converse).toHaveBeenCalledTimes(1)
      const s = await runner.get(id)
      expect(s.awaiting).toBe('learner')
      expect(s.problems[0].triage).toBe('Teorema di Rolle')

      // Cannot submit triage a second time on same problem
      await expect(runner.submit(id, { kind: 'triage', text: 'Lagrange' })).rejects.toThrow(
        /hai già indicato uno strumento/
      )

      // Learner now submits first thinking attempt
      await runner.submit(id, { kind: 'thinking', text: 'applico Rolle su [a, b]' })
      expect(converse).toHaveBeenCalledTimes(2)

      // Tutor receives formatted triage context in first thinking prompt
      const callPrompt = (converse.mock.calls[1][0] as { prompt: string }).prompt
      expect(callPrompt).toContain('Strumento ipotizzato nel triage: Teorema di Rolle')
      expect(callPrompt).toContain('Il mio ragionamento: applico Rolle su [a, b]')
    })

    it('rejects triage submission after an attempt has already been made', async () => {
      const { runner } = createTestRunner([
        { phase: 'warmup', blocks: [], problem: { id: 'p1', statement: 'Es 1', mode: 'recall', targets: ['n_1'], modelSolution: 'Sol' } },
        { phase: 'warmup', blocks: [{ type: 'text', md: 'Spiegazione.' }] }
      ])
      const id = await runner.create({ conceptIds: ['n_1'], sourceIds: [], free: '' })
      await runner.retry(id)

      await runner.submit(id, { kind: 'thinking', text: 'provo senza triage' })
      await expect(runner.submit(id, { kind: 'triage', text: 'Rolle' })).rejects.toThrow(
        /solo prima del primo tentativo/
      )
    })
  })

  describe('Confidence recording in ReviewLine', () => {
    it('records confidence in ReviewLine on unaided solve and applies guess downgrade for confidence < 25', async () => {
      const { runner } = createTestRunner([
        { phase: 'warmup', blocks: [], problem: { id: 'p1', statement: 'Es 1', mode: 'recall', targets: ['n_1'], modelSolution: 'Sol' } },
        { phase: 'warmup', blocks: [], conclude: { outcome: 'solved', verdict: 'Bravo.', retest: false } }
      ])
      const id = await runner.create({ conceptIds: ['n_1'], sourceIds: [], free: '' })
      await runner.retry(id)

      // Send thinking with confidence 12 ("Tiro a indovinare")
      await runner.submit(id, { kind: 'thinking', text: 'f(c) = 0', confidence: 12 })

      const reviews = await mem.read()
      expect(reviews.length).toBe(1)
      expect(reviews[0]).toMatchObject({
        conceptId: 'n_1',
        confidence: 12,
        correct: true,
        // Because confidence < 25 (GUESS_CONFIDENCE), gradeFromOutcome produces 2 (Difficile) instead of 3
        grade: 2
      })
    })

    it('records high confidence in ReviewLine with grade 3 for unaided solve', async () => {
      const { runner } = createTestRunner([
        { phase: 'warmup', blocks: [], problem: { id: 'p1', statement: 'Es 1', mode: 'recall', targets: ['n_1'], modelSolution: 'Sol' } },
        { phase: 'warmup', blocks: [], conclude: { outcome: 'solved', verdict: 'Bravo.', retest: false } }
      ])
      const id = await runner.create({ conceptIds: ['n_1'], sourceIds: [], free: '' })
      await runner.retry(id)

      // Send thinking with confidence 88 ("Sicuro")
      await runner.submit(id, { kind: 'thinking', text: 'f(c) = 0', confidence: 88 })

      const reviews = await mem.read()
      expect(reviews.length).toBe(1)
      expect(reviews[0]).toMatchObject({
        conceptId: 'n_1',
        confidence: 88,
        correct: true,
        grade: 3
      })
    })
  })

  describe('Discrimination weakness detection on repeated sibling swaps (>= 2 problems)', () => {
    const siblingsMock = async () => [
      { targetId: 'n_1', siblingId: 'n_2', targetName: 'Teorema di Rolle', siblingName: 'Teorema di Lagrange' }
    ]
    const targetDetailsMock = async () => [
      { id: 'n_1', name: 'Teorema di Rolle', statement: '' },
      { id: 'n_2', name: 'Teorema di Lagrange', statement: '' }
    ]

    beforeEach(async () => {
      await mem.append({ conceptId: 'n_1', at: 10, grade: 3, correct: true, via: 'practice', ref: 'r1' })
    })

    it('does NOT create discrimination weakness on a single swap (N = 1)', async () => {
      const { runner } = createTestRunner(
        [
          { phase: 'warmup', blocks: [], problem: { id: 'p1', statement: 'Es 1', mode: 'recall', targets: ['n_1'], modelSolution: 'Sol' } },
          { phase: 'warmup', blocks: [], conclude: { outcome: 'solved', verdict: 'Fatto.', retest: false } }
        ],
        { siblings: siblingsMock, targetDetails: targetDetailsMock }
      )
      const id = await runner.create({ conceptIds: ['n_1'], sourceIds: [], free: '' })
      await runner.retry(id)

      // Problem 1: target is Rolle (n_1), learner chooses Lagrange (n_2) in triage
      await runner.submit(id, { kind: 'triage', text: 'Teorema di Lagrange' })
      await runner.submit(id, { kind: 'thinking', text: 'soluzione corretta' })

      const activeWeaknesses = await weaknesses.active()
      expect(activeWeaknesses.filter((w) => w.kind === 'discrimination')).toEqual([])
    })

    it('creates discrimination weakness when the SAME swap repeats on >= 2 problems in the session', async () => {
      const { runner } = createTestRunner(
        [
          // Problem 1
          { phase: 'warmup', blocks: [], problem: { id: 'p1', statement: 'Es 1', mode: 'recall', targets: ['n_1'], modelSolution: 'Sol 1' } },
          { phase: 'warmup', blocks: [], conclude: { outcome: 'solved', verdict: 'Bene.', retest: false } },
          // Problem 2
          { phase: 'body', blocks: [], problem: { id: 'p2', statement: 'Es 2', mode: 'recall', targets: ['n_1'], modelSolution: 'Sol 2' } },
          { phase: 'body', blocks: [], conclude: { outcome: 'solved', verdict: 'Bene anche questo.', retest: false } }
        ],
        { siblings: siblingsMock, targetDetails: targetDetailsMock }
      )
      const id = await runner.create({ conceptIds: ['n_1'], sourceIds: [], free: '' })
      await runner.retry(id)

      // Problem 1: target is n_1 (Rolle), learner chooses Lagrange
      await runner.submit(id, { kind: 'triage', text: 'Lagrange' })
      await runner.submit(id, { kind: 'thinking', text: 'provo questo' })

      let activeW = await weaknesses.active()
      expect(activeW.filter((w) => w.kind === 'discrimination')).toHaveLength(0)

      // Advance to Problem 2
      await runner.submit(id, { kind: 'next' })

      // Problem 2: target is again n_1 (Rolle), learner chooses Lagrange again
      await runner.submit(id, { kind: 'triage', text: 'Lagrange' })
      await runner.submit(id, { kind: 'thinking', text: 'provo di nuovo' })

      activeW = await weaknesses.active()
      const disc = activeW.filter((w) => w.kind === 'discrimination')
      expect(disc).toHaveLength(1)
      expect(disc[0]).toMatchObject({
        conceptId: 'n_1',
        kind: 'discrimination',
        source: 'practice',
        ref: `practice:${id}:discrimination:n_1:n_2`,
        status: 'active'
      })
      expect(disc[0].text).toContain('Teorema di Rolle')
      expect(disc[0].text).toContain('Teorema di Lagrange')
    })
  })
})
