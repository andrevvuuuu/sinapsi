import { z } from 'zod'

export const EXERCISE_TYPES = ['open', 'mc', 'truefalse', 'order', 'fill', 'match', 'counterexample', 'estimate', 'spoterror', 'graph', 'explain'] as const
export type ExerciseType = (typeof EXERCISE_TYPES)[number]
export type Grade = 1 | 2 | 3 | 4

/** One review: the only memory evidence. FSRS state is rebuilt from these. */
export const ReviewLineSchema = z.object({
  conceptId: z.string(),
  at: z.number(),
  grade: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  confidence: z.number().min(0).max(100).optional(),
  correct: z.boolean().optional(),
  dontKnow: z.boolean().optional(),
  variantId: z.string().optional(),
  type: z.enum(EXERCISE_TYPES).optional(),
  misconception: z.boolean().optional(),
  /** Where the evidence came from: a Ripasso item (default) or a concluded Pratica problem. */
  via: z.enum(['review', 'practice']).optional(),
  /** Where in Pratica it came from ("exam:<id>:<problem>"): grading again never writes it twice. */
  ref: z.string().max(200).optional(),
  /** The Registro Lezioni lesson that launched the session, if any. */
  lessonId: z.string().max(64).optional()
})
export type ReviewLine = z.infer<typeof ReviewLineSchema>

export type MemoryState = 'mai visto' | 'la sai' | 'incerto' | 'debole'
export type Memory = {
  conceptId: string
  state: MemoryState
  /** Probability of recalling it now (FSRS retrievability); null when never reviewed. */
  R: number | null
  due: number | null
  reps: number
  lapses: number
  lastAt: number | null
  /** The last answer was wrong and given with confidence ≥ 70. */
  misconception: boolean
  /** FSRS stability in days: how long until R falls to 90%. */
  stability?: number
  /** The grade of the last review. */
  lastGrade?: Grade
}

export const stateOf = (R: number | null): MemoryState => (R === null ? 'mai visto' : R >= 0.85 ? 'la sai' : R >= 0.6 ? 'incerto' : 'debole')

/**
 * The grade the app proposes (Andrea can change it): sure and right → Bene; right but unsure →
 * Difficile; half right → Difficile; wrong or "Non lo so" → Di nuovo.
 */
export function proposeGrade(r: { correct: boolean | 'partial'; confidence: number; dontKnow?: boolean }): Grade {
  if (r.dontKnow || r.correct === false) return 1
  if (r.correct === 'partial') return 2
  return r.confidence < 50 ? 2 : 3
}
