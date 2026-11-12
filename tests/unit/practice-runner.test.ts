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

function setup(turns: PracticeTurn[], options: { lessonId?: string; onCompass?: (id: string, question: string) => Promise<void>; onSolved?: (id: string, questions: string[]) => Promise<void> } = {}) {
  const converse = vi.fn(async (req: { conversationId: string; schema: { parse(x: unknown): unknown } }) => {
    const t = turns.shift()
    if (!t) throw new Error('nessun turno')
    return { data: req.schema.parse(t), conversationId: req.conversationId, engine: 'claude' as const }
  })
  const onUpdate = vi.fn()
  const runner = createPracticeRunner({ bridge: { converse, ask: vi.fn() } as never, dir: join(dir, 'p'), material: async () => 'CONCETTI SCELTI\nn_1 | Rolle | …', topic: async () => 'Rolle, Lagrange', memory: mem, onUpdate, now: () => 1000, onCompass: options.onCompass, onSolved: options.onSolved })
  return { runner, converse, onUpdate, material: { ...material, lessonId: options.lessonId } }
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
      { phase: 'warmup', blocks: [{ type: 'text', md: 'La tua riformulazione è corretta.' }] },
      { phase: 'warmup', blocks: [], conclude: { outcome: 'solved_hints', verdict: 'Con aiuti.', retest: true } }
    ])
    const id = await runner.create(material)
    await runner.retry(id)
    await runner.submit(id, { kind: 'thinking', text: 'non so da dove partire' })
    expect((await runner.get(id)).problems[0].needsRestate).toBe(true)
    await expect(runner.submit(id, { kind: 'thinking', text: 'vietato ora' })).rejects.toThrow(/Prima riformula/)
    await expect(runner.submit(id, { kind: 'hint' })).rejects.toThrow(/Prima riformula/)
    await expect(runner.submit(id, { kind: 'compass', compass: { known: '', stuck: 'x', question: 'y' } })).rejects.toThrow(/Prima riformula/)
    await runner.submit(id, { kind: 'restate', text: 'applico il teorema alla funzione' })
    expect((converse.mock.calls[2][0] as unknown as { prompt: string; resume: boolean })).toMatchObject({ prompt: "Riformulo l'indizio con parole mie: applico il teorema alla funzione", resume: true })
    await runner.submit(id, { kind: 'thinking', text: 'uso il valor medio' })
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
    if (rung !== undefined) await runner.submit(id, { kind: 'thinking', text: 'boh' })
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
  it('attempt first: one rung-0 hint is free, the next waits for a try', async () => {
    const { runner, converse } = setup([
      { phase: 'warmup', blocks: [], problem },
      { phase: 'warmup', blocks: [], hint: { rung: 0, md: 'Rileggi il secondo dato.' } },
      { phase: 'warmup', blocks: [], hint: { rung: 2, md: 'Teoremi sulle derivabili.' } }
    ])
    const id = await runner.create(material)
    await runner.retry(id)
    await runner.submit(id, { kind: 'hint' })
    expect((converse.mock.calls[1][0] as unknown as { prompt: string }).prompt).toMatch(/Non ho ancora scritto un tentativo: solo gradino 0/)
    await expect(runner.submit(id, { kind: 'hint' })).rejects.toThrow(/prima scrivi un tentativo/)
    await runner.submit(id, { kind: 'thinking', text: 'parto dalla definizione' })
    expect((await runner.get(id)).problems[0]).toMatchObject({ hints: 2, maxRung: 2, attempts: 1 })
  })
  it('refuses the compass before any attempt on the problem', async () => {
    const { runner } = setup([{ phase: 'warmup', blocks: [], problem }])
    const id = await runner.create(material)
    await runner.retry(id)
    await expect(runner.submit(id, { kind: 'compass', compass: { known: '', stuck: 'x', question: 'y' } })).rejects.toThrow(/prima scrivi un tentativo/)
  })
  it('records compass questions and resolves the same question when solved', async () => {
    const onCompass = vi.fn(async () => undefined)
    const onSolved = vi.fn(async () => undefined)
    const { runner, material: lessonMaterial } = setup([
      { phase: 'warmup', blocks: [], problem },
      { phase: 'warmup', blocks: [], hint: { rung: 1, md: 'x' } },
      { phase: 'warmup', blocks: [], hint: { rung: 1, md: 'mirato' } },
      { phase: 'warmup', blocks: [], conclude: { outcome: 'solved_hints', verdict: 'ok', retest: false } }
    ], { lessonId: 'lesson-1', onCompass, onSolved })
    const id = await runner.create(lessonMaterial)
    await runner.retry(id)
    await runner.submit(id, { kind: 'thinking', text: 'ci provo' })
    await runner.submit(id, { kind: 'compass', compass: { known: 'a', stuck: 'b', question: 'Quale ipotesi serve?' } })
    expect(onCompass).toHaveBeenCalledWith('lesson-1', 'Quale ipotesi serve?')
    await runner.submit(id, { kind: 'thinking', text: 'risolto' })
    expect(onSolved).toHaveBeenCalledWith('lesson-1', ['Quale ipotesi serve?'])
    expect((await mem.read())[0].rung).toBe(1)
  })
  it('sends back a hint above rung 0 when nothing has been tried yet', async () => {
    const { runner, converse } = setup([
      { phase: 'warmup', blocks: [], problem },
      { phase: 'warmup', blocks: [], hint: { rung: 3, md: 'Il valor medio.' } },
      { phase: 'warmup', blocks: [], hint: { rung: 0, md: 'Rileggi il testo.' } }
    ])
    const id = await runner.create(material)
    await runner.retry(id)
    await runner.submit(id, { kind: 'hint' })
    expect((converse.mock.calls[2][0] as unknown as { prompt: string }).prompt).toMatch(/non va bene: .*gradino 0/)
    expect((await runner.get(id)).problems[0]).toMatchObject({ hints: 1, maxRung: 0 })
  })
  it('refuses submissions that do not fit the moment', async () => {
    const { runner } = setup([{ phase: 'warmup', blocks: [], problem }])
    const id = await runner.create(material)
    await runner.retry(id)
    await expect(runner.submit(id, { kind: 'next' })).rejects.toThrow(/problema aperto/)
    await expect(runner.submit(id, { kind: 'ask', text: 'perché?' })).rejects.toThrow(/problema aperto/)
    await expect(runner.submit(id, { kind: 'restate', text: 'parole mie' })).rejects.toThrow(/non serve riformulare/)
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
  it('keeps lessonId on review lines and calls onDone once at the transition to done', async () => {
    const onDone = vi.fn(async () => undefined)
    let turnNumber = 0
    const practice = createPracticeRunner({
      bridge: {
        converse: vi.fn(
          async (req: { conversationId: string; schema: { parse(x: unknown): unknown } }) => {
            const index = turnNumber++
            const turn: PracticeTurn =
              index === 0
                ? { phase: 'body', blocks: [], problem }
                : index === 1
                  ? {
                      phase: 'body',
                      blocks: [],
                      conclude: { outcome: 'solved', verdict: 'Risolto', retest: false }
                    }
                  : {
                      phase: 'done',
                      blocks: [],
                      summary: { learned: ['x'], shaky: [], misconceptions: [] }
                    }
            return {
              data: req.schema.parse(turn),
              conversationId: req.conversationId,
              engine: 'claude' as const
            }
          }
        ),
        ask: vi.fn()
      } as never,
      dir: join(dir, 'lesson'),
      material: async () => 'text',
      topic: async () => 'topic',
      memory: mem,
      onUpdate: vi.fn(),
      onDone
    })
    const id = await practice.create({ ...material, lessonId: 'lesson-id' })
    await practice.retry(id)
    await practice.submit(id, { kind: 'thinking', text: 'answer' })
    const lines = await mem.read()
    expect(lines[0]).toMatchObject({ lessonId: 'lesson-id' })
    await practice.append(id, {
      t: 'tutor',
      turn: {
        phase: 'done',
        blocks: [],
        summary: { learned: ['x'], shaky: [], misconceptions: [] }
      },
      conversationId: 'done-conversation',
      at: 2000
    })
    expect(onDone).toHaveBeenCalledTimes(1)
    await practice.get(id)
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})
