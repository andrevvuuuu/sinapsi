import { describe, expect, it } from 'vitest'
import { reducePractice, type PracticeEvent } from '../../src/main/practice/events'

const material = { conceptIds: ['n_1'], sourceIds: [], free: '' }
const problem = { id: 'p1', statement: 'Mostra che…', mode: 'recall' as const, targets: ['n_1'], modelSolution: 'SEGRETO' }
const base: PracticeEvent[] = [
  { t: 'created', id: 'a', mode: 'train', material, topic: 'Rolle', at: 1 },
  { t: 'learner', submission: { kind: 'start' }, text: 'Inizia', at: 2 },
  { t: 'tutor', turn: { phase: 'warmup', blocks: [{ type: 'text', md: 'Si parte.' }], problem }, conversationId: 'c1', at: 3 }
]

describe('reducePractice — training', () => {
  it('opens a problem and keeps its solution out of the public state', () => {
    const s = reducePractice(base)
    expect(s).toMatchObject({ id: 'a', mode: 'train', topic: 'Rolle', phase: 'warmup', active: 'p1', awaiting: 'learner', paused: false, conversationId: 'c1', hasTutorTurn: true })
    expect(s.problems[0]).toMatchObject({ id: 'p1', status: 'active', hints: 0, maxRung: null, phase: 'warmup' })
    expect(JSON.stringify(s)).not.toContain('SEGRETO')
  })
  it('stores the compass and gates continuation until a restatement follows R3+', () => {
    const compass = { known: 'definizione', stuck: 'ipotesi', question: 'Quale teorema?' }
    const s = reducePractice([
      ...base,
      { t: 'learner', submission: { kind: 'compass', compass }, text: 'Bussola', at: 4 },
      { t: 'tutor', turn: { phase: 'warmup', blocks: [], hint: { rung: 3, md: 'x' } }, at: 5 }
    ])
    expect(s.problems[0]).toMatchObject({ compass, needsRestate: true })
    const cleared = reducePractice([
      ...base,
      { t: 'learner', submission: { kind: 'compass', compass }, text: 'Bussola', at: 4 },
      { t: 'tutor', turn: { phase: 'warmup', blocks: [], hint: { rung: 3, md: 'x' } }, at: 5 },
      { t: 'learner', submission: { kind: 'restate', text: 'A mia parole' }, text: 'Riformulo', at: 6 }
    ])
    expect(cleared.problems[0].needsRestate).toBe(false)
  })
  it('counts hints, then concludes, reveals the solution and pauses until "next"', () => {
    const s = reducePractice([
      ...base,
      { t: 'learner', submission: { kind: 'hint' }, text: 'Mi serve un indizio.', at: 4 },
      { t: 'tutor', turn: { phase: 'warmup', blocks: [], hint: { rung: 0, md: 'Rileggi.' } }, at: 5 },
      { t: 'learner', submission: { kind: 'hint' }, text: 'Mi serve un indizio.', at: 6 },
      { t: 'tutor', turn: { phase: 'warmup', blocks: [], hint: { rung: 2, md: 'Un teorema.' } }, at: 7 },
      { t: 'learner', submission: { kind: 'thinking', text: 'valor medio' }, text: 'Il mio ragionamento: valor medio', at: 8 },
      { t: 'tutor', turn: { phase: 'warmup', blocks: [{ type: 'text', md: 'Corretto.' }], conclude: { outcome: 'solved_hints', verdict: 'Con aiuti.', retest: true, miss: 'cue' } }, at: 9 }
    ])
    expect(s.problems[0]).toMatchObject({ status: 'done', hints: 2, maxRung: 2, outcome: 'solved_hints', verdict: 'Con aiuti.', retest: true, modelSolution: 'SEGRETO' })
    expect(s.active).toBeUndefined()
    expect(s.paused).toBe(true)
    const next = reducePractice([...base.slice(0, 2), ...base.slice(2), { t: 'tutor', turn: { phase: 'warmup', blocks: [], conclude: { outcome: 'solved', verdict: 'ok', retest: false } }, at: 9 }, { t: 'learner', submission: { kind: 'next' }, text: 'Prossimo problema.', at: 10 }])
    expect(next.paused).toBe(false)
    expect(next.awaiting).toBe('tutor')
  })
  it('an error asks for a retry, and the summary ends the session', () => {
    expect(reducePractice([...base, { t: 'learner', submission: { kind: 'hint' }, text: 'x', at: 4 }, { t: 'error', message: 'quota', at: 5 }]).awaiting).toBe('retry')
    const done = reducePractice([...base, { t: 'tutor', turn: { phase: 'done', blocks: [], summary: { solved: ['a'], retest: [], note: 'n' } }, at: 6 }])
    expect(done.summary).toEqual({ solved: ['a'], retest: [], note: 'n' })
    expect(done.phase).toBe('done')
  })
})

describe('reducePractice — exam', () => {
  const sheet = { title: 'Analisi', problems: [{ id: 'e1', statement: 'Calcola…', points: 18, targets: ['n_1'], modelSolution: 'SOL1' }, { id: 'e2', statement: 'Dimostra…', points: 12, targets: [], modelSolution: 'SOL2' }] }
  const exam: PracticeEvent[] = [
    { t: 'created', id: 'b', mode: 'exam', material, topic: 'Analisi', durationMin: 60, at: 1 },
    { t: 'exam', sheet, endsAt: 1 + 3_600_000, at: 2 }
  ]
  it('hides the solutions until graded, and keeps draft answers', () => {
    const s = reducePractice([...exam, { t: 'answers', answers: { e1: 'bozza' }, final: false, at: 3 }])
    expect(JSON.stringify(s)).not.toMatch(/SOL1|SOL2/)
    expect(s.exam).toMatchObject({ endsAt: 3_600_001, answers: { e1: 'bozza' }, delivered: false })
    expect(s.exam!.sheet.problems.map((p) => p.points)).toEqual([18, 12])
  })
  it('shows grade and solutions after grading', () => {
    const s = reducePractice([
      ...exam,
      { t: 'answers', answers: { e1: 'r1', e2: 'r2' }, final: true, at: 3 },
      { t: 'graded', grade: { items: [{ id: 'e1', points: 18, comment: 'ok' }, { id: 'e2', points: 6, comment: 'metà' }], note: 'Bene', total: 24, lode: false }, at: 4 }
    ])
    expect(s.exam).toMatchObject({ delivered: true, grade: { total: 24 } })
    expect(s.exam!.sheet.problems[0].modelSolution).toBe('SOL1')
    expect(s.phase).toBe('done')
  })
  it('a delivery whose grading failed asks for a retry', () => {
    expect(reducePractice([...exam, { t: 'answers', answers: {}, final: true, at: 3 }, { t: 'error', message: 'x', at: 4 }]).awaiting).toBe('retry')
  })
})
