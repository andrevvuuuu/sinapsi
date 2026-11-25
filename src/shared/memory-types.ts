import { z } from 'zod'
import { MISSES } from './practice-protocol'
import type { ProceduralLens } from './procedural'

export const MISCONCEPTION_CONFIDENCE = 63 // gradino "Abbastanza sicuro" (livelli 12/37/63/88)
export const GUESS_CONFIDENCE = 25         // sotto: "Tiro a indovinare"
export type Outcome = 'wrong' | 'dontKnow' | 'partial' | 'correct'

export const EXERCISE_TYPES = ['open', 'mc', 'truefalse', 'order', 'fill', 'match', 'counterexample', 'estimate', 'spoterror', 'graph', 'explain', 'chain'] as const
export type ExerciseType = (typeof EXERCISE_TYPES)[number]
export type Grade = 1 | 2 | 3 | 4

/** Unica politica di voto per Studio, Ripasso, Pratica, Esame. Easy (4) mai automatico. */
export function gradeFromOutcome(o: { outcome: Outcome; assisted?: boolean; confidence?: number }): Grade {
  if (o.outcome !== 'correct') {
    return 1
  }
  const isGuess = typeof o.confidence === 'number' && o.confidence < GUESS_CONFIDENCE
  if (o.assisted || isGuess) {
    return 2
  }
  return 3
}

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
  via: z.enum(['review', 'practice', 'session']).optional(),
  source: z.enum(['session-llm', 'session-choice']).optional(),
  sessionId: z.string().max(64).optional(),
  evidence: z.enum(['probe', 'retest', 'recall', 'immediate']).optional(),
  miss: z.enum(MISSES).optional(),
  /** Where in Pratica it came from ("exam:<id>:<problem>"): grading again never writes it twice. */
  ref: z.string().max(200).optional(),
  /** The Registro Lezioni lesson that launched the session, if any. */
  lessonId: z.string().max(64).optional(),
  rung: z.number().int().min(0).max(5).optional(),
  contested: z.boolean().optional()
})
export type ReviewLine = z.infer<typeof ReviewLineSchema>

export const WeaknessLineSchema = z.object({ id: z.string().max(64), conceptId: z.string().optional(), text: z.string().max(300), kind: z.enum(['misconception', 'gap', 'execution', 'discrimination']), source: z.enum(['session', 'practice', 'review']), ref: z.string().max(200).optional(), at: z.number(), status: z.enum(['active', 'resolved']) })
export type WeaknessLine = z.infer<typeof WeaknessLineSchema>

export const MISCONCEPTION_KINDS = ['misconception', 'discrimination'] as const
export type MisconceptionKind = (typeof MISCONCEPTION_KINDS)[number]

export function misconceptionConceptIds(ws: WeaknessLine[]): Set<string> {
  const set = new Set<string>()
  for (const w of ws) {
    if (w.status === 'active' && (MISCONCEPTION_KINDS as readonly string[]).includes(w.kind) && w.conceptId) {
      set.add(w.conceptId)
    }
  }
  return set
}

export function sessionGrade(v: { verdict: 'correct' | 'partial' | 'incorrect'; hintsUsed?: number }): Grade {
  return gradeFromOutcome({
    outcome: v.verdict === 'correct' ? 'correct' : v.verdict === 'partial' ? 'partial' : 'wrong',
    assisted: (v.hintsUsed ?? 0) > 0
  })
}

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
  /** The last answer was wrong and given with confidence ≥ 63 (MISCONCEPTION_CONFIDENCE). */
  misconception: boolean
  /** FSRS stability in days: how long until R falls to 90%. */
  stability?: number
  /** The grade of the last review. */
  lastGrade?: Grade
  /** Practice-only derived lens; never scheduled or persisted. */
  procedural?: ProceduralLens
}

export const stateOf = (R: number | null): MemoryState => (R === null ? 'mai visto' : R >= 0.85 ? 'la sai' : R >= 0.6 ? 'incerto' : 'debole')

/**
 * The grade the app proposes (Andrea can change it): correct unaided → Bene (3);
 * correct but assisted or guess (< 25) → Difficile (2); wrong, partial or "Non lo so" → Di nuovo (1).
 */
export function proposeGrade(r: { correct: boolean | 'partial'; confidence: number; dontKnow?: boolean }): Grade {
  return gradeFromOutcome({
    outcome: r.dontKnow ? 'dontKnow' : r.correct === true ? 'correct' : r.correct === 'partial' ? 'partial' : 'wrong',
    confidence: r.confidence
  })
}
