import type { PracticeTurn, Problem, Submission } from '../../shared/practice-protocol'
import type { ExamGrade, ExamSheet, Material, PublicExamProblem } from '../../shared/practice-types'

export type PracticeEvent =
  | { t: 'created'; id: string; mode: 'train' | 'exam'; material: Material; topic: string; durationMin?: number; at: number }
  | { t: 'learner'; submission: Submission; text: string; at: number }
  | { t: 'tutor'; turn: PracticeTurn; conversationId?: string; at: number }
  | { t: 'error'; message: string; at: number }
  | { t: 'exam'; sheet: ExamSheet; endsAt: number; at: number }
  | { t: 'answers'; answers: Record<string, string>; final: boolean; at: number }
  | { t: 'graded'; grade: ExamGrade; at: number }

type PublicProblem = Omit<Problem, 'modelSolution'>
export type PracticeItem =
  | { kind: 'learner'; submission: Submission; text: string }
  | { kind: 'tutor'; turn: Omit<PracticeTurn, 'problem'> & { problem?: PublicProblem } }
  | { kind: 'error'; message: string }

export type PracticeProblem = PublicProblem & {
  status: 'active' | 'done'
  phase: PracticeTurn['phase']
  hints: number
  maxRung: number | null
  outcome?: NonNullable<PracticeTurn['conclude']>['outcome']
  verdict?: string
  miss?: NonNullable<PracticeTurn['conclude']>['miss']
  retest?: boolean
  /** Only once the problem is concluded. */
  modelSolution?: string
}

export type PracticeState = {
  id: string
  mode: 'train' | 'exam'
  material: Material
  topic: string
  durationMin?: number
  phase: PracticeTurn['phase']
  items: PracticeItem[]
  problems: PracticeProblem[]
  active?: string
  /** After a conclusion: questions are welcome, the next problem waits for "next". */
  paused: boolean
  awaiting: 'tutor' | 'learner' | 'retry'
  summary?: PracticeTurn['summary']
  conversationId?: string
  hasTutorTurn: boolean
  lastLearnerText?: string
  exam?: { sheet: { title: string; problems: PublicExamProblem[] }; endsAt: number; answers: Record<string, string>; delivered: boolean; grade?: ExamGrade }
  createdAt: number
  updatedAt: number
}
export type PracticeSummary = { id: string; topic: string; mode: 'train' | 'exam'; done: boolean; updatedAt: number }

/** A copy without the hidden solution. */
function withoutSolution<T extends { modelSolution?: string }>(p: T): Omit<T, 'modelSolution'> {
  const copy: Partial<T> = { ...p }
  delete copy.modelSolution
  return copy as Omit<T, 'modelSolution'>
}

/** Pure: the public state of a practice session, rebuilt from its log. Hidden solutions stay out until revealed. */
export function reducePractice(events: PracticeEvent[]): PracticeState {
  const s: PracticeState = { id: '', mode: 'train', material: { conceptIds: [], sourceIds: [], free: '' }, topic: '', phase: 'warmup', items: [], problems: [], paused: false, awaiting: 'learner', hasTutorTurn: false, createdAt: 0, updatedAt: 0 }
  let sheet: ExamSheet | undefined
  const solutions = new Map<string, string>()
  for (const e of events) {
    s.updatedAt = Math.max(s.updatedAt, e.at)
    switch (e.t) {
      case 'created':
        Object.assign(s, { id: e.id, mode: e.mode, material: e.material, topic: e.topic, durationMin: e.durationMin, createdAt: e.at })
        // An exam starts by generating its sheet.
        if (e.mode === 'exam') s.awaiting = 'tutor'
        break
      case 'learner':
        s.items.push({ kind: 'learner', submission: e.submission, text: e.text })
        if (e.submission.kind === 'next') s.paused = false
        s.lastLearnerText = e.text
        s.awaiting = 'tutor'
        break
      case 'tutor': {
        const { problem, ...rest } = e.turn
        const publicProblem = problem ? withoutSolution(problem) : undefined
        s.items.push({ kind: 'tutor', turn: publicProblem ? { ...rest, problem: publicProblem } : rest })
        s.phase = e.turn.phase
        s.hasTutorTurn = true
        if (e.conversationId) s.conversationId = e.conversationId
        if (problem && publicProblem) {
          solutions.set(problem.id, problem.modelSolution)
          s.problems.push({ ...publicProblem, status: 'active', phase: e.turn.phase, hints: 0, maxRung: null })
          s.active = problem.id
          s.paused = false
        }
        const p = s.problems.find((x) => x.id === s.active)
        if (e.turn.hint && p) {
          p.hints++
          p.maxRung = Math.max(p.maxRung ?? 0, e.turn.hint.rung)
        }
        if (e.turn.conclude && p) {
          Object.assign(p, { status: 'done', outcome: e.turn.conclude.outcome, verdict: e.turn.conclude.verdict, miss: e.turn.conclude.miss, retest: e.turn.conclude.retest, modelSolution: solutions.get(p.id) })
          s.active = undefined
          s.paused = true
        }
        // Closing the session with a problem still open: it counts as left, and its solution is shown.
        const open = s.problems.find((x) => x.id === s.active)
        if (e.turn.phase === 'done' && open) {
          Object.assign(open, { status: 'done', outcome: 'surrendered', verdict: 'Sessione chiusa con il problema aperto.', retest: true, modelSolution: solutions.get(open.id) })
          s.active = undefined
        }
        if (e.turn.summary) s.summary = e.turn.summary
        s.awaiting = 'learner'
        break
      }
      case 'error':
        s.items.push({ kind: 'error', message: e.message })
        s.awaiting = 'retry'
        break
      case 'exam':
        sheet = e.sheet
        s.exam = { sheet: { title: e.sheet.title, problems: e.sheet.problems.map(withoutSolution) }, endsAt: e.endsAt, answers: {}, delivered: false }
        s.awaiting = 'learner'
        break
      case 'answers':
        if (!s.exam) break
        // Drafts carry only the answers that changed; the delivery carries them all.
        s.exam.answers = e.final ? e.answers : Object.fromEntries(Object.entries({ ...s.exam.answers, ...e.answers }).filter(([, v]) => v !== ''))
        if (e.final) {
          s.exam.delivered = true
          s.awaiting = 'tutor'
        }
        break
      case 'graded':
        if (!s.exam || !sheet) break
        s.exam.grade = e.grade
        s.exam.sheet.problems = sheet.problems
        s.phase = 'done'
        s.awaiting = 'learner'
        break
    }
  }
  return s
}
