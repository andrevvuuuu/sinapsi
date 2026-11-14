import { z } from 'zod'
import { EXERCISE_TYPES } from './memory-types'

export const TASKS = ['extract', 'note', 'variants', 'teach', 'grade', 'photo'] as const
export type Task = (typeof TASKS)[number]

export const DEFAULT_MODELS: Record<Task, string> = {
  extract: 'google/gemini-2.5-flash',
  note: 'google/gemini-2.5-flash',
  variants: 'google/gemini-2.5-flash',
  teach: 'anthropic/claude-sonnet-5.5',
  grade: 'anthropic/claude-sonnet-5.5',
  photo: 'google/gemini-2.5-flash'
}

export const TASK_IT: Record<Task, string> = {
  extract: 'Estrazione concetti',
  note: 'Note vive',
  variants: 'Varianti di ripasso',
  teach: 'Tutor e compiti',
  grade: 'Correzione risposte',
  photo: 'Lettura foto'
}

/** Minutes of study between two suggested micro-pauses. */
export const MICRO_PAUSE_EVERY = 10
/** Length of a micro-pause, in seconds (Master Plan: 10–20 s of rest for neural replay). */
export const MICRO_PAUSE_SECONDS = 15
/** The pause the Master Plan pairs with a session limit, in minutes (default 50 + 10). */
export const SESSION_BREAK_MINUTES = 10
export const DEFAULT_EXCLUDED = ['.obsidian', '.antigravity', '.trash', 'Prompts']

const baseSettingsSchema = z.object({
  vaultPath: z.string().catch(''),
  theme: z.enum(['lavagna', 'trattato', 'system']).catch('system'),
  models: z
    .object(
      Object.fromEntries(
        TASKS.map((t) => [t, z.string().min(1).catch(DEFAULT_MODELS[t])])
      ) as Record<Task, z.ZodCatch<z.ZodString>>
    )
    .catch(DEFAULT_MODELS),
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

export type Settings = z.infer<typeof baseSettingsSchema>

/** Every field falls back to its default on its own, so a partial or damaged file still loads. */
export function settingsSchema(_home?: string): z.ZodType<Settings> {
  void _home
  return z.preprocess((val) => {
    if (!val || typeof val !== 'object') return val
    const obj = { ...(val as Record<string, unknown>) }
    // Migrate legacy engines field if models is absent
    if (!obj.models && obj.engines && typeof obj.engines === 'object') {
      obj.models = { ...DEFAULT_MODELS }
    }
    return obj
  }, baseSettingsSchema)
}
