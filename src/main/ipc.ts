import { app, BrowserWindow, dialog, ipcMain, powerMonitor, powerSaveBlocker, shell, systemPreferences } from 'electron'
import { join } from 'node:path'
import { CH } from '../shared/api'
import { createBridge, type Bridge } from './ai/bridge'
import { nodeSpawn } from './ai/engines'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { makeGraphHandlers, makeHandlers, makeNotebookHandlers, makeNoteHandlers, makePracticeHandlers, makeReviewHandlers, makeSessionHandlers, practiceTopic } from './ipc-handlers'
import { createExamService } from './practice/exam'
import { fakeTutor } from './practice/fake-tutor'
import { buildCatalog, buildMaterialContext } from './practice/material'
import { cleanupPhotos, transcribePhoto } from './practice/photo'
import { createPracticeRunner } from './practice/runner'
import { createNotebookChat } from './notebook/chat'
import { fakeMedia } from './notebook/fake-media'
import { fakeNotebookBridge } from './notebook/fake-notebook'
import { notebookSourcesFor } from './notebook/for-notes'
import { ACCEPTED_EXTENSIONS, createIngestor } from './notebook/ingest'
import { notebookStore } from './notebook/store'
import { fakeReviewBridge } from './memory/fake-review'
import { createReviewService } from './memory/review'
import { memoryOf } from './memory/fsrs'
import { memoryStore } from './memory/store'
import { reviewSessions } from './memory/history'
import { variantsStore } from './memory/variants'
import { transcribeVoice } from './memory/voice'
import { fakeExtractBridge } from './graph/fake-extract'
import { createExtractor, type Extractor } from './graph/jobs'
import { graphStore } from './graph/store'
import { fakeNoteBridge } from './notes/fake-note'
import { createNoteGenerator } from './notes/generator'
import { readySources } from './notes/store'
import { createLinkedSync } from './vault/linked'
import { fakeTeacher } from './session/fake-teacher'
import { createSessionRunner } from './session/runner'
import { memoryBrief } from './session/memory-brief'
import { createSuggester } from './suggest/suggest'
import { appendJsonl } from './store/jsonl'
import { dataDir } from './store/paths'
import { loadSettings, saveSettings } from './store/settings'
import { scanVault } from './vault/scan'
import { createRewatcher, watchVault } from './vault/watch'
import { detectMoves, detectOfflineMoves } from './graph/moves'

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

  const graphDir = join(dataDir(), 'graph')
  const graphStoreForMoves = graphStore(graphDir)
  // The previous index, to notice notes renamed or moved in Obsidian (their concepts follow them).
  let lastIndex: import('../shared/vault-types').VaultIndex | null = null
  let linkedSync: ReturnType<typeof createLinkedSync> | undefined
  const rewatch = createRewatcher(settings.load, watchVault, async (paths) => {
    const idx = await h.vaultIndex()
    if ('error' in idx) return
    if (lastIndex) {
      const moves = await detectMoves(lastIndex, idx, (await extractor.graph()).extracted, (p) => readFile(p, 'utf8')).catch(() => [])
      for (const m of moves) await graphStoreForMoves.append('move', { ...m, at: Date.now() })
    }
    lastIndex = idx
    broadcast(CH.vaultChanged, idx)
    linkedSync?.changed(paths)
  })
  void h.vaultIndex().then(async (idx) => {
    if ('error' in idx) return
    lastIndex = idx
    // Notes renamed while Sinapsi was closed: their concepts follow them too.
    const moves = await detectOfflineMoves(idx, (await extractor.graph()).extracted, (p) => readFile(p, 'utf8')).catch(() => [])
    for (const m of moves) await graphStoreForMoves.append('move', { ...m, at: Date.now() })
  })
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
    games: async () => (await settings.load()).gamesInSessions,
    memory: async (notePath) => memoryBrief(await extractor.graph(), memoryOf(await memoryStore(join(dataDir(), 'memory')).read(), Date.now()), notePath),
    onUpdate: (s) => {
      broadcast(CH.sessionUpdated, s)
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

  const vaultIndexOrNull = async (): Promise<import('../shared/vault-types').VaultIndex | null> => {
    const idx = await h.vaultIndex()
    return 'error' in idx ? null : idx
  }
  const nbStore = notebookStore(join(dataDir(), 'notebook'))
  // Progress arrives many times a second: the window hears about it at most every 300 ms.
  let nbTimer: ReturnType<typeof setTimeout> | null = null
  const nbChanged = (): void => {
    if (nbTimer) return
    nbTimer = setTimeout(() => {
      nbTimer = null
      broadcast(CH.notebookUpdated, {})
    }, 300)
  }
  const ingest = createIngestor({
    store: nbStore,
    run: process.env.SINAPSI_FAKE_MEDIA === '1' ? fakeMedia() : nodeSpawn,
    readVault: (path) => readFile(path, 'utf8'),
    onChange: nbChanged
  })
  void ingest.fixStale().catch((e) => console.warn('[notebook] fixStale', e))
  const nbChat = createNotebookChat({
    bridge: process.env.SINAPSI_FAKE_NOTEBOOK === '1' ? fakeNotebookBridge() : bridge,
    store: nbStore,
    workDir: join(dataDir(), 'ai-work'),
    onTurn: (notebookId) => broadcast(CH.notebookUpdated, { notebookId })
  })
  const nbh = makeNotebookHandlers({
    store: nbStore,
    ingest,
    chat: nbChat,
    vault: vaultIndexOrNull,
    chooseFiles: async () => {
      const r = await dialog.showOpenDialog({ title: 'Importa fonti', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Fonti', extensions: ACCEPTED_EXTENSIONS }] })
      return r.canceled ? [] : r.filePaths
    },
    openPath: (p) => shell.openPath(p)
  })
  ipcMain.handle(CH.notebookList, () => nbh.list())
  ipcMain.handle(CH.notebookCreate, (_e, name) => nbh.create(name))
  ipcMain.handle(CH.notebookUpdate, async (_e, id, patch) => {
    await nbh.update(id, patch)
    nbChanged()
  })
  ipcMain.handle(CH.notebookRemove, async (_e, id) => {
    await nbh.remove(id)
    nbChanged()
  })
  ipcMain.handle(CH.notebookAddFiles, (_e, id, paths) => nbh.addFiles(id, paths))
  ipcMain.handle(CH.notebookChooseFiles, (_e, id) => nbh.chooseFiles(id))
  ipcMain.handle(CH.notebookAddYoutube, (_e, id, url) => nbh.addYoutube(id, url))
  ipcMain.handle(CH.notebookAddVault, (_e, id, path) => nbh.addVault(id, path))
  ipcMain.handle(CH.notebookRemoveSource, (_e, id) => nbh.removeSource(id))
  ipcMain.handle(CH.notebookRetrySource, (_e, id) => nbh.retrySource(id))
  ipcMain.handle(CH.notebookRefreshSource, (_e, id) => nbh.refreshSource(id))
  ipcMain.handle(CH.notebookBusy, (_e, id) => nbh.busy(id))
  // Quitting stops whisper and yt-dlp instead of leaving them running.
  app.on('before-quit', () => ingest.stopAll())
  ipcMain.handle(CH.notebookText, (_e, id) => nbh.text(id))
  ipcMain.handle(CH.notebookChat, (_e, id) => nbh.chat(id))
  ipcMain.handle(CH.notebookAsk, (_e, id, q, ids) => nbh.ask(id, q, ids))
  ipcMain.handle(CH.notebookOpenFile, (_e, id) => nbh.openFile(id))

  const notes = createNoteGenerator({
    sources: notebookSourcesFor({ store: nbStore, vault: vaultIndexOrNull }),
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
  const nh = makeNoteHandlers(notes, (a) => appendJsonl(join(dataDir(), 'attempts.jsonl'), { ...a, at: Date.now() }))
  ipcMain.handle(CH.notesCreate, (_e, req) => nh.create(req))
  ipcMain.handle(CH.notesList, () => nh.list())
  ipcMain.handle(CH.notesGet, (_e, id) => nh.get(id))
  ipcMain.handle(CH.notesRetry, (_e, id) => nh.retry(id))
  ipcMain.handle(CH.notesAttempt, (_e, a) => nh.attempt(a))

  const store = graphStoreForMoves
  const vaultOrNull = async (): Promise<import('../shared/vault-types').VaultIndex | null> => {
    const idx = await h.vaultIndex()
    return 'error' in idx ? null : idx
  }
  let lastRunning: string | undefined
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
    // The graph only changes when a run ends: while one is running, send the status alone.
    onChange: (status) => {
      // A note whose extraction just ended: prepare its Ripasso questions in the background.
      if (lastRunning && status.running !== lastRunning && process.env.SINAPSI_FAKE_EXTRACT !== '1') void review.prepare(lastRunning).catch(() => undefined)
      lastRunning = status.running
      return status.running
        ? broadcast(CH.graphChanged, { status })
        : void extractor.graph().then((graph) => broadcast(CH.graphChanged, { status, graph }), () => broadcast(CH.graphChanged, { status }))
    },
    eligible: async () => readySources(await notes.list()),
    priorities: async () => {
      const idx = await vaultOrNull()
      if (!idx) return []
      const paths = new Set((await notes.list()).map((m) => m.sourcePath))
      return [...new Set(idx.notes.filter((n) => paths.has(n.path) && n.subject).map((n) => n.subject as string))]
    }
  })
  linkedSync = createLinkedSync({
    vault: vaultOrNull,
    readNote: (path) => readFile(path, 'utf8'),
    studied: async () => readySources(await notes.list()),
    refreshNote: (path) => notes.refresh(path),
    reextract: (path) => extractor.request(path, 'linked')
  })
  app.on('before-quit', () => linkedSync?.stop())
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

  const memoryDir = join(dataDir(), 'memory')
  const review = createReviewService({
    bridge: process.env.SINAPSI_FAKE_REVIEW === '1' ? fakeReviewBridge() : bridge,
    memory: memoryStore(memoryDir),
    variants: variantsStore(memoryDir),
    graph: () => extractor.graph(),
    vault: vaultOrNull,
    readNote: (path) => readFile(path, 'utf8'),
    settings: async () => settings.load(),
    workDir: join(dataDir(), 'ai-work')
  })
  const rh = makeReviewHandlers(review, {
    voice: (bytes) => transcribeVoice({ run: process.env.SINAPSI_FAKE_MEDIA === '1' ? fakeMedia() : nodeSpawn, dir: join(dataDir(), 'ai-work'), bytes }),
    microphone: async () => (process.platform === 'darwin' ? systemPreferences.askForMediaAccess('microphone') : true)
  })
  ipcMain.handle(CH.reviewPlan, (_e, opts) => rh.plan(opts))
  ipcMain.handle(CH.reviewGrade, (_e, req) => rh.grade(req))
  ipcMain.handle(CH.reviewExplain, (_e, req) => rh.explain(req))
  ipcMain.handle(CH.reviewVoice, (_e, bytes) => rh.voice(bytes))
  ipcMain.handle(CH.reviewMicrophone, () => rh.microphone())
  ipcMain.handle(CH.reviewRecord, (_e, r) => rh.record(r))
  ipcMain.handle(CH.reviewMemory, () => rh.memory())
  ipcMain.handle(CH.reviewIntervals, (_e, id) => rh.intervals(id))
  ipcMain.handle(CH.reviewSessions, async () => reviewSessions(await memoryStore(memoryDir).read(), new Map((await extractor.graph()).concepts.map((c) => [c.id, c.name]))))

  const practiceDir = join(dataDir(), 'practice')
  const practiceBridge = process.env.SINAPSI_FAKE_PRACTICE === '1' ? fakeTutor() : bridge
  const conceptNames = async (): Promise<Map<string, string>> => new Map((await extractor.graph()).concepts.map((c) => [c.id, c.name]))
  const practiceDeps = {
    bridge: practiceBridge,
    dir: practiceDir,
    material: async (m: import('../shared/practice-types').Material) =>
      buildMaterialContext({
        material: m,
        graph: await extractor.graph(),
        readNote: (path) => readFile(path, 'utf8'),
        sourceText: async (id) => {
          const src = await nbStore.source(id)
          const text = src && (await nbStore.readText(id))
          return src && text ? { title: src.title, text } : null
        }
      }),
    topic: async (m: import('../shared/practice-types').Material) => practiceTopic(m, await conceptNames()),
    memory: memoryStore(memoryDir),
    onUpdate: (s: unknown) => broadcast(CH.practiceUpdated, s)
  }
  const practice = createPracticeRunner(practiceDeps)
  void cleanupPhotos(practiceDir, Date.now()).catch(() => undefined)
  const exam = createExamService({ ...practiceDeps, runner: practice })
  const ph = makePracticeHandlers({
    runner: practice,
    exam,
    catalog: async () =>
      buildCatalog({ graph: await extractor.graph(), memory: await review.memory(), practiced: await practice.practiced(), vault: await vaultOrNull(), notebooks: await nbStore.notebooks(), now: Date.now() }),
    photo: (id, bytes) => transcribePhoto({ bridge: practiceBridge, dir: join(practiceDir, id), bytes }),
    camera: async () => (process.platform === 'darwin' ? systemPreferences.askForMediaAccess('camera') : true)
  })
  const bg = (p: Promise<unknown>): void => void p.catch((e) => console.warn('[practice]', e))
  ipcMain.handle(CH.practiceCatalog, () => ph.catalog())
  ipcMain.handle(CH.practiceCreate, async (_e, m) => {
    const id = await ph.create(m)
    bg(ph.retry(id))
    return id
  })
  ipcMain.handle(CH.practiceSubmit, (_e, id, s) => {
    // Validation errors reach the window; the tutor's turn arrives through practice:updated.
    const run = ph.submit(id, s)
    bg(run)
    return run.then(() => undefined)
  })
  ipcMain.handle(CH.practiceRetry, (_e, id) => bg(ph.retry(id)))
  ipcMain.handle(CH.practiceGet, (_e, id) => ph.get(id))
  ipcMain.handle(CH.practiceList, () => ph.list())
  ipcMain.handle(CH.practiceExamStart, async (_e, m, minutes, paper) => {
    const id = await ph.examStart(m, minutes, paper)
    bg(ph.retry(id))
    return id
  })
  ipcMain.handle(CH.practiceExamSave, (_e, id, a) => ph.examSave(id, a))
  ipcMain.handle(CH.practiceExamDeliver, (_e, id, a) => bg(ph.examDeliver(id, a)))
  ipcMain.handle(CH.practiceExamHand, (_e, id) => ph.examHand(id))
  ipcMain.handle(CH.practiceExamSelf, (_e, id, pid, points) => ph.examSelf(id, pid, points))
  ipcMain.handle(CH.practiceCalibration, () => ph.calibration())
  ipcMain.handle(CH.practicePhoto, (_e, id, bytes) => ph.photo(id, bytes))
  ipcMain.handle(CH.practiceCamera, () => ph.camera())
  const suggestions = createSuggester({
    cachedIndex: () => lastIndex,
    scan: vaultOrNull,
    notes: () => notes.list(),
    sessions: () => runner.list(),
    practiced: () => practice.practiced(),
    memory: () => review.memory(),
    graph: () => extractor.graph(),
    now: Date.now
  })
  ipcMain.handle(CH.suggestGet, () => suggestions())

  // Background extraction: a few notes a day, only while the Mac is idle.
  const tick = async (): Promise<void> => {
    const s = await settings.load()
    await extractor.backgroundTick({ idleSeconds: powerMonitor.getSystemIdleTime(), enabled: s.backgroundExtraction, dailyLimit: s.dailyExtractionLimit })
  }
  if (process.env.SINAPSI_FAKE_EXTRACT !== '1') setInterval(() => void tick().catch((e) => console.warn('[graph] background', e)), 10 * 60_000)
  return { bridge }
}
