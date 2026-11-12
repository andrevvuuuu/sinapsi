import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createReviewService } from '../../src/main/memory/review'
import { memoryStore, type MemoryStore } from '../../src/main/memory/store'
import { variantsStore, type VariantsStore } from '../../src/main/memory/variants'
import { proposeGrade, type ReviewLine } from '../../src/shared/memory-types'
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
function setup(ask?: ReturnType<typeof vi.fn>, now = () => T0 + 10 * DAY, size = 12, pacerOf?: () => Promise<Map<string, 'P' | 'A' | 'C' | 'E' | 'R'>>) {
  const bridge = {
    ask:
      ask ??
      vi.fn(async (req: { task: string; prompt: string; schema: { parse(x: unknown): unknown } }) => ({
        data: req.task === 'variants' ? req.schema.parse(variantsFor(req.prompt)) : req.schema.parse({ verdict: 'partial', feedback: 'Manca la prova.' }),
        fromCache: false,
        engine: 'agy' as const
      }))
  }
  const svc = createReviewService({
    bridge: bridge as never,
    memory: mem,
    variants: vars,
    graph: async () => graph,
    vault: async () => index,
    readNote: async () => 'testo della nota',
    settings: async () => ({ reviewSessionSize: size, exerciseTypes: types as never }),
    pacerOf,
    now,
    workDir: join(dir, 'w')
  })
  return { svc, ask: bridge.ask as ReturnType<typeof vi.fn> }
}
const review = (conceptId: string, at: number, grade: 1 | 2 | 3 | 4, extra: Partial<ReviewLine> = {}): Promise<void> => mem.append({ conceptId, at, grade, ...extra })

describe('plan', () => {
  it('puts due concepts first, most forgotten first, then a few new ones from the foundations', async () => {
    await review('b2', T0, 3)
    await review('a2', T0, 1)
    const { svc } = setup()
    const p = await svc.plan()
    expect(p.due).toBe(2)
    expect(p.items.slice(0, 2).map((i) => i.conceptId).sort()).toEqual(['a2', 'b2'])
    expect(p.items[0].R!).toBeLessThanOrEqual(p.items[1].R!)
    expect(p.items.slice(2).map((i) => i.R)).toEqual([null, null, null])
    expect(p.items.slice(2).map((i) => i.conceptId)).toEqual(['a1', 'b1', 'a3'])
  })
  it('caps new concepts at five and the session at its size', async () => {
    const { svc } = setup(undefined, undefined, 2)
    expect((await svc.plan()).items).toHaveLength(2)
  })
  it('alternates notes when it can', async () => {
    const { svc } = setup()
    const notes = (await svc.plan()).items.map((i) => i.notePath)
    for (let k = 1; k < notes.length - 1; k++) expect(notes[k] === notes[k - 1] && notes[k] === notes[k + 1]).toBe(false)
  })
  it('generates variants once per note and reuses them', async () => {
    const { svc, ask } = setup()
    await svc.plan()
    expect(ask.mock.calls.filter((c) => c[0].task === 'variants')).toHaveLength(2)
    await svc.plan()
    expect(ask.mock.calls.filter((c) => c[0].task === 'variants')).toHaveLength(2)
    expect(ask.mock.calls[0][0]).toMatchObject({ timeoutMs: 300_000, cwd: join(dir, 'w') })
  })
  it('falls back to a recall question when generation fails', async () => {
    const { svc } = setup(vi.fn(async () => Promise.reject(new Error('quota'))))
    const p = await svc.plan({ conceptIds: ['a1'] })
    expect(p.items[0].exercise).toEqual({ type: 'open', prompt: 'Senza guardare: che cosa dice «nome a1»?', answer: 'enunciato a1' })
    expect(p.items[0].variantId).toBeNull()
  })
  it('only uses the exercise types Andrea chose', async () => {
    types = ['truefalse']
    const { svc } = setup()
    for (const i of (await svc.plan()).items) expect(i.exercise.type).toBe('truefalse')
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
})

describe('grade, record and memory', () => {
  it('grades an open answer with Claude and proposes a grade', async () => {
    const { svc, ask } = setup()
    const r = await svc.grade({ conceptId: 'a1', exercise: { type: 'open', prompt: 'Che cosa?', answer: 'Questo.' }, answer: 'Boh, forse questo', confidence: 60 })
    expect(r).toEqual({ verdict: 'partial', feedback: 'Manca la prova.', proposed: 2 })
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
})

describe('proposeGrade', () => {
  it.each([
    [{ correct: true, confidence: 80 }, 3],
    [{ correct: true, confidence: 30 }, 2],
    [{ correct: true, confidence: 60 }, 3],
    [{ correct: 'partial' as const, confidence: 90 }, 2],
    [{ correct: false, confidence: 90 }, 1],
    [{ correct: false, confidence: 50, dontKnow: true }, 1]
  ])('%o → %i', (input, grade) => {
    expect(proposeGrade(input)).toBe(grade)
  })
})
