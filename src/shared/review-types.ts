import type { ChainExercise, Exercise } from './exercise-schema'
import type { Grade } from './memory-types'

export type ExplainTurn = { by: 'andrea' | 'claude'; text: string }

export type ReviewItem = {
  cascadeOf?: string
  conceptId: string
  name: string
  notePath: string
  noteTitle: string
  subject: string | null
  R: number | null
  exercise: Exercise | ChainExercise
  variantId: string | null
  represented?: boolean
  representedCount?: number
}

export type ReviewPlan = {
  items: ReviewItem[]
  due: number
  toStudy: { conceptId: string; name: string; noteTitle: string }[]
}

export type GradeResult = { verdict: 'ok' | 'partial' | 'wrong'; feedback: string; proposed: Grade }

/** A "Spiegalo tu" turn: the picky student asks for the missing step, or gives the verdict. */
export type ExplainResult = { kind: 'question'; question: string } | ({ kind: 'verdict' } & GradeResult)

export type ReviewSession = { id: string; at: number; count: number; conceptIds: string[]; topic: string }
