import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createReviewService } from '../../src/main/memory/review'
import { memoryStore, type MemoryStore } from '../../src/main/memory/store'
import { variantsStore, type VariantsStore } from '../../src/main/memory/variants'
import { proposeGrade, type ReviewLine, type WeaknessLine } from '../../src/shared/memory-types'
import type { Concept, GraphData } from '../../src/shared/graph-types'
import type { VaultIndex, VaultNote } from '../../src/shared/vault-types'
import { EXERCISE_TYPES } from '../../src/shared/memory-types'

const T0 = new Date('2026-10-27T10:00:00Z').getTime()
const DAY = 86_400_000
const vnote = (title: string): VaultNote => ({ path: `/v/${title}.md`, title, folder: '', tags: [], aliases: [], links: [], headings: [], blockIds: [], subject: 'matematica', mtime: 1, size: 1, available: true })
const index: VaultIndex = { root: '/v', scannedAt: 1, subjects: [], notes: [vnote('A'), vnote('B')] }
const C = (id: string, note: string, depth = 0): Concept => ({ id, name: `nome ${id}`, statement: `enunciato ${id}`, aliases: [], birth: `/v/${note}.md`, notes: [`/v/${note}.md`], sections: {}, depth })
const graph: GraphData = { concepts: [C('a1', 'A'), C('a2', 'A', 1), C('a3', 'A', 2), C('b1', 'B'), C('b2', 'B', 1)], chains: [], extracted: {} }

/** A fake Gemini that writes, for each requested concept, one mc, one truefalse and one open. */
function variantsFor(prompt: string) {
  const ids = [...prompt.matchAll(/^(\w+) \| nome/gm)].map((m) => m[1])
  return {
    concepts: ids.map((id) => ({
      id,
      exercises: [
        { type: 'mc', prompt: `mc ${id}`, options: ['sì', 'no'], correct: 0, answer: 'sì' },
        { type: 'truefalse', prompt: `vf ${id}`, statement: 's', value: true, answer: 'vero' },
        { type: 'open', prompt: `aperta ${id}`, answer: 'risposta' }
      ]
    }))
  }
}

let dir: string
let mem: MemoryStore
let vars: VariantsStore
let types: string[]
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sinapsi-review-'))
  mem = memoryStore(dir)
  vars = variantsStore(dir)
  types = [...EXERCISE_TYPES]
})
function setup(
  ask?: ReturnType<typeof vi.fn>,
  now = () => T0 + 10 * DAY,
  size = 12,
  pacerOf?: () => Promise<Map<string, 'P' | 'A' | 'C' | 'E' | 'R'>>,
  weaknesses?: () => Promise<WeaknessLine[]>,
  graphOverride?: GraphData,
  otherEngine?: () => Promise<{ engine: 'agy' | 'claude'; model?: string } | undefined>
) {
  const bridge = {
    ask:
      ask ??
      vi.fn(async (req: { task: string; prompt: string; schema: { parse(x: unknown): unknown }; engine?: unknown }) => ({
        data: req.task === 'variants' ? req.schema.parse(variantsFor(req.prompt)) : req.schema.parse({ verdict: 'partial', feedback: 'Manca la prova.' }),
        fromCache: false,
        engine: 'agy' as const
      }))
  }
  const svc = createReviewService({
    bridge: bridge as never,
    memory: mem,
    variants: vars,
    graph: async () => graphOverride ?? graph,
    vault: async () => index,
    readNote: async () => 'testo della nota',
    settings: async () => ({ reviewSessionSize: size, exerciseTypes: types as never }),
    pacerOf,
    weaknesses,
    now,
    workDir: join(dir, 'w'),
    otherEngine
  })
  return { svc, ask: bridge.ask as ReturnType<typeof vi.fn> }
}
const review = (conceptId: string, at: number, grade: 1 | 2 | 3 | 4, extra: Partial<ReviewLine> = {}): Promise<void> => mem.append({ conceptId, at, grade, ...extra })

describe('plan', () => {
  it('puts due concepts first, most forgotten first, and unreviewed concepts go to toStudy', async () => {
    await review('b2', T0, 3)
    await review('a2', T0, 1)
    const { svc } = setup()
    const p = await svc.plan()
    expect(p.due).toBe(2)
    expect(p.items.map((i) => i.conceptId).sort()).toEqual(['a2', 'b2'])
    expect(p.items[0].R!).toBeLessThanOrEqual(p.items[1].R!)
    expect(p.toStudy.map((s) => s.conceptId)).toEqual(['a1', 'b1', 'a3'])
    expect(p.items.some((i) => ['a1', 'b1', 'a3'].includes(i.conceptId))).toBe(false)
  })
  it('caps the session at its size and puts unreviewed concepts in toStudy', async () => {
    await review('a1', T0, 1)
    await review('a2', T0, 1)
    await review('b1', T0, 1)
    const { svc } = setup(undefined, undefined, 2)
    const p = await svc.plan()
    expect(p.items).toHaveLength(2)
    expect(p.toStudy).toHaveLength(2)
    expect(p.toStudy.map((s) => s.conceptId).sort()).toEqual(['a3', 'b2'])
  })
  it('alternates notes when it can', async () => {
    await review('a1', T0, 1)
    await review('a2', T0, 1)
    await review('b1', T0, 1)
    await review('b2', T0, 1)
    const { svc } = setup()
    const notes = (await svc.plan()).items.map((i) => i.notePath)
    for (let k = 1; k < notes.length - 1; k++) expect(notes[k] === notes[k - 1] && notes[k] === notes[k + 1]).toBe(false)
  })
  it('generates variants once per note and reuses them', async () => {
    await review('a1', T0, 1)
    await review('b1', T0, 1)
    const { svc, ask } = setup()
    await svc.plan()
    expect(ask.mock.calls.filter((c) => c[0].task === 'variants')).toHaveLength(2)
    await svc.plan()
    expect(ask.mock.calls.filter((c) => c[0].task === 'variants')).toHaveLength(2)
    expect(ask.mock.calls[0][0]).toMatchObject({ timeoutMs: 300_000, cwd: join(dir, 'w') })
  })
  it('un concetto mai ripassato finisce in toStudy e non in items; weakest idem', async () => {
    await review('b2', T0, 3)
    const { svc } = setup()

    // Default plan: b2 reviewed, a1 never reviewed
    const def = await svc.plan()
    expect(def.items.map((i) => i.conceptId)).toEqual(['b2'])
    expect(def.items.some((i) => i.conceptId === 'a1')).toBe(false)
    expect(def.toStudy.map((s) => s.conceptId)).toContain('a1')
    expect(def.toStudy.find((s) => s.conceptId === 'a1')).toEqual({
      conceptId: 'a1',
      name: 'nome a1',
      noteTitle: 'A'
    })

    // Weakest plan: b2 reviewed, a1 never reviewed
    const weak = await svc.plan({ weakest: true })
    expect(weak.items.map((i) => i.conceptId)).toEqual(['b2'])
    expect(weak.items.some((i) => i.conceptId === 'a1')).toBe(false)
    expect(weak.toStudy.map((s) => s.conceptId)).toContain('a1')
  })
  it('does not generate variants for concepts in toStudy', async () => {
    const { svc, ask } = setup()
    const p = await svc.plan()
    expect(p.items).toHaveLength(0)
    expect(p.toStudy.length).toBeGreaterThan(0)
    expect(ask.mock.calls.filter((c) => c[0].task === 'variants')).toHaveLength(0)
  })
  it('falls back to a recall question when generation fails', async () => {
    const { svc } = setup(vi.fn(async () => Promise.reject(new Error('quota'))))
    const p = await svc.plan({ conceptIds: ['a1'] })
    expect(p.items[0].exercise).toEqual({ type: 'open', prompt: 'Senza guardare: che cosa dice «nome a1»?', answer: 'enunciato a1' })
    expect(p.items[0].variantId).toBeNull()
  })
  it('only uses the exercise types Andrea chose', async () => {
    types = ['truefalse']
    await review('a1', T0, 1)
    const { svc } = setup()
    const p = await svc.plan()
    expect(p.items.length).toBeGreaterThan(0)
    for (const i of p.items) expect(i.exercise.type).toBe('truefalse')
  })
  it('does not repeat a variant before the others have been asked, and changes type', async () => {
    const { svc } = setup()
    const first = (await svc.plan({ conceptIds: ['a1'] })).items[0]
    await review('a1', T0 + DAY, 3, { variantId: first.variantId!, type: first.exercise.type })
    const second = (await svc.plan({ conceptIds: ['a1'] })).items[0]
    expect(second.variantId).not.toBe(first.variantId)
    expect(second.exercise.type).not.toBe(first.exercise.type)
  })
  it('reviews exactly the concepts asked for, or the weakest when nothing is due', async () => {
    await review('a1', T0 + 9 * DAY, 3)
    await review('b1', T0 - 300 * DAY, 3)
    const { svc } = setup()
    expect((await svc.plan({ conceptIds: ['b2'] })).items.map((i) => i.conceptId)).toEqual(['b2'])
    expect((await svc.plan({ weakest: true })).items[0].conceptId).toBe('b1')
  })
  it('uses only the R PACER intersection for generation and selection', async () => {
    const { svc, ask } = setup(undefined, undefined, 12, async () => new Map([['a1', 'R']]))
    const plan = await svc.plan({ conceptIds: ['a1'] })
    expect(ask.mock.calls.filter((c) => c[0].task === 'variants')[0][0].prompt).toContain('"fill"')
    expect(['mc', 'truefalse', 'open']).toContain(plan.items[0].exercise.type)
    expect(plan.items[0].exercise.type).not.toBe('explain')
  })
  it('limits Error Clinic to active misconceptions, weakest first and session size', async () => {
    for (const id of ['a1', 'a2', 'a3']) await review(id, T0, 1, { confidence: 90, correct: false, misconception: true })
    const { svc } = setup(undefined, undefined, 2)
    const plan = await svc.plan({ misconceptions: true })
    expect(plan.items).toHaveLength(2)
    expect(plan.items.every((item) => ['a1', 'a2'].includes(item.conceptId))).toBe(true)
  })
  it('includes unreviewed concepts with active misconception or discrimination weaknesses, ordering unreviewed first', async () => {
    await review('a2', T0, 1, { confidence: 90, correct: false, misconception: true })
    await review('b2', T0, 1, { confidence: 90, correct: false, misconception: true })
    const activeWeaknesses: WeaknessLine[] = [
      { id: 'w1', conceptId: 'a1', text: 'err a1', kind: 'misconception', source: 'practice', at: T0, status: 'active' },
      { id: 'w2', conceptId: 'b1', text: 'err b1', kind: 'discrimination', source: 'review', at: T0, status: 'active' }
    ]
    const { svc } = setup(undefined, undefined, 12, undefined, async () => activeWeaknesses)
    const plan = await svc.plan({ misconceptions: true })
    const ids = plan.items.map((i) => i.conceptId)
    expect(ids).toContain('a1')
    expect(ids).toContain('b1')
    expect(ids).toContain('a2')
    expect(ids).toContain('b2')
    expect(plan.items.find((i) => i.conceptId === 'a1')?.R).toBeNull()
    expect(plan.items.find((i) => i.conceptId === 'b1')?.R).toBeNull()
    expect(ids.indexOf('a1')).toBeLessThan(ids.indexOf('a2'))
    expect(ids.indexOf('b1')).toBeLessThan(ids.indexOf('b2'))
  })
  it('ignores weaknesses of kind "gap" and "execution" in Error Clinic', async () => {
    const activeWeaknesses: WeaknessLine[] = [
      { id: 'w3', conceptId: 'a2', text: 'gap a2', kind: 'gap', source: 'session', at: T0, status: 'active' },
      { id: 'w4', conceptId: 'a3', text: 'exec a3', kind: 'execution', source: 'practice', at: T0, status: 'active' }
    ]
    const { svc } = setup(undefined, undefined, 12, undefined, async () => activeWeaknesses)
    const plan = await svc.plan({ misconceptions: true })
    expect(plan.items).toHaveLength(0)
  })
  it('ignores resolved misconception weaknesses in Error Clinic', async () => {
    const weaknesses: WeaknessLine[] = [
      { id: 'w5', conceptId: 'b1', text: 'resolved b1', kind: 'misconception', source: 'practice', at: T0, status: 'resolved' }
    ]
    const { svc } = setup(undefined, undefined, 12, undefined, async () => weaknesses)
    const plan = await svc.plan({ misconceptions: true })
    expect(plan.items).toHaveLength(0)
  })

  it('puts 1-3 day high-confidence errors and active weaknesses in retests without extra writes', async () => {
    const tNow = T0 + 10 * DAY
    // a1: high-confidence error 2 days ago (age = 2d, in 1-3d window) -> retest
    await review('a1', tNow - 2 * DAY, 1, { correct: false, confidence: 80 })
    // a2: high-confidence error 0.5 days ago (age = 0.5d, too recent) -> not in 1-3d retest
    await review('a2', tNow - 0.5 * DAY, 1, { correct: false, confidence: 80 })
    // a3: high-confidence error 5 days ago (age = 5d, too old) -> not in 1-3d retest
    await review('a3', tNow - 5 * DAY, 1, { correct: false, confidence: 80 })
    // b1: active weakness created 2 days ago -> retest
    const activeWeaknesses: WeaknessLine[] = [
      { id: 'w_b1', conceptId: 'b1', text: 'weakness b1', kind: 'misconception', source: 'review', at: tNow - 2 * DAY, status: 'active' },
      { id: 'w_b2', conceptId: 'b2', text: 'resolved b2', kind: 'misconception', source: 'review', at: tNow - 2 * DAY, status: 'resolved' }
    ]
    const { svc } = setup(undefined, () => tNow, 12, undefined, async () => activeWeaknesses)
    const memBefore = await mem.read()
    const plan = await svc.plan()
    const memAfter = await mem.read()
    // No extra writes to memoryStore
    expect(memAfter).toHaveLength(memBefore.length)

    const firstItemIds = plan.items.map((i) => i.conceptId)
    // a1 and b1 must be in candidateConcepts and placed early (retests)
    expect(firstItemIds).toContain('a1')
    expect(firstItemIds).toContain('b1')
  })

  it('enforces rigid cap = size and chain quota Math.floor(size * 0.2)', async () => {
    const graphChains: GraphData = {
      concepts: [C('a1', 'A'), C('a2', 'A', 1), C('b1', 'B'), C('b2', 'B', 1), C('a3', 'A', 2)],
      chains: [
        { id: 'ch1', premises: ['a1'], conclusion: 'a2', why: 'a1 -> a2' },
        { id: 'ch2', premises: ['b1'], conclusion: 'b2', why: 'b1 -> b2' }
      ],
      extracted: {}
    }
    await review('a1', T0, 1)
    await review('a2', T0, 1)
    await review('b1', T0, 1)
    await review('b2', T0, 1)
    await review('a3', T0, 1)

    // With size = 10, maxChains = Math.floor(10 * 0.2) = 2
    const { svc: svc10 } = setup(undefined, undefined, 10, undefined, undefined, graphChains)
    const plan10 = await svc10.plan()
    expect(plan10.items.length).toBeLessThanOrEqual(10)
    const chains10 = plan10.items.filter((i) => i.exercise.type === 'chain')
    expect(chains10.length).toBeLessThanOrEqual(2)

    // With size = 4, maxChains = Math.floor(4 * 0.2) = 0 -> zero chains allowed
    const { svc: svc4 } = setup(undefined, undefined, 4, undefined, undefined, graphChains)
    const plan4 = await svc4.plan()
    expect(plan4.items.length).toBeLessThanOrEqual(4)
    const chains4 = plan4.items.filter((i) => i.exercise.type === 'chain')
    expect(chains4).toHaveLength(0)
  })

  it('only includes chains that touch at least one chosen concept', async () => {
    const graphChains: GraphData = {
      concepts: [C('a1', 'A'), C('a2', 'A', 1), C('b1', 'B'), C('b2', 'B', 1)],
      chains: [
        { id: 'ch1', premises: ['a1'], conclusion: 'a2', why: 'a1 -> a2' },
        { id: 'ch2', premises: ['b1'], conclusion: 'b2', why: 'b1 -> b2' }
      ],
      extracted: {}
    }
    await review('a1', T0, 1)
    await review('a2', T0, 1)
    await review('b1', T0, 1)
    await review('b2', T0, 1)

    const { svc } = setup(undefined, undefined, 10, undefined, undefined, graphChains)
    const plan = await svc.plan({ conceptIds: ['a1', 'a2'] })
    const chainItems = plan.items.filter((i) => i.exercise.type === 'chain')
    expect(chainItems.some((i) => i.exercise.type === 'chain' && i.exercise.chainId === 'ch1')).toBe(true)
    expect(chainItems.some((i) => i.exercise.type === 'chain' && i.exercise.chainId === 'ch2')).toBe(false)
  })
})

describe('prerequisites', () => {
  it('returns weak prerequisites and suspect premise ancestors tagged with cascadeOf', async () => {
    const graphPrereq: GraphData = {
      concepts: [C('p1', 'A'), C('p2', 'A', 1), C('goal', 'A', 2)],
      chains: [
        { id: 'ch1', premises: ['p1'], conclusion: 'p2', why: 'p1 -> p2' },
        { id: 'ch2', premises: ['p2'], conclusion: 'goal', why: 'p2 -> goal' }
      ],
      extracted: {}
    }
    await review('p1', T0, 1)
    await review('p2', T0, 3)
    await review('goal', T0, 3)

    const { svc } = setup(undefined, undefined, 12, undefined, undefined, graphPrereq)
    const items = await svc.prerequisites('goal', 5)
    expect(items.length).toBeGreaterThan(0)
    expect(items.length).toBeLessThanOrEqual(5)
    for (const item of items) {
      expect(item.cascadeOf).toBe('goal')
      expect(item.conceptId).not.toBe('goal')
    }
  })

  it('respects budget cap and returns at most budget items', async () => {
    const graphPrereq: GraphData = {
      concepts: [C('p1', 'A'), C('p2', 'A', 1), C('p3', 'A', 2), C('goal', 'A', 3)],
      chains: [
        { id: 'ch1', premises: ['p1', 'p2', 'p3'], conclusion: 'goal', why: 'premises -> goal' }
      ],
      extracted: {}
    }
    await review('p1', T0, 1)
    await review('p2', T0, 1)
    await review('p3', T0, 1)

    const { svc } = setup(undefined, undefined, 12, undefined, undefined, graphPrereq)
    const items = await svc.prerequisites('goal', 1)
    expect(items).toHaveLength(1)
    expect(items[0].cascadeOf).toBe('goal')
  })

  it('returns empty array when budget <= 0 or no candidates', async () => {
    const { svc } = setup()
    expect(await svc.prerequisites('a1', 0)).toEqual([])
    expect(await svc.prerequisites('a1', -2)).toEqual([])
    expect(await svc.prerequisites('unknown-concept', 5)).toEqual([])
  })

  it('performs zero FSRS writes to memoryStore', async () => {
    const graphPrereq: GraphData = {
      concepts: [C('p1', 'A'), C('goal', 'A', 1)],
      chains: [{ id: 'ch1', premises: ['p1'], conclusion: 'goal', why: 'p1 -> goal' }],
      extracted: {}
    }
    await review('p1', T0, 1)
    const initialReviews = await mem.read()
    expect(initialReviews).toHaveLength(1)

    const { svc } = setup(undefined, undefined, 12, undefined, undefined, graphPrereq)
    await svc.prerequisites('goal', 5)

    const afterReviews = await mem.read()
    expect(afterReviews).toEqual(initialReviews)
  })
})

describe('contest', () => {
  it('runs contest on alternative engine specified by otherEngine', async () => {
    const otherEngine = vi.fn(async () => ({ engine: 'agy' as const, model: 'gemini-3.8-flash-medium' }))
    const { svc, ask } = setup(undefined, undefined, 12, undefined, undefined, undefined, otherEngine)
    const result = await svc.contest({
      conceptId: 'a1',
      exercise: { type: 'open', prompt: 'Prompt', answer: 'Answer' },
      answer: 'My contest answer',
      confidence: 80
    })
    expect(otherEngine).toHaveBeenCalled()
    expect(result.verdict).toBe('partial')
    const lastCall = ask.mock.calls.at(-1)![0]
    expect(lastCall.task).toBe('grade')
    expect(lastCall.engine).toEqual({ engine: 'agy', model: 'gemini-3.8-flash-medium' })
  })

  it('falls back gracefully when the alternative engine call fails', async () => {
    const failingAsk = vi.fn(async () => Promise.reject(new Error('Engine error')))
    const otherEngine = vi.fn(async () => ({ engine: 'claude' as const, model: 'sonnet' }))
    const { svc } = setup(failingAsk, undefined, 12, undefined, undefined, undefined, otherEngine)
    const result = await svc.contest({
      conceptId: 'a1',
      exercise: { type: 'open', prompt: 'Prompt', answer: 'Answer' },
      answer: 'My answer',
      confidence: 60
    })
    expect(result).toEqual({
      verdict: 'partial',
      feedback: 'Non sono riuscito a correggere: valuta tu confrontando con la risposta di riferimento.',
      proposed: 2
    })
  })

  it('contests explain exercises using the explain verdict prompt', async () => {
    const otherEngine = vi.fn(async () => ({ engine: 'agy' as const, model: 'gemini-3.8-flash-medium' }))
    const { svc, ask } = setup(
      vi.fn(async (req) => ({
        data: req.schema.parse({ action: 'grade', verdict: 'ok', feedback: 'Spiegazione valida.' }),
        fromCache: false,
        engine: 'agy' as const
      })),
      undefined,
      12,
      undefined,
      undefined,
      undefined,
      otherEngine
    )
    const result = await svc.contest({
      conceptId: 'a1',
      exercise: { type: 'explain', prompt: 'Spiega Rolle', answer: 'Passaggi' },
      answer: 'Dimostrazione completa',
      confidence: 90
    })
    expect(result.verdict).toBe('ok')
    expect(result.proposed).toBe(3)
    const lastCall = ask.mock.calls.at(-1)![0]
    expect(lastCall.task).toBe('grade')
    expect(lastCall.prompt).toContain('STUDENTE PIGNOLO')
    expect(lastCall.prompt).toContain("Hai già fatto 2 domande: adesso dai l'esito")
    expect(lastCall.engine).toEqual({ engine: 'agy', model: 'gemini-3.8-flash-medium' })
  })
})

describe('grade, record and memory', () => {
  it('grades an open answer with Claude and proposes a grade', async () => {
    const { svc, ask } = setup()
    const r = await svc.grade({ conceptId: 'a1', exercise: { type: 'open', prompt: 'Che cosa?', answer: 'Questo.' }, answer: 'Boh, forse questo', confidence: 60 })
    expect(r).toEqual({ verdict: 'partial', feedback: 'Manca la prova.', proposed: 1 })
    const call = ask.mock.calls.at(-1)![0]
    expect(call.task).toBe('grade')
    expect(call.prompt).toContain('Boh, forse questo')
    expect(call.prompt).toContain('Questo.')
  })
  it('lets Andrea grade himself when the correction fails', async () => {
    const { svc } = setup(vi.fn(async () => Promise.reject(new Error('timeout'))))
    expect(await svc.grade({ conceptId: 'a1', exercise: { type: 'open', prompt: 'x', answer: 'y' }, answer: 'z', confidence: 50 })).toEqual({
      verdict: 'partial',
      feedback: 'Non sono riuscito a correggere: valuta tu confrontando con la risposta di riferimento.',
      proposed: 2
    })
  })
  it('records a review at once and returns the new memory and intervals', async () => {
    const { svc } = setup()
    const r = await svc.record({ conceptId: 'a1', at: T0 + 10 * DAY, grade: 3, correct: true, confidence: 80 })
    expect(r.memory.state).toBe('la sai')
    expect(Object.keys(r.intervals)).toEqual(['1', '2', '3', '4'])
    expect((await svc.memory()).a1.reps).toBe(1)
    expect(await mem.read()).toHaveLength(1)
  })
  it('marks memory as misconception only for active misconception or discrimination weaknesses', async () => {
    await review('a1', T0 + 10 * DAY, 3, { correct: true, confidence: 90 })
    await review('a2', T0 + 10 * DAY, 3, { correct: true, confidence: 90 })
    await review('a3', T0 + 10 * DAY, 3, { correct: true, confidence: 90 })
    const weaknesses: WeaknessLine[] = [
      { id: 'w1', conceptId: 'a1', text: 'misconception', kind: 'misconception', source: 'practice', at: T0, status: 'active' },
      { id: 'w2', conceptId: 'a2', text: 'gap', kind: 'gap', source: 'session', at: T0, status: 'active' },
      { id: 'w3', conceptId: 'a3', text: 'discrimination', kind: 'discrimination', source: 'review', at: T0, status: 'active' }
    ]
    const { svc } = setup(undefined, undefined, 12, undefined, async () => weaknesses)
    const memMap = await svc.memory()
    expect(memMap.a1.misconception).toBe(true)
    expect(memMap.a2.misconception).toBe(false)
    expect(memMap.a3.misconception).toBe(true)
  })
})

describe('proposeGrade', () => {
  it.each([
    [{ correct: true, confidence: 80 }, 3],
    [{ correct: true, confidence: 20 }, 2],
    [{ correct: true, confidence: 60 }, 3],
    [{ correct: 'partial' as const, confidence: 90 }, 1],
    [{ correct: false, confidence: 90 }, 1],
    [{ correct: false, confidence: 50, dontKnow: true }, 1]
  ])('%o → %i', (input, grade) => {
    expect(proposeGrade(input)).toBe(grade)
  })
})
