import { z } from 'zod'
import { EXERCISE_TYPES } from './memory-types'

export const TASKS = ['extract', 'note', 'variants', 'teach', 'grade'] as const
export type Task = (typeof TASKS)[number]
export type Engine = 'agy' | 'claude'

const EngineChoice = z.object({ engine: z.enum(['agy', 'claude']), model: z.string().optional() })
export type EngineChoice = z.infer<typeof EngineChoice>

const GEMINI: EngineChoice = { engine: 'agy', model: 'gemini-3.8-flash-high' }
// Medium: high made the agent think for minutes on short replies (spike, 27/10).
const GEMINI_MEDIUM: EngineChoice = { engine: 'agy', model: 'gemini-3.8-flash-medium' }
const CLAUDE: EngineChoice = { engine: 'claude', model: 'sonnet' }
export const DEFAULT_ENGINES: Record<Task, EngineChoice> = {
  extract: GEMINI_MEDIUM,
  note: GEMINI_MEDIUM,
  variants: GEMINI,
  teach: CLAUDE,
  grade: CLAUDE
}
/** Minutes of study between two suggested micro-pauses. */
export const MICRO_PAUSE_EVERY = 10
/** Length of a micro-pause, in seconds (Master Plan: 10–20 s of rest for neural replay). */
export const MICRO_PAUSE_SECONDS = 15
/** The pause the Master Plan pairs with a session limit, in minutes (default 50 + 10). */
export const SESSION_BREAK_MINUTES = 10
export const DEFAULT_EXCLUDED = ['.obsidian', '.antigravity', '.trash', 'Prompts']

/** Every field falls back to its default on its own, so a partial or damaged file still loads. */
export function settingsSchema(home: string) {
  return z.object({
    vaultPath: z.string().min(1).catch(`${home}/Obsidian Vault`),
    theme: z.enum(['lavagna', 'trattato', 'system']).catch('system'),
    engines: z
      .object(
        Object.fromEntries(TASKS.map((t) => [t, EngineChoice.catch(DEFAULT_ENGINES[t])])) as Record<
          Task,
          z.ZodCatch<typeof EngineChoice>
        >
      )
      .catch(DEFAULT_ENGINES),
    excludedFolders: z.array(z.string()).catch(DEFAULT_EXCLUDED),
    backgroundExtraction: z.boolean().catch(true),
    dailyExtractionLimit: z.number().int().min(0).max(50).catch(6),
    reviewSessionSize: z.number().int().min(1).max(20).catch(12),
    exerciseTypes: z
      .array(z.enum(EXERCISE_TYPES))
      .min(1)
      .catch([...EXERCISE_TYPES]),
    gamesInSessions: z.boolean().catch(true),
    studyHours: z.array(z.number().min(0).max(16).multipleOf(0.5)).length(7).catch([3, 3, 3, 3, 3, 2, 1]),
    planBuffer: z.number().min(0.15).max(0.2).catch(0.15),
    /** Optional: a short break suggested every MICRO_PAUSE_EVERY minutes of a study session. */
    microPauses: z.boolean().catch(false),
    /** Optional: a cap on one study session's length. */
    sessionLimit: z.boolean().catch(false),
    sessionLimitMinutes: z.number().int().min(10).max(180).catch(50),
    /** Sidebar subjects (top vault folders) in the chosen order. */
    subjectOrder: z.array(z.string()).catch([]),
    /** The university subjects; null until chosen (the sidebar guesses from the lesson tutor). */
    universitySubjects: z.array(z.string()).nullable().catch(null)
  })
}
export type Settings = z.infer<ReturnType<typeof settingsSchema>>
