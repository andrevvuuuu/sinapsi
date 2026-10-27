import { z } from 'zod'

export const TASKS = ['extract', 'note', 'variants', 'notebook', 'teach', 'grade'] as const
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
  notebook: GEMINI,
  teach: CLAUDE,
  grade: CLAUDE
}
export const DEFAULT_EXCLUDED = ['.obsidian', '.antigravity', '.trash', 'Prompts']

/** Every field falls back to its default on its own, so a partial or damaged file still loads. */
export function settingsSchema(home: string) {
  return z.object({
    vaultPath: z.string().min(1).catch(`${home}/Obsidian Vault`),
    theme: z.enum(['lavagna', 'trattato', 'system']).catch('system'),
    engines: z
      .object(Object.fromEntries(TASKS.map((t) => [t, EngineChoice.catch(DEFAULT_ENGINES[t])])) as Record<Task, z.ZodCatch<typeof EngineChoice>>)
      .catch(DEFAULT_ENGINES),
    excludedFolders: z.array(z.string()).catch(DEFAULT_EXCLUDED),
    backgroundExtraction: z.boolean().catch(true),
    dailyExtractionLimit: z.number().int().min(0).max(50).catch(6)
  })
}
export type Settings = z.infer<ReturnType<typeof settingsSchema>>
