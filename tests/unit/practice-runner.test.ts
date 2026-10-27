import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeTutor } from '../../src/main/practice/fake-tutor'
import { PRACTICE_SYSTEM_PROMPT } from '../../src/main/practice/prompt'
import { createPracticeRunner } from '../../src/main/practice/runner'
import { memoryStore, type MemoryStore } from '../../src/main/memory/store'
import type { PracticeTurn } from '../../src/shared/practice-protocol'

const material = { conceptIds: ['n_1', 'n_2'], sourceIds: [], free: '' }
const problem = { id: 'p1', statement: 'Mostra che…', mode: 'recall' as const, targets: ['n_1', 'n_2'], modelSolution: 'Valor medio.' }
let dir: string
let mem: MemoryStore
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sinapsi-practice-'))
  mem = memoryStore(join(dir, 'm'))
})

function setup(turns: PracticeTurn[]) {
  const converse = vi.fn(async (req: { conversationId: string; schema: { parse(x: unknown): unknown } }) => {
    const t = turns.shift()
    if (!t) throw new Error('nessun turno')
    return { data: req.schema.parse(t), conversationId: req.conversationId, engine: 'claude' as const }
  })
  const onUpdate = vi.fn()
  const runner = createPracticeRunner({ bridge: { converse, ask: vi.fn() } as never, dir: join(dir, 'p'), material: async () => 'CONCETTI SCELTI\nn_1 | Rolle | …', topic: async () => 'Rolle, Lagrange', memory: mem, onUpdate, now: () => 1000 })
  return { runner, converse, onUpdate }
}

describe('training', () => {
  it('starts from the material with the practice prompt and poses the first problem', async () => {
    const { runner, converse } = setup([{ phase: 'warmup', blocks: [{ type: 'text', md: 'Si parte.' }], problem }])
    const id = await runner.create(material)
    await runner.retry(id)
    const req = converse.mock.calls[0][0] as unknown as { task: string; systemPrompt: string; prompt: string; resume: boolean }
    expect(req).toMatchObject({ task: 'teach', systemPrompt: PRACTICE_SYSTEM_PROMPT, resume: false })
    expect(req.prompt).toContain('CONCETTI SCELTI')
    expect(req.prompt).toContain('Allenamento')
    const s = await runner.get(id)
    expect(s).toMatchObject({ topic: 'Rolle, Lagrange', active: 'p1', awaiting: 'learner' })
  })
  it('sends hints and thinking, and writes the outcome into memory for every target', async () => {
    const { runner, converse } = setup([
      { phase: 'warmup', blocks: [], problem },
      { phase: 'warmup', blocks: [], hint: { rung: 3, md: 'Il teorema del valor medio.' } },
      { phase: 'warmup', blocks: [], conclude: { outcome: 'solved_hints', verdict: 'Con aiuti.', retest: true } }
    ])
    const id = await runner.create(material)
    await runner.retry(id)
    await runner.submit(id, { kind: 'hint' })
    await runner.submit(id, { kind: 'thinking', text: 'uso il valor medio' })
    expect((converse.mock.calls[2][0] as unknown as { prompt: string; resume: boolean })).toMatchObject({ prompt: 'Il mio ragionamento: uso il valor medio', resume: true })
    const reviews = await mem.read()
    expect(reviews).toMatchObject([
      { conceptId: 'n_1', at: 1000, grade: 1, correct: true, via: 'practice' },
      { conceptId: 'n_2', at: 1000, grade: 1, correct: true, via: 'practice' }
    ])
    expect((await runner.get(id)).paused).toBe(true)
    expect([...(await runner.practiced())].sort()).toEqual(['n_1', 'n_2'])
  })
  it.each([
    ['solved', undefined, 3],
    ['solved_hints', 1, 2],
    ['surrendered', undefined, 1]
  ] as const)('grades %s (max rung %s) as %i', async (outcome, rung, grade) => {
    const turns: PracticeTurn[] = [{ phase: 'body', blocks: [], problem: { ...problem, targets: ['n_1'] } }]
    if (rung !== undefined) turns.push({ phase: 'body', blocks: [], hint: { rung, md: 'x' } })
    turns.push({ phase: 'body', blocks: [], conclude: { outcome, verdict: 'v', retest: false } })
    const { runner } = setup(turns)
    const id = await runner.create(material)
    await runner.retry(id)
    if (rung !== undefined) await runner.submit(id, { kind: 'hint' })
    await runner.submit(id, outcome === 'surrendered' ? { kind: 'dismiss' } : { kind: 'thinking', text: 'x' })
    expect((await mem.read())[0]).toMatchObject({ grade, correct: outcome !== 'surrendered' })
  })
  it('asks once to fix a turn that breaks the session rules, then gives up with Riprova', async () => {
    const bad: PracticeTurn = { phase: 'warmup', blocks: [], conclude: { outcome: 'solved', verdict: 'x', retest: false } }
    const { runner, converse } = setup([bad, { phase: 'warmup', blocks: [], problem }])
    const id = await runner.create(material)
    await runner.retry(id)
    expect((converse.mock.calls[1][0] as unknown as { prompt: string }).prompt).toMatch(/non va bene: non c'è nessun problema aperto/)
    expect((await runner.get(id)).active).toBe('p1')
    const { runner: r2 } = setup([bad, bad])
    const id2 = await r2.create(material)
    await r2.retry(id2)
    expect((await r2.get(id2)).awaiting).toBe('retry')
  })
  it('refuses submissions that do not fit the moment', async () => {
    const { runner } = setup([{ phase: 'warmup', blocks: [], problem }])
    const id = await runner.create(material)
    await runner.retry(id)
    await expect(runner.submit(id, { kind: 'next' })).rejects.toThrow(/problema aperto/)
    await expect(runner.submit(id, { kind: 'ask', text: 'perché?' })).rejects.toThrow(/problema aperto/)
  })
  it('writes nothing to memory for a free topic', async () => {
    const { runner } = setup([
      { phase: 'warmup', blocks: [], problem: { ...problem, targets: [] } },
      { phase: 'warmup', blocks: [], conclude: { outcome: 'solved', verdict: 'v', retest: false } }
    ])
    const id = await runner.create({ conceptIds: [], sourceIds: [], free: 'autovalori' })
    await runner.retry(id)
    await runner.submit(id, { kind: 'thinking', text: 'x' })
    expect(await mem.read()).toEqual([])
  })
  it('lists sessions with their topic, and a reload during a turn offers Riprova', async () => {
    const { runner } = setup([])
    const id = await runner.create(material)
    expect(await runner.list()).toEqual([{ id, topic: 'Rolle, Lagrange', mode: 'train', done: false, updatedAt: 1000 }])
    const fresh = createPracticeRunner({ bridge: { converse: vi.fn(), ask: vi.fn() } as never, dir: join(dir, 'p'), material: async () => '', topic: async () => '', memory: mem, onUpdate: vi.fn() })
    expect((await fresh.get(id)).awaiting).toBe('retry')
  })
})

describe('fake tutor', () => {
  it('plays a whole short session', async () => {
    const runner = createPracticeRunner({ bridge: fakeTutor(), dir: join(dir, 'f'), material: async () => 'CONCETTI SCELTI\nn_1 | Rolle | x', topic: async () => 'Rolle', memory: mem, onUpdate: vi.fn() })
    const id = await runner.create(material)
    await runner.retry(id)
    await runner.submit(id, { kind: 'hint' })
    await runner.submit(id, { kind: 'thinking', text: 'valor medio' })
    await runner.submit(id, { kind: 'next' })
    expect((await runner.get(id)).problems[1].lines?.length).toBeGreaterThan(1)
    await runner.submit(id, { kind: 'thinking', line: 2, text: 'manca la derivabilità' })
    await runner.submit(id, { kind: 'next' })
    expect((await runner.get(id)).phase).toBe('done')
  })
})
