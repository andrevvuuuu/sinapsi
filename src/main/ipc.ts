import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { CH } from '../shared/api'
import { createBridge, type Bridge } from './ai/bridge'
import { nodeSpawn } from './ai/engines'
import { makeHandlers } from './ipc-handlers'
import { dataDir } from './store/paths'
import { loadSettings, saveSettings } from './store/settings'
import { scanVault } from './vault/scan'
import { watchVault } from './vault/watch'

export function registerIpc(): { bridge: Bridge } {
  const bridge = createBridge({
    spawn: nodeSpawn,
    cacheDir: join(dataDir(), 'ai-cache'),
    usageFile: join(dataDir(), 'ai-usage.jsonl'),
    engines: async () => (await loadSettings()).engines
  })
  const settings = process.env.SINAPSI_VAULT
    ? { load: async () => ({ ...(await loadSettings()), vaultPath: process.env.SINAPSI_VAULT! }), save: saveSettings }
    : { load: loadSettings, save: saveSettings }
  const h = makeHandlers({
    loadSettings: settings.load,
    saveSettings: settings.save,
    scan: scanVault,
    aiStatus: () => bridge.status(),
    openExternal: (url) => shell.openExternal(url),
    chooseFolder: async () => {
      const r = await dialog.showOpenDialog({ title: 'Scegli la cartella del vault Obsidian', properties: ['openDirectory'] })
      return r.canceled ? null : r.filePaths[0]
    }
  })
  const broadcast = (channel: string, payload: unknown): void => BrowserWindow.getAllWindows().forEach((w) => w.webContents.send(channel, payload))

  let stopWatch: (() => void) | undefined
  async function rewatch(): Promise<void> {
    stopWatch?.()
    const s = await settings.load()
    try {
      stopWatch = watchVault(s.vaultPath, s.excludedFolders, async () => {
        const idx = await h.vaultIndex()
        if (!('error' in idx)) broadcast(CH.vaultChanged, idx)
      })
    } catch {
      stopWatch = undefined
    }
  }
  void rewatch()

  ipcMain.handle(CH.settingsGet, () => h.settingsGet())
  ipcMain.handle(CH.settingsSet, async (_e, patch) => {
    const s = await h.settingsSet(patch)
    if (patch && typeof patch === 'object' && 'vaultPath' in patch) void rewatch()
    return s
  })
  ipcMain.handle(CH.settingsChooseVault, async () => {
    const s = await h.settingsChooseVault()
    void rewatch()
    return s
  })
  ipcMain.handle(CH.vaultIndex, () => h.vaultIndex())
  ipcMain.handle(CH.aiStatus, () => h.aiStatus())
  ipcMain.handle(CH.openExternal, (_e, url) => h.openExternal(url))
  bridge.onStatus((s) => broadcast(CH.aiStatusChanged, s))
  return { bridge }
}
