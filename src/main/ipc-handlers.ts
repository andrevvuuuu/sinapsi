import { access } from 'node:fs/promises'
import { z } from 'zod'
import type { EngineStatus, VaultResult } from '../shared/api'
import { TASKS, type Engine, type Settings } from '../shared/settings-schema'
import { LearnerAnswerSchema, type LearnerAnswer } from '../shared/teacher-protocol'
import type { SessionRunner } from './session/runner'
import type { VaultIndex } from '../shared/vault-types'

const Choice = z.object({ engine: z.enum(['agy', 'claude']), model: z.string().optional() }).strict()
const Patch = z
  .object({
    vaultPath: z.string().min(1),
    theme: z.enum(['lavagna', 'trattato', 'system']),
    engines: z.object(Object.fromEntries(TASKS.map((t) => [t, Choice])) as Record<(typeof TASKS)[number], typeof Choice>).strict(),
    excludedFolders: z.array(z.string())
  })
  .partial()
  .strict()

export interface HandlerDeps {
  loadSettings(): Promise<Settings>
  saveSettings(patch: Partial<Settings>): Promise<Settings>
  scan(root: string, excluded: string[]): Promise<VaultIndex>
  aiStatus(): Record<Engine, EngineStatus>
  openExternal(url: string): Promise<void>
  chooseFolder(): Promise<string | null>
}

/** Pure handlers: every payload from the window is validated here before use. */
export function makeHandlers(d: HandlerDeps) {
  return {
    settingsGet: () => d.loadSettings(),
    settingsSet: async (patch: unknown) => d.saveSettings(Patch.parse(patch) as Partial<Settings>),
    async settingsChooseVault(): Promise<Settings> {
      const dir = await d.chooseFolder()
      return dir ? d.saveSettings({ vaultPath: dir }) : d.loadSettings()
    },
    async vaultIndex(): Promise<VaultResult> {
      const s = await d.loadSettings()
      try {
        await access(s.vaultPath)
      } catch {
        return { error: 'missing', path: s.vaultPath }
      }
      try {
        return await d.scan(s.vaultPath, s.excludedFolders)
      } catch {
        return { error: 'unreadable', path: s.vaultPath }
      }
    },
    aiStatus: async () => d.aiStatus(),
    async openExternal(url: unknown): Promise<void> {
      const u = z.string().parse(url)
      if (!/^(obsidian|https):\/\//.test(u)) throw new Error('link non consentito')
      await d.openExternal(u)
    }
  }
}
export type Handlers = ReturnType<typeof makeHandlers>

const Id = z.string().uuid()
const Topic = z.string().trim().min(1).max(500)
const Text = z.string().trim().min(1).max(5000)

/** Session handlers: validate everything coming from the window, then delegate to the runner. */
export function makeSessionHandlers(runner: SessionRunner) {
  return {
    start: async (topic: unknown) => runner.create(Topic.parse(topic)),
    list: () => runner.list(),
    get: async (id: unknown) => runner.get(Id.parse(id)),
    answer: async (id: unknown, a: unknown) => runner.answer(Id.parse(id), LearnerAnswerSchema.parse(a) as LearnerAnswer),
    say: async (id: unknown, text: unknown) => runner.say(Id.parse(id), Text.parse(text)),
    retry: async (id: unknown) => runner.retry(Id.parse(id))
  }
}
