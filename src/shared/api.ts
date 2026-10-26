import type { Engine, Settings } from './settings-schema'
import type { VaultIndex } from './vault-types'
import type { LearnerAnswer } from './teacher-protocol'
import type { SessionState, SessionSummary } from '../main/session/events'

export type { SessionState, SessionSummary }

export type EngineStatus = 'idle' | 'busy' | 'auth' | 'missing' | 'error'
export type VaultResult = VaultIndex | { error: 'missing' | 'unreadable'; path: string }

export const CH = {
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  settingsChooseVault: 'settings:choose-vault',
  vaultIndex: 'vault:index',
  vaultChanged: 'vault:changed',
  aiStatus: 'ai:status',
  aiStatusChanged: 'ai:status-changed',
  openExternal: 'app:open-external',
  sessionStart: 'session:start',
  sessionList: 'session:list',
  sessionGet: 'session:get',
  sessionAnswer: 'session:answer',
  sessionSay: 'session:say',
  sessionRetry: 'session:retry',
  sessionUpdated: 'session:updated'
} as const

export interface SinapsiApi {
  settings: {
    get(): Promise<Settings>
    set(patch: Partial<Settings>): Promise<Settings>
    chooseVault(): Promise<Settings>
  }
  vault: {
    index(): Promise<VaultResult>
    onChange(cb: (index: VaultIndex) => void): () => void
  }
  ai: {
    status(): Promise<Record<Engine, EngineStatus>>
    onStatus(cb: (s: Record<Engine, EngineStatus>) => void): () => void
  }
  app: { openExternal(url: string): Promise<void> }
  session: {
    start(topic: string): Promise<string>
    list(): Promise<SessionSummary[]>
    get(id: string): Promise<SessionState>
    answer(id: string, a: LearnerAnswer): Promise<void>
    say(id: string, text: string): Promise<void>
    retry(id: string): Promise<void>
    onUpdate(cb: (s: SessionState) => void): () => void
  }
}
