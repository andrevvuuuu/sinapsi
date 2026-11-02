import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createExamService, normalizePoints } from '../../src/main/practice/exam'
import { createPracticeRunner } from '../../src/main/practice/runner'
import { memoryStore, type MemoryStore } from '../../src/main/memory/store'

const material = { conceptIds: ['n_1', 'n_2'], sourceIds: [], free: '' }
const sheet = {
  title: 'Analisi 1 — prova scritta',
  problems: [
    { id: 'e1', statement: 'Calcola il limite…', points: 10, targets: ['n_1'], modelSolution: 'SOL1' },
    { id: 'e2', statement: 'Dimostra Rolle.', points: 10, targets: ['n_2'], modelSolution: 'SOL2' }
  ]
}
let dir: string
let mem: MemoryStore
let t: number
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sinapsi-exam-'))
  mem = memoryStore(join(dir, 'm'))
  t = 1_000_000
})

function setup(replies: unknown[]) {
  const ask = vi.fn(async (req: { schema: { parse(x: unknown): unknown } }) => {
    const r = replies.shift()
    if (r instanceof Error) throw r
    return { data: req.schema.parse(r), fromCache: false, engine: 'claude' as const }
  })
  const deps = { bridge: { ask, converse: vi.fn() } as never, dir: join(dir, 'p'), material: async () => 'CONCETTI SCELTI\nn_1 | Limiti | …', topic: async () => 'Analisi', memory: mem, onUpdate: vi.fn(), now: () => t }
  const runner = createPracticeRunner(deps)
  return { exam: createExamService({ ...deps, runner }), ask, runner }
}

describe('normalizePoints', () => {
  it('scales the points to 30 in half points, keeping the total exact', () => {
    expect(normalizePoints([10, 10]).reduce((a, b) => a + b)).toBe(30)
    expect(normalizePoints([10, 10])).toEqual([15, 15])
    const p = normalizePoints([1, 1, 1])
    expect(p.reduce((a, b) => a + b)).toBe(30)
    expect(p.every((x) => x * 2 === Math.round(x * 2))).toBe(true)
  })
})

describe('exam', () => {
  it('generates a sheet worth 30 with hidden solutions and an end time from when it is ready', async () => {
    const { exam, ask } = setup([sheet])
    const id = await exam.start(material, 60)
    t += 5_000
    await exam.retry(id)
    const req = ask.mock.calls[0][0] as unknown as { task: string; prompt: string; timeoutMs: number }
    expect(req).toMatchObject({ task: 'teach', timeoutMs: 300_000 })
    expect(req.prompt).toContain('60 minuti')
    expect(req.prompt).toContain('CONCETTI SCELTI')
    const s = await exam.get(id)
    expect(s.exam!.endsAt).toBe(1_005_000 + 3_600_000)
    expect(s.exam!.sheet.problems.map((p) => p.points)).toEqual([15, 15])
    expect(JSON.stringify(s)).not.toMatch(/SOL1/)
  })
  it('keeps drafts, delivers once, grades in thirtieths and writes memory', async () => {
    const { exam, ask } = setup([sheet, { items: [{ id: 'e1', points: 15, comment: 'Giusto.' }, { id: 'e2', points: 9, comment: 'Manca un’ipotesi.', miss: 'execution' }], note: 'Buono.' }])
    const id = await exam.start(material, 30)
    await exam.retry(id)
    await exam.save(id, { e1: 'bozza' })
    expect((await exam.get(id)).exam!.answers).toEqual({ e1: 'bozza' })
    await Promise.all([exam.deliver(id, { e1: 'r1', e2: 'r2' }), exam.deliver(id, { e1: 'r1', e2: 'r2' })])
    expect(ask).toHaveBeenCalledTimes(2)
    const gradeReq = ask.mock.calls[1][0] as unknown as { prompt: string }
    expect(gradeReq.prompt).toContain('SOL2')
    expect(gradeReq.prompt).toContain('r2')
    const s = await exam.get(id)
    expect(s.exam!.grade).toMatchObject({ total: 24, lode: false })
    expect(s.exam!.sheet.problems[1].modelSolution).toBe('SOL2')
    expect(await mem.read()).toMatchObject([
      { conceptId: 'n_1', at: t, grade: 3, correct: true, via: 'practice' },
      { conceptId: 'n_2', at: t, grade: 2, correct: true, via: 'practice' }
    ])
    await exam.save(id, { e1: 'tardi' })
    expect((await exam.get(id)).exam!.answers.e1).toBe('r1')
  })
  it('never gives more points than a problem is worth, and gives the lode only to a perfect sheet', async () => {
    const { exam } = setup([sheet, { items: [{ id: 'e1', points: 40, comment: '' }, { id: 'e2', points: 15, comment: '' }], note: '' }])
    const id = await exam.start(material, 30)
    await exam.retry(id)
    await exam.deliver(id, { e1: 'a', e2: 'b' })
    expect((await exam.get(id)).exam!.grade).toMatchObject({ total: 30, lode: true, items: [{ points: 15 }, { points: 15 }] })
  })
  it('delivers the saved drafts by itself when the time is over (e.g. the app was closed)', async () => {
    const { exam, ask } = setup([sheet, { items: [{ id: 'e1', points: 5, comment: '' }, { id: 'e2', points: 0, comment: '' }], note: '' }])
    const id = await exam.start(material, 30)
    await exam.retry(id)
    await exam.save(id, { e1: 'mezza' })
    t += 31 * 60_000
    const s = await exam.get(id)
    expect(s.exam!.delivered).toBe(true)
    await vi.waitFor(async () => expect((await exam.get(id)).exam!.grade?.total).toBe(5))
    expect((ask.mock.calls[1][0] as unknown as { prompt: string }).prompt).toContain('mezza')
  })
  it('a failed grading keeps the answers and can be retried', async () => {
    const { exam } = setup([sheet, new Error('quota'), { items: [{ id: 'e1', points: 15, comment: '' }, { id: 'e2', points: 15, comment: '' }], note: '' }])
    const id = await exam.start(material, 30)
    await exam.retry(id)
    await exam.deliver(id, { e1: 'a', e2: 'b' })
    expect((await exam.get(id)).awaiting).toBe('retry')
    await exam.retry(id)
    expect((await exam.get(id)).exam!.grade!.total).toBe(30)
  })
})

describe('over-escaped model text', () => {
  it('turns doubled LaTeX backslashes and literal \\n back into LaTeX and new lines', async () => {
    const { unescapeOver } = await import('../../src/main/ai/json')
    expect(unescapeOver('Sia $f_c(x)$.\\n\\n(a) Vale $$\\\\frac{b-a}{b}<\\\\ln\\\\frac{b}{a}$$')).toBe('Sia $f_c(x)$.\n\n(a) Vale $$\\frac{b-a}{b}<\\ln\\frac{b}{a}$$')
    expect(unescapeOver('$\\nabla f \\neq 0$ e $\\frac12$')).toBe('$\\nabla f \\neq 0$ e $\\frac12$')
  })
  it('cleans the sheet and the grade, and the prompts no longer ask to double backslashes', async () => {
    const { exam, ask } = setup([
      { title: 'T', problems: [{ id: 'e1', statement: 'Calcola $\\\\lim_{x\\\\to0}$.\\n(b) poi', points: 30, targets: [], modelSolution: 'Vale $\\\\frac12$.' }] },
      { items: [{ id: 'e1', points: 3, comment: 'Manca $\\\\ln$.' }], note: 'Riprendi.\\n- le basi.' }
    ])
    const id = await exam.start(material, 30)
    await exam.retry(id)
    expect((await exam.get(id)).exam!.sheet.problems[0].statement).toBe('Calcola $\\lim_{x\\to0}$.\n(b) poi')
    await exam.deliver(id, { e1: 'x' })
    const s = await exam.get(id)
    expect(s.exam!.sheet.problems[0].modelSolution).toBe('Vale $\\frac12$.')
    expect(s.exam!.grade).toMatchObject({ note: 'Riprendi.\n- le basi.', items: [{ comment: 'Manca $\\ln$.' }] })
    for (const c of ask.mock.calls) expect((c[0] as unknown as { prompt: string }).prompt).not.toMatch(/raddoppiat/)
  })
})

describe('paper exam', () => {
  const grading = { items: [{ id: 'e1', points: 10, comment: 'Manca un caso.' }, { id: 'e2', points: 15, comment: 'Giusto.' }], note: 'Bene.' }

  it('shows only the sheet and the clock, then the solutions once handed in', async () => {
    const { exam } = setup([sheet])
    const id = await exam.start(material, 60, true)
    await exam.retry(id)
    let s = await exam.get(id)
    expect(s.paper).toBe(true)
    expect(JSON.stringify(s)).not.toMatch(/SOL1/)
    await exam.save(id, { e1: 'scritto al computer' })
    expect((await exam.get(id)).exam!.answers).toEqual({})
    await exam.hand(id)
    s = await exam.get(id)
    expect(s.exam).toMatchObject({ handed: true, delivered: false, self: {} })
    expect(s.exam!.sheet.problems[0].modelSolution).toBe('SOL1')
  })
  it('the end of the time puts the pens down but never grades by itself', async () => {
    const { exam, ask } = setup([sheet])
    const id = await exam.start(material, 30, true)
    await exam.retry(id)
    t += 31 * 60_000
    const s = await exam.get(id)
    expect(s.exam).toMatchObject({ handed: true, delivered: false })
    expect(ask).toHaveBeenCalledTimes(1)
  })
  it('grades only after a self-grade on every problem, and keeps both grades', async () => {
    const { exam, ask } = setup([sheet, grading])
    const id = await exam.start(material, 60, true)
    await exam.retry(id)
    await exam.selfGrade(id, 'e1', 12)
    expect((await exam.get(id)).exam!.self).toBeUndefined()
    await exam.hand(id)
    await exam.selfGrade(id, 'e1', 12.3)
    await exam.selfGrade(id, 'e1', 3)
    await exam.selfGrade(id, 'e9', 3)
    expect((await exam.get(id)).exam!.self).toEqual({ e1: 12.5 })
    await exam.save(id, { e1: 'trascritto dal foglio' })
    await exam.deliver(id, { e1: 'trascritto dal foglio' })
    expect((await exam.get(id)).exam!.delivered).toBe(false)
    await exam.selfGrade(id, 'e2', 40)
    await exam.deliver(id, { e1: 'trascritto dal foglio', e2: 'r2' })
    const prompt = (ask.mock.calls[1][0] as unknown as { prompt: string }).prompt
    expect(prompt).toContain('a macchina spenta')
    expect(prompt).toContain('Rigore nella correzione')
    expect(prompt).not.toContain('12.5')
    const s = await exam.get(id)
    expect(s.exam!.grade).toMatchObject({ total: 25, items: [{ id: 'e1', points: 10, self: 12.5 }, { id: 'e2', points: 15, self: 15 }] })
    await exam.selfGrade(id, 'e2', 0)
    expect((await exam.get(id)).exam!.grade!.items[1].self).toBe(15)
  })
  it('the calibration history lists the graded paper exams, oldest first', async () => {
    const { exam } = setup([sheet, grading, sheet, grading, sheet])
    const first = await exam.start(material, 60, true)
    await exam.retry(first)
    await exam.hand(first)
    await exam.selfGrade(first, 'e1', 15)
    await exam.selfGrade(first, 'e2', 15)
    await exam.deliver(first, { e1: 'a', e2: 'b' })
    t += 86_400_000
    const second = await exam.start(material, 60, true)
    await exam.retry(second)
    await exam.hand(second)
    await exam.selfGrade(second, 'e1', 8)
    await exam.selfGrade(second, 'e2', 15)
    await exam.deliver(second, { e1: 'a', e2: 'b' })
    // An exam on the computer and an ungraded paper one stay out.
    const typed = await exam.start(material, 60)
    await exam.retry(typed)
    expect(await exam.calibration()).toEqual([
      { id: first, topic: 'Analisi', at: 1_000_000, items: [{ id: 'e1', max: 15, self: 15, ai: 10 }, { id: 'e2', max: 15, self: 15, ai: 15 }] },
      { id: second, topic: 'Analisi', at: 1_000_000 + 86_400_000, items: [{ id: 'e1', max: 15, self: 8, ai: 10 }, { id: 'e2', max: 15, self: 15, ai: 15 }] }
    ])
  })
})
