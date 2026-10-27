import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { CH } from '../shared/api'
import { createBridge, type Bridge } from './ai/bridge'
import { nodeSpawn } from './ai/engines'
import { readFile } from 'node:fs/promises'
import { makeHandlers, makeNoteHandlers, makeSessionHandlers } from './ipc-handlers'
import { fakeNoteBridge } from './notes/fake-note'
import { createNoteGenerator } from './notes/generator'
import { fakeTeacher } from './session/fake-teacher'
import { createSessionRunner } from './session/runner'
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

  const runner = createSessionRunner({
    bridge: process.env.SINAPSI_FAKE_TEACHER === '1' ? fakeTeacher() : bridge,
    dir: join(dataDir(), 'sessions'),
    vault: async () => {
      const idx = await h.vaultIndex()
      return 'error' in idx ? null : idx
    },
    readNote: (path) => readFile(path, 'utf8'),
    onUpdate: (s) => broadcast(CH.sessionUpdated, s)
  })
  const sh = makeSessionHandlers(runner)
  // Turns can take a while: the window learns progress through session:updated, so these return at once.
  const background = (p: Promise<unknown>): void => void p.catch((e) => console.warn('[session]', e))
  ipcMain.handle(CH.sessionStart, async (_e, topic) => {
    const id = await sh.start(topic)
    background(sh.retry(id))
    return id
  })
  ipcMain.handle(CH.sessionList, () => sh.list())
  ipcMain.handle(CH.sessionGet, (_e, id) => sh.get(id))
  ipcMain.handle(CH.sessionAnswer, (_e, id, a) => background(sh.answer(id, a)))
  ipcMain.handle(CH.sessionSay, (_e, id, text) => background(sh.say(id, text)))
  ipcMain.handle(CH.sessionRetry, (_e, id) => background(sh.retry(id)))

  const notes = createNoteGenerator({
    bridge: process.env.SINAPSI_FAKE_NOTE === '1' ? fakeNoteBridge() : bridge,
    dir: join(dataDir(), 'notes'),
    workDir: join(dataDir(), 'ai-work'),
    vault: async () => {
      const idx = await h.vaultIndex()
      return 'error' in idx ? null : idx
    },
    readNote: (path) => readFile(path, 'utf8'),
    session: (id) => runner.get(id).catch(() => null),
    onUpdate: (m) => broadcast(CH.notesUpdated, m)
  })
  const nh = makeNoteHandlers(notes)
  ipcMain.handle(CH.notesCreate, (_e, req) => nh.create(req))
  ipcMain.handle(CH.notesList, () => nh.list())
  ipcMain.handle(CH.notesGet, (_e, id) => nh.get(id))
  ipcMain.handle(CH.notesRetry, (_e, id) => nh.retry(id))
  return { bridge }
}
