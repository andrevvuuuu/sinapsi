// @vitest-environment jsdom
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { memoryStore } from '../../src/main/memory/store'
import { createExamService, normalizePoints } from '../../src/main/practice/exam'
import { reducePractice } from '../../src/main/practice/events'
import { transcribePhoto } from '../../src/main/practice/photo'
import { createPracticeRunner } from '../../src/main/practice/runner'
import { PracticeView } from '../../src/renderer/src/practice/PracticeView'
import type { PracticeState } from '../../src/main/practice/events'
import type { PracticeTurn } from '../../src/shared/practice-protocol'

afterEach(cleanup)
Element.prototype.scrollIntoView = vi.fn()
const ID = '11111111-1111-4111-8111-111111111111'
const material = { conceptIds: ['n_1'], sourceIds: [], free: '' }
const problem = { id: 'p1', statement: 'Mostra che…', mode: 'recall' as const, targets: ['n_1'], modelSolution: 'Soluzione.' }

function mountView(state: PracticeState) {
  const api = { practice: { get: vi.fn(async () => state), retry: vi.fn(async () => undefined), submit: vi.fn(() => new Promise(() => undefined)), onUpdate: vi.fn(() => () => undefined), examDeliver: vi.fn(), examSave: vi.fn(async () => undefined) } }
  window.sinapsi = api as never
  render(<PracticeView id={ID} onBack={vi.fn()} onStarted={vi.fn()} />)
  return api
}
const base: PracticeState = { id: ID, mode: 'train', material, topic: 'Rolle', phase: 'warmup', items: [{ kind: 'learner', submission: { kind: 'start' }, text: 'MATERIALE' }], problems: [], paused: false, awaiting: 'retry', hasTutorTurn: false, createdAt: 1, updatedAt: 1 }

describe('a training interrupted mid-turn', () => {
  it('offers Riprova when the tutor never answered (app quit)', async () => {
    const api = mountView(base)
    expect(await screen.findByText(/La risposta del tutor si è interrotta/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Riprova' }))
    expect(api.practice.retry).toHaveBeenCalledWith(ID)
  })
  it('keeps a way forward when the tutor answered without a problem', async () => {
    const api = mountView({ ...base, awaiting: 'learner', hasTutorTurn: true, items: [...base.items, { kind: 'tutor', turn: { phase: 'warmup', blocks: [{ type: 'text', md: 'Ciao.' }] } }] })
    fireEvent.click(await screen.findByRole('button', { name: 'Prossimo problema' }))
    expect(api.practice.submit).toHaveBeenCalledWith(ID, { kind: 'next' })
  })
  it('a double click on "Dammi un indizio" sends one request', async () => {
    const open: PracticeState = { ...base, awaiting: 'learner', hasTutorTurn: true, problems: [{ ...problem, modelSolution: undefined, status: 'active', phase: 'warmup', hints: 0, maxRung: null }], active: 'p1' }
    const api = mountView(open)
    const hint = await screen.findByRole('button', { name: 'Dammi un indizio' })
    fireEvent.click(hint)
    fireEvent.click(hint)
    expect(api.practice.submit).toHaveBeenCalledTimes(1)
  })
})

describe('points', () => {
  it.each([[[1, 1, 1, 1, 1, 1, 1, 1]], [[1, 1, 1, 1, 1, 1, 1]], [[100, 1, 1, 1, 1, 1, 1, 1]], [[20, 2, 1, 1, 1, 1, 1, 1]], [[7, 8, 7, 8]]])('%j: every problem worth something, total 30, equal weights equal points', (w) => {
    const p = normalizePoints(w)
    expect(p.reduce((a, b) => a + b, 0)).toBe(30)
    expect(p.every((x) => x >= 0.5 && x * 2 === Math.round(x * 2))).toBe(true)
    if (new Set(w).size === 1) expect(Math.max(...p) - Math.min(...p)).toBeLessThanOrEqual(0.5)
  })
})

async function examSetup(replies: unknown[]) {
  const dir = await mkdtemp(join(tmpdir(), 'sinapsi-rf6-'))
  const mem = memoryStore(join(dir, 'm'))
  const ask = vi.fn(async (req: { schema: { parse(x: unknown): unknown } }) => ({ data: req.schema.parse(replies.shift()), fromCache: false, engine: 'claude' as const }))
  const deps = { bridge: { ask, converse: vi.fn() } as never, dir: join(dir, 'p'), material: async () => '', topic: async () => 'x', memory: mem, onUpdate: vi.fn() }
  const runner = createPracticeRunner(deps)
  return { exam: createExamService({ ...deps, runner }), mem }
}
const sheet = { title: 'T', problems: [{ id: 'e1', statement: 'a', points: 15, targets: ['n_1', 'n_inventato'], modelSolution: 's' }, { id: 'e2', statement: 'b', points: 15, targets: [], modelSolution: 's' }] }

describe('grading', () => {
  it('matches items by order when the grader renames the ids, and keeps only real targets in memory', async () => {
    const { exam, mem } = await examSetup([sheet, { items: [{ id: '1', points: 15, comment: '' }, { id: 'Esercizio 2', points: 3, comment: '' }], note: '' }])
    const id = await exam.start(material, 30)
    await exam.retry(id)
    expect((await exam.get(id)).exam!.sheet.problems[0].targets).toEqual(['n_1'])
    await exam.deliver(id, { e1: 'x' })
    expect((await exam.get(id)).exam!.grade!.total).toBe(18)
    expect((await mem.read()).map((r) => r.conceptId)).toEqual(['n_1'])
  })
  it('refuses a correction that does not fit the sheet, offering Riprova', async () => {
    const { exam } = await examSetup([sheet, { items: [{ id: 'zz', points: 30, comment: '' }], note: '' }])
    const id = await exam.start(material, 30)
    await exam.retry(id)
    await exam.deliver(id, {})
    const s = await exam.get(id)
    expect(s.exam!.grade).toBeUndefined()
    expect(s.awaiting).toBe('retry')
  })
})

async function trainSetup(turns: PracticeTurn[], m = material) {
  const dir = await mkdtemp(join(tmpdir(), 'sinapsi-rf6t-'))
  const mem = memoryStore(join(dir, 'm'))
  const converse = vi.fn(async (req: { conversationId: string; schema: { parse(x: unknown): unknown } }) => ({ data: req.schema.parse(turns.shift()), conversationId: req.conversationId, engine: 'claude' as const }))
  const runner = createPracticeRunner({ bridge: { converse, ask: vi.fn() } as never, dir: join(dir, 'p'), material: async () => '', topic: async () => 'x', memory: mem, onUpdate: vi.fn() })
  const id = await runner.create(m)
  return { runner, id, mem, converse }
}

describe('training rules the app enforces', () => {
  it('drops targets outside the material, so a free topic writes nothing to memory', async () => {
    const { runner, id, mem } = await trainSetup(
      [{ phase: 'warmup', blocks: [], problem: { ...problem, targets: ['n_inventato'] } }, { phase: 'warmup', blocks: [], conclude: { outcome: 'solved', verdict: 'v', retest: false } }],
      { conceptIds: [], sourceIds: [], free: 'autovalori' }
    )
    await runner.retry(id)
    expect((await runner.get(id)).problems[0].targets).toEqual([])
    await runner.submit(id, { kind: 'thinking', text: 'x' })
    expect(await mem.read()).toEqual([])
  })
  it('"Lascia il problema" always ends with the solution, even if the tutor does not conclude', async () => {
    const hint: PracticeTurn = { phase: 'warmup', blocks: [], hint: { rung: 1, md: 'Pensa ancora.' } }
    const { runner, id, converse } = await trainSetup([{ phase: 'warmup', blocks: [], problem }, hint, hint])
    await runner.retry(id)
    await runner.submit(id, { kind: 'dismiss' })
    expect((converse.mock.calls[2][0] as unknown as { prompt: string }).prompt).toMatch(/non va bene: .*concludi/)
    expect((await runner.get(id)).problems[0]).toMatchObject({ status: 'done', outcome: 'surrendered', modelSolution: 'Soluzione.' })
  })
  it('"Prossimo problema" must bring a problem or the end', async () => {
    const { runner, id, converse } = await trainSetup([
      { phase: 'warmup', blocks: [], problem },
      { phase: 'warmup', blocks: [], conclude: { outcome: 'solved', verdict: 'v', retest: false } },
      { phase: 'body', blocks: [{ type: 'text', md: 'Pronto?' }] },
      { phase: 'body', blocks: [], problem: { ...problem, id: 'p2' } }
    ])
    await runner.retry(id)
    await runner.submit(id, { kind: 'thinking', text: 'x' })
    await runner.submit(id, { kind: 'next' })
    expect((converse.mock.calls[3][0] as unknown as { prompt: string }).prompt).toMatch(/non va bene: .*problema/)
    expect((await runner.get(id)).active).toBe('p2')
  })
  it('a reused problem id is refused', async () => {
    const { runner, id } = await trainSetup([
      { phase: 'warmup', blocks: [], problem },
      { phase: 'warmup', blocks: [], conclude: { outcome: 'solved', verdict: 'v', retest: false } },
      { phase: 'body', blocks: [], problem },
      { phase: 'body', blocks: [], problem }
    ])
    await runner.retry(id)
    await runner.submit(id, { kind: 'thinking', text: 'x' })
    await runner.submit(id, { kind: 'next' })
    expect((await runner.get(id)).awaiting).toBe('retry')
  })
  it('the first turn always gets a fresh conversation, so one Riprova is enough after a quit', async () => {
    const { runner, id, converse } = await trainSetup([{ phase: 'warmup', blocks: [], problem }])
    await runner.retry(id)
    expect((converse.mock.calls[0][0] as unknown as { conversationId: string }).conversationId).not.toBe(id)
  })
  it('closing the session with a problem open reveals its solution', () => {
    const s = reducePractice([
      { t: 'created', id: 'a', mode: 'train', material, topic: 'x', at: 1 },
      { t: 'tutor', turn: { phase: 'warmup', blocks: [], problem }, at: 2 },
      { t: 'learner', submission: { kind: 'end' }, text: 'Basta', at: 3 },
      { t: 'tutor', turn: { phase: 'done', blocks: [], summary: { solved: [], retest: [], note: '' } }, at: 4 }
    ])
    expect(s.problems[0]).toMatchObject({ status: 'done', outcome: 'surrendered', modelSolution: 'Soluzione.' })
  })
})

describe('photos', () => {
  it('converts an iPhone HEIC photo to JPEG before Claude reads it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-rf6p-'))
    const heic = new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode('ftypheic'), 1, 2, 3])
    const convert = vi.fn(async () => undefined)
    const ask = vi.fn(async (req: { prompt: string; schema: { parse(x: unknown): unknown } }) => ({ data: req.schema.parse({ readable: true, text: 'ok' }), fromCache: false, engine: 'claude' as const }))
    await transcribePhoto({ bridge: { ask } as never, dir, bytes: heic, convert })
    expect(convert).toHaveBeenCalledWith(join(dir, 'foglio-1.heic'), join(dir, 'foglio-1.jpg'))
    expect((ask.mock.calls[0][0] as unknown as { prompt: string }).prompt).toContain('«foglio-1.jpg»')
  })
})

describe('exam delivery', () => {
  const sheetPub = { title: 'T', problems: [{ id: 'e1', statement: 'a', points: 30, targets: [] }] }
  const examState: PracticeState = { ...base, mode: 'exam', awaiting: 'learner', durationMin: 30, exam: { sheet: sheetPub, endsAt: Date.now() + 1_800_000, answers: {}, delivered: false } }
  it('saves on leaving, and says so when delivery fails so Andrea can try again', async () => {
    const api = mountView(examState)
    api.practice.examDeliver.mockRejectedValueOnce(new Error("Error invoking remote method 'practice:exam-deliver': Error: risposta troppo lunga"))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const box = await screen.findByLabelText('Risposta all’esercizio 1')
    expect(box.getAttribute('maxLength')).toBe('20000')
    fireEvent.change(box, { target: { value: 'bozza' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Consegna' })))
    expect(screen.getByRole('alert').textContent).toContain('risposta troppo lunga')
    cleanup()
    expect(api.practice.examSave).toHaveBeenCalledWith(ID, { e1: 'bozza' })
  })
  it('after a failed delivery, Consegna works again', async () => {
    const api = mountView(examState)
    api.practice.examDeliver.mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.change(await screen.findByLabelText('Risposta all’esercizio 1'), { target: { value: 'r' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Consegna' })))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Consegna' })))
    expect(api.practice.examDeliver).toHaveBeenCalledTimes(2)
  })
})
