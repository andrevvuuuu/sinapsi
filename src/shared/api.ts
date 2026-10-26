import type { Engine, Settings } from './settings-schema'
import type { VaultIndex } from './vault-types'

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
  openExternal: 'app:open-external'
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
}
