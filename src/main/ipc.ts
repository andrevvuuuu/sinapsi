import { BrowserWindow, dialog, ipcMain, powerMonitor, powerSaveBlocker, shell } from 'electron'
import { join } from 'node:path'
import { CH } from '../shared/api'
import { createBridge, type Bridge } from './ai/bridge'
import { nodeSpawn } from './ai/engines'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { makeGraphHandlers, makeHandlers, makeNoteHandlers, makeSessionHandlers } from './ipc-handlers'
import { fakeExtractBridge } from './graph/fake-extract'
import { createExtractor, type Extractor } from './graph/jobs'
import { graphStore } from './graph/store'
import { fakeNoteBridge } from './notes/fake-note'
import { createNoteGenerator } from './notes/generator'
import { fakeTeacher } from './session/fake-teacher'
import { createSessionRunner } from './session/runner'
import { dataDir } from './store/paths'
import { loadSettings, saveSettings } from './store/settings'
import { scanVault } from './vault/scan'
import { watchVault } from './vault/watch'

export function registerIpc(): { bridge: Bridge } {
  // Assigned below; the session and note hooks only run after registration.
  // eslint-disable-next-line prefer-const
  let extractor: Extractor
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
    onUpdate: (s) => {
      broadcast(CH.sessionUpdated, s)
      // Studying a note is the moment to (re)extract its concepts.
      if (s.phase === 'done' && s.notePath) void extractor.request(s.notePath, 'study').catch(() => undefined)
    }
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
    onUpdate: (m) => {
      broadcast(CH.notesUpdated, m)
      if (m.status === 'ready') void extractor.request(m.sourcePath, 'study').catch(() => undefined)
    }
  })
  const nh = makeNoteHandlers(notes)
  ipcMain.handle(CH.notesCreate, (_e, req) => nh.create(req))
  ipcMain.handle(CH.notesList, () => nh.list())
  ipcMain.handle(CH.notesGet, (_e, id) => nh.get(id))
  ipcMain.handle(CH.notesRetry, (_e, id) => nh.retry(id))

  const graphDir = join(dataDir(), 'graph')
  const store = graphStore(graphDir)
  const vaultOrNull = async (): Promise<import('../shared/vault-types').VaultIndex | null> => {
    const idx = await h.vaultIndex()
    return 'error' in idx ? null : idx
  }
  extractor = createExtractor({
    bridge: process.env.SINAPSI_FAKE_EXTRACT === '1' ? fakeExtractBridge() : bridge,
    store,
    vault: vaultOrNull,
    readNote: (path) => readFile(path, 'utf8'),
    workDir: join(dataDir(), 'ai-work'),
    keepAwake: () => {
      const id = powerSaveBlocker.start('prevent-app-suspension')
      return () => powerSaveBlocker.stop(id)
    },
    onChange: (status) => void extractor.graph().then((graph) => broadcast(CH.graphChanged, { status, graph }), () => broadcast(CH.graphChanged, { status })),
    priorities: async () => {
      const idx = await vaultOrNull()
      if (!idx) return []
      const paths = new Set((await notes.list()).map((m) => m.sourcePath))
      return [...new Set(idx.notes.filter((n) => paths.has(n.path) && n.subject).map((n) => n.subject as string))]
    }
  })
  const positionsFile = join(graphDir, 'positions.json')
  const gh = makeGraphHandlers(extractor, {
    read: async () => JSON.parse(await readFile(positionsFile, 'utf8')),
    write: async (p) => {
      await mkdir(graphDir, { recursive: true })
      await writeFile(positionsFile + '.tmp', JSON.stringify(p), 'utf8')
      await rename(positionsFile + '.tmp', positionsFile)
    }
  })
  ipcMain.handle(CH.graphGet, () => gh.get())
  ipcMain.handle(CH.graphStatus, () => gh.status())
  ipcMain.handle(CH.graphExtract, (_e, path, reason) => gh.extract(path, reason))
  ipcMain.handle(CH.graphPositions, () => gh.positions())
  ipcMain.handle(CH.graphSavePositions, (_e, p) => gh.savePositions(p))

  // Background extraction: a few notes a day, only while the Mac is idle.
  const tick = async (): Promise<void> => {
    const s = await settings.load()
    await extractor.backgroundTick({ idleSeconds: powerMonitor.getSystemIdleTime(), enabled: s.backgroundExtraction, dailyLimit: s.dailyExtractionLimit })
  }
  if (process.env.SINAPSI_FAKE_EXTRACT !== '1') setInterval(() => void tick().catch((e) => console.warn('[graph] background', e)), 10 * 60_000)
  return { bridge }
}
