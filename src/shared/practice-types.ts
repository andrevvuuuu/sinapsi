import { z } from 'zod'
import { MISSES, type PracticeTurn, type Problem, type Submission } from './practice-protocol'
export const PRACTICE_MAX_CONCEPTS = 4

/** What a practice session is about: concepts from the graph, notebook sources, and/or Andrea's own words. */
export const MaterialSchema = z.object({
  conceptIds: z.array(z.string().min(1).max(64)).max(200),
  sourceIds: z.array(z.string().uuid()).max(100),
  free: z.string().max(20_000),
  lessonId: z.string().max(64).optional(),
  blind: z.boolean().optional()
})
export type Material = z.infer<typeof MaterialSchema>

export const ExamSheetSchema = z.object({
  title: z.string(),
  problems: z
    .array(z.object({ id: z.string().min(1), statement: z.string().min(1), points: z.number().positive(), targets: z.array(z.string()), modelSolution: z.string().min(1) }))
    .min(1)
    .max(12)
})
export type ExamSheet = z.infer<typeof ExamSheetSchema>
export type PublicExamProblem = Omit<ExamSheet['problems'][number], 'modelSolution'> & { modelSolution?: string }

export const ExamGradeReplySchema = z.object({
  items: z.array(z.object({ id: z.string(), points: z.number().min(0), comment: z.string(), miss: z.enum(MISSES).optional() })),
  note: z.string()
})
type ExamGradeReply = z.infer<typeof ExamGradeReplySchema>
/** In a paper exam each item also keeps the points Andrea gave before the correction. */
export type ExamGrade = { items: (ExamGradeReply['items'][number] & { self?: number })[]; note: string; total: number; lode: boolean }

export type CatalogConcept = { id: string; name: string; R: number | null; due: boolean; practiced: boolean }
export type Catalog = {
  subjects: { name: string; notes: { path: string; title: string; concepts: CatalogConcept[] }[] }[]
  sources: { id: string; title: string; kind: string; notebook: string; info: string }[]
  suggested: { id: string; name: string; why: string }[]
}

export type PublicProblem = Omit<Problem, 'modelSolution'>

export type PracticeItem =
  | { kind: 'learner'; submission: Submission; text: string }
  | { kind: 'tutor'; turn: Omit<PracticeTurn, 'problem'> & { problem?: PublicProblem } }
  | { kind: 'error'; message: string }

export type PracticeProblem = PublicProblem & {
  hintConcepts: string[]
  status: 'active' | 'done'
  phase: PracticeTurn['phase']
  hints: number
  maxRung: number | null
  /** Reasoning Andrea sent on this problem: until the first one, hints stop at the first rung. */
  attempts: number
  compass?: { known: string; stuck: string; question: string }
  needsRestate: boolean
  triageActive?: boolean
  triage?: string
  confidence?: number
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
  /** An exam written on paper, with the machine off: the answers are typed or photographed afterwards. */
  paper?: boolean
  triageEligible?: boolean
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
  exam?: {
    sheet: { title: string; problems: PublicExamProblem[] }
    endsAt: number
    answers: Record<string, string>
    /** Sent to the grader. In a paper exam this comes after "handed" and the self-grades. */
    delivered: boolean
    handed?: boolean
    self?: Record<string, number>
    grade?: ExamGrade
  }
  createdAt: number
  updatedAt: number
}

export type PracticeSummary = { id: string; topic: string; mode: 'train' | 'exam'; done: boolean; updatedAt: number }
