import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  powerMonitor,
  powerSaveBlocker,
  shell,
  systemPreferences
} from 'electron'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { CH } from '../shared/api'
import { readTutorCalendar } from './tutor/calendar'
import { createSinapsiTutorService } from './tutor/sinapsi-tutor'
import { confidenceCalibration } from '../shared/confidence'
import { calibrationByLevel, firstReviewAgainRate } from '../shared/calibration'
import { createBridge, type Bridge } from './ai/bridge'
import { nodeSpawn } from './ai/engines'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import {
  makeGraphHandlers,
  makeHandlers,
  makeNotebookHandlers,
  makeNoteHandlers,
  makePracticeHandlers,
  makeReviewHandlers,
  makeSessionHandlers,
  makeVoiceHandlers,
  makeLessonHandlers,
  makeExamHandlers,
  practiceTopic
} from './ipc-handlers'
import { createExamService } from './practice/exam'
import { fakeTutor } from './practice/fake-tutor'
import { buildCatalog, buildMaterialContext } from './practice/material'
import { cleanupPhotos, transcribePhoto } from './practice/photo'
import { createPracticeRunner } from './practice/runner'
import { fakeMedia } from './notebook/fake-media'
import { notebookSourcesFor } from './notebook/for-notes'
import { ACCEPTED_EXTENSIONS, createIngestor } from './notebook/ingest'
import { notebookStore } from './notebook/store'
import { fakeReviewBridge } from './memory/fake-review'
import { createReviewService } from './memory/review'
import { memoryOf } from './memory/fsrs'
import { memoryStore, weaknessStore } from './memory/store'
import { reviewSessions } from './memory/history'
import { variantsStore } from './memory/variants'
import { transcribeVoice } from './memory/voice'
import { createDictation, findWhisperPython, spawnWhisperServer } from './voice/dictation'
import whisperServer from '../../resources/whisper_server.py?asset&asarUnpack'
import { fakeExtractBridge } from './graph/fake-extract'
import { createExtractor, type Extractor } from './graph/jobs'
import { graphStore } from './graph/store'
import { fakeNoteBridge } from './notes/fake-note'
import { createNoteGenerator } from './notes/generator'
import { sectionText } from './notes/section-text'
import { readySources } from './notes/store'
import { createLinkedSync } from './vault/linked'
import { fakeTeacher, LONG_MEASURE_SCRIPT } from './session/fake-teacher'
import { createSessionRunner } from './session/runner'
import { memoryBrief } from './session/memory-brief'
import { createSuggester } from './suggest/suggest'
import { appendJsonl } from './store/jsonl'
import { dataDir } from './store/paths'
import { lessonStore } from './lessons/store'
import { examStore } from './exams/store'
import { buildWeekPlan } from './planner/plan'
import { readinessFor } from './planner/readiness'
import { pendingDigest, reduceLessons } from './lessons/reduce'
import { loadSettings, saveSettings } from './store/settings'
import { scanVault } from './vault/scan'
import { createRewatcher, watchVault } from './vault/watch'
import { detectMoves, detectOfflineMoves } from './graph/moves'
import { resolvePath } from './graph/resolve-path'
import { createChainExplainer, fakeChainExplainBridge } from './graph/explain'

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
    ? {
        load: async () => ({ ...(await loadSettings()), vaultPath: process.env.SINAPSI_VAULT! }),
        save: saveSettings
      }
    : { load: loadSettings, save: saveSettings }
  const h = makeHandlers({
    loadSettings: settings.load,
    saveSettings: settings.save,
    scan: scanVault,
    aiStatus: () => bridge.status(),
    openExternal: (url) => shell.openExternal(url),
    chooseFolder: async () => {
      const r = await dialog.showOpenDialog({
        title: 'Scegli la cartella del vault Obsidian',
        properties: ['openDirectory']
      })
      return r.canceled ? null : r.filePaths[0]
    }
  })
  const broadcast = (channel: string, payload: unknown): void =>
    BrowserWindow.getAllWindows().forEach((w) => w.webContents.send(channel, payload))

  const graphDir = join(dataDir(), 'graph')
  const graphStoreForMoves = graphStore(graphDir)
  // The previous index, to notice notes renamed or moved in Obsidian (their concepts follow them).
  let lastIndex: import('../shared/vault-types').VaultIndex | null = null
  // Assigned once below, after the handlers that read it are registered.
  // eslint-disable-next-line prefer-const
  let linkedSync: ReturnType<typeof createLinkedSync> | undefined
  const rewatch = createRewatcher(settings.load, watchVault, async (paths) => {
    const idx = await h.vaultIndex()
    if ('error' in idx) return
    if (lastIndex) {
      const moves = await detectMoves(lastIndex, idx, (await extractor.graph()).extracted, (p) =>
        readFile(p, 'utf8')
      ).catch(() => [])
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
    const moves = await detectOfflineMoves(idx, (await extractor.graph()).extracted, (p) =>
      readFile(p, 'utf8')
    ).catch(() => [])
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

  const memoryDir = join(dataDir(), 'memory')
  const sessionMemory = memoryStore(memoryDir)
  const sessionWeaknesses = weaknessStore(memoryDir)
  const runner = createSessionRunner({
    bridge:
      process.env.SINAPSI_FAKE_TEACHER === '1'
        ? fakeTeacher(
            process.env.SINAPSI_FAKE_TEACHER_SCRIPT === 'long-measure'
              ? LONG_MEASURE_SCRIPT
              : undefined
          )
        : bridge,
    dir: join(dataDir(), 'sessions'),
    vault: async () => {
      const idx = await h.vaultIndex()
      return 'error' in idx ? null : idx
    },
    readNote: (path) => readFile(path, 'utf8'),
    games: async () => (await settings.load()).gamesInSessions,
    memoryStore: sessionMemory,
    memory: async (notePath) =>
      memoryBrief(
        await extractor.graph(),
        memoryOf(await memoryStore(join(dataDir(), 'memory')).read(), Date.now()),
        notePath
      ),
    weaknesses: sessionWeaknesses,
    graph: () => extractor.graph(),
    settings: async () => {
      const current = await settings.load()
      return {
        mastery: current.mastery,
        learnerProfile: current.learnerProfile,
        graderEngine: current.graderEngine,
        fastStart: current.fastStart
      }
    },
    otherEngine: async () => {
      const current = await settings.load()
      const teach = current.engines.teach
      const grader = current.engines.grade
      if (grader.engine !== teach.engine) return grader
      return {
        engine: teach.engine === 'claude' ? 'agy' : 'claude',
        model: teach.engine === 'claude' ? 'gemini-3.8-flash-medium' : 'sonnet'
      }
    },
    teachEngine: async () => (await settings.load()).engines.teach,
    onPartial: (id, text) => broadcast(CH.sessionPartial, { id, text }),
    onUpdate: (s) => {
      broadcast(CH.sessionUpdated, s)
    }
  })
  const sh = makeSessionHandlers(runner)
  // Turns can take a while: the window learns progress through session:updated, so these return at once.
  const background = (p: Promise<unknown>): void =>
    void p.catch((e) => console.warn('[session]', e))
  ipcMain.handle(CH.sessionCreate, async (_e, topic) => runner.create(String(topic)))
  // Returns as soon as the session exists; the first turn (if no note choice is pending) runs in the background.
  ipcMain.handle(CH.sessionConfirm, (_e, id, notePath) =>
    background(runner.confirm(String(id), notePath == null ? null : String(notePath)))
  )
  ipcMain.handle(CH.sessionStart, async (_e, topic, opts) => {
    const id = await runner.create(String(topic), opts?.goalIds)
    background(runner.retry(id))
    return id
  })
  ipcMain.handle(CH.sessionList, () => sh.list())
  ipcMain.handle(CH.sessionGet, (_e, id) => sh.get(id))
  ipcMain.handle(CH.sessionAnswer, (_e, id, a) => background(sh.answer(id, a)))
  ipcMain.handle(CH.sessionSay, (_e, id, text) => background(sh.say(id, text)))
  ipcMain.handle(CH.sessionRetry, (_e, id) => background(sh.retry(id)))
  ipcMain.handle(CH.sessionContest, (_e, id, questionId) =>
    runner.contest(String(id), String(questionId))
  )
  ipcMain.handle(CH.sessionPeek, (_e, id, questionId) =>
    runner.peek(String(id), String(questionId))
  )
  ipcMain.handle(CH.sessionFlag, (_e, id, questionId) =>
    runner.flag(String(id), String(questionId))
  )
  ipcMain.handle(CH.sessionCancel, (_e, id) => runner.cancel(String(id)))
  ipcMain.handle(CH.sessionEnd, (_e, id) => background(runner.end(String(id))))

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
  const nbh = makeNotebookHandlers({
    store: nbStore,
    ingest,
    chooseFiles: async () => {
      const r = await dialog.showOpenDialog({
        title: 'Importa fonti',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Fonti', extensions: ACCEPTED_EXTENSIONS }]
      })
      return r.canceled ? [] : r.filePaths
    }
  })
  ipcMain.handle(CH.notebookList, () => nbh.list())
  ipcMain.handle(CH.notebookCreate, (_e, name) => nbh.create(name))
  ipcMain.handle(CH.notebookBucketFor, (_e, subject) => nbh.bucketFor(subject))
  ipcMain.handle(CH.notebookRemove, async (_e, id) => {
    await nbh.remove(id)
    nbChanged()
  })
  ipcMain.handle(CH.notebookAddFiles, (_e, id, paths) => nbh.addFiles(id, paths))
  ipcMain.handle(CH.notebookChooseFiles, (_e, id) => nbh.chooseFiles(id))
  ipcMain.handle(CH.notebookAddYoutube, (_e, id, url) => nbh.addYoutube(id, url))
  ipcMain.handle(CH.notebookRemoveSource, (_e, id) => nbh.removeSource(id))
  ipcMain.handle(CH.notebookRetrySource, (_e, id) => nbh.retrySource(id))
  // Quitting stops whisper and yt-dlp instead of leaving them running.
  app.on('before-quit', () => ingest.stopAll())

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
  const nh = makeNoteHandlers(notes, (a) =>
    appendJsonl(join(dataDir(), 'attempts.jsonl'), { ...a, at: Date.now() })
  )
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
      if (lastRunning && status.running !== lastRunning && process.env.SINAPSI_FAKE_EXTRACT !== '1')
        void review.prepare(lastRunning).catch(() => undefined)
      lastRunning = status.running
      return status.running
        ? broadcast(CH.graphChanged, { status })
        : void extractor.graph().then(
            (graph) => broadcast(CH.graphChanged, { status, graph }),
            () => broadcast(CH.graphChanged, { status })
          )
    },
    eligible: async () => readySources(await notes.list(), (await store.read()).moves),
    priorities: async () => {
      const idx = await vaultOrNull()
      if (!idx) return []
      const moves = (await store.read()).moves
      const paths = new Set((await notes.list()).map((m) => resolvePath(m.sourcePath, moves)))
      return [
        ...new Set(
          idx.notes.filter((n) => paths.has(n.path) && n.subject).map((n) => n.subject as string)
        )
      ]
    }
  })
  linkedSync = createLinkedSync({
    vault: vaultOrNull,
    readNote: (path) => readFile(path, 'utf8'),
    studied: async () => readySources(await notes.list(), (await store.read()).moves),
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
  const chainSource = async (chainId: string): Promise<import('../shared/graph-types').ChainSource> => {
    const graph = await gh.get()
    const chain = graph.chains.find((c) => c.id === chainId)
    if (!chain) throw new Error('chain not found')
    const byId = new Map(graph.concepts.map((c) => [c.id, c]))
    const notePath = chain.notes[0] ?? byId.get(chain.conclusion)?.birth ?? ''
    const content = notePath ? await readFile(notePath, 'utf8').catch(() => '') : ''
    const concept = (id: string) => { const c = byId.get(id); return { id, name: c?.name ?? '', statement: c?.statement ?? '' } }
    const ids = [...new Set([...chain.premises, chain.conclusion])]
    return { chainId: chain.id, notePath, premises: chain.premises.map(concept), conclusion: concept(chain.conclusion), excerpts: content ? ids.map((id) => { const heading = byId.get(id)?.sections[notePath] ?? ''; return { conceptId: id, heading, text: sectionText(content, [heading]).slice(0, 1200) } }).filter((x) => !!x.heading && !!x.text) : [], ...(chain.why ? { why: chain.why } : {}) }
  }
  const chainExplainer = createChainExplainer({
    bridge: process.env.SINAPSI_FAKE_EXPLAIN === '1' ? fakeChainExplainBridge() : bridge,
    source: chainSource,
    store,
    engine: async () => (await settings.load()).engines.teach,
    otherEngine: async () => {
      const current = await settings.load()
      const primary = current.engines.teach
      if (current.engines.grade.engine !== primary.engine) return current.engines.grade
      return { engine: primary.engine === 'claude' ? 'agy' : 'claude', model: primary.engine === 'claude' ? 'gemini-3.8-flash-medium' : 'sonnet' }
    }
  })
  ipcMain.handle(CH.graphGet, () => gh.get())
  ipcMain.handle(CH.graphChainSource, (_e, chainId) => chainSource(String(chainId)))
  ipcMain.handle(CH.graphExplainChain, (_e, chainId, opts) => chainExplainer(String(chainId), opts))
  ipcMain.handle(CH.graphStatus, () => gh.status())
  ipcMain.handle(CH.graphExtract, (_e, path, reason) => gh.extract(path, reason))
  ipcMain.handle(CH.graphPositions, () => gh.positions())
  ipcMain.handle(CH.graphSavePositions, (_e, p) => gh.savePositions(p))

  const weaknesses = weaknessStore(memoryDir)
  const review = createReviewService({
    bridge: process.env.SINAPSI_FAKE_REVIEW === '1' ? fakeReviewBridge() : bridge,
    memory: memoryStore(memoryDir),
    variants: variantsStore(memoryDir),
    graph: () => extractor.graph(),
    vault: vaultOrNull,
    readNote: (path) => readFile(path, 'utf8'),
    settings: async () => settings.load(),
    weaknesses: () => weaknesses.active(),
    pacerOf: async () => {
      const lessons = reduceLessons(await lessonStore(dataDir()).read())
      const map = new Map<
        string,
        { type: import('../shared/lesson-types').PacerType; at: number }
      >()
      for (const lesson of lessons)
        for (const id of lesson.conceptIds) {
          const current = map.get(id),
            at = Date.parse(lesson.updatedAt)
          if (!current || at > current.at) map.set(id, { type: lesson.pacerType, at })
        }
      return new Map([...map].map(([id, v]) => [id, v.type]))
    },
    workDir: join(dataDir(), 'ai-work')
  })
  const fakeVoice = process.env.SINAPSI_FAKE_MEDIA === '1'
  const dictation = createDictation({
    spawn: spawnWhisperServer(whisperServer),
    // With fake media (e2e) only the CLI path runs, against the stand-in tools.
    resolvePython: fakeVoice ? async () => null : () => findWhisperPython(),
    fallback: (bytes) =>
      transcribeVoice({
        run: fakeVoice ? fakeMedia() : nodeSpawn,
        dir: join(dataDir(), 'ai-work'),
        bytes
      }),
    dir: join(dataDir(), 'ai-work')
  })
  app.on('will-quit', () => dictation.dispose())
  const vh = makeVoiceHandlers({
    transcribe: (bytes, onStage) => dictation.transcribe(bytes, onStage),
    microphone: async () =>
      process.platform === 'darwin' ? systemPreferences.askForMediaAccess('microphone') : true
  })
  ipcMain.handle(CH.voiceTranscribe, (e, bytes) =>
    vh.transcribe(bytes, (s) => {
      if (!e.sender.isDestroyed()) e.sender.send(CH.voiceStage, s)
    })
  )
  ipcMain.handle(CH.voiceMicrophone, () => vh.microphone())
  const rh = makeReviewHandlers(review)
  ipcMain.handle(CH.reviewPlan, (_e, opts) => rh.plan(opts))
  ipcMain.handle(CH.reviewGrade, (_e, req) => rh.grade(req))
  ipcMain.handle(CH.reviewExplain, (_e, req) => rh.explain(req))
  ipcMain.handle(CH.reviewRecord, (_e, r) => rh.record(r))
  ipcMain.handle(CH.reviewMemory, () => rh.memory())
  ipcMain.handle(CH.memoryStats, async () => {
    const reviews = await sessionMemory.read()
    return { calibration: calibrationByLevel(reviews), againRate: firstReviewAgainRate(reviews) }
  })
  ipcMain.handle(CH.reviewCalibration, async () => {
    const [lines, graph, index] = await Promise.all([
      memoryStore(memoryDir).read(),
      extractor.graph(),
      vaultOrNull()
    ])
    const subject = (id: string): string | null => {
      const concept = graph.concepts.find((c) => c.id === id)
      return index?.notes.find((n) => n.path === concept?.birth)?.subject ?? null
    }
    const result = confidenceCalibration(lines, subject)
    const names = new Map(graph.concepts.map((c) => [c.id, c.name]))
    return {
      ...result,
      confidentErrors: result.confidentErrors.map((e) => ({
        ...e,
        name: names.get(e.conceptId) ?? e.conceptId
      }))
    }
  })
  ipcMain.handle(CH.reviewIntervals, (_e, id) => rh.intervals(id))
  ipcMain.handle(CH.reviewSessions, async () =>
    reviewSessions(
      await memoryStore(memoryDir).read(),
      new Map((await extractor.graph()).concepts.map((c) => [c.id, c.name]))
    )
  )

  const practiceDir = join(dataDir(), 'practice')
  const practiceBridge = process.env.SINAPSI_FAKE_PRACTICE === '1' ? fakeTutor() : bridge
  const conceptNames = async (): Promise<Map<string, string>> =>
    new Map((await extractor.graph()).concepts.map((c) => [c.id, c.name]))
  const practiceDeps = {
    bridge: practiceBridge,
    dir: practiceDir,
    material: async (m: import('../shared/practice-types').Material) =>
      buildMaterialContext({
        material: m,
        graph: await extractor.graph(),
        memory: memoryOf(
          await memoryStore(memoryDir).read(),
          Date.now(),
          new Set((await weaknesses.active()).flatMap((w) => (w.conceptId ? [w.conceptId] : [])))
        ),
        weaknesses: await weaknesses.active(),
        readNote: (path) => readFile(path, 'utf8'),
        sourceText: async (id) => {
          const src = await nbStore.source(id)
          const text = src && (await nbStore.readText(id))
          return src && text ? { title: src.title, text } : null
        }
      }),
    topic: async (m: import('../shared/practice-types').Material) =>
      practiceTopic(m, await conceptNames()),
    memory: memoryStore(memoryDir),
    weaknesses,
    onDone: async (lessonId: string): Promise<void> => {
      const entry = reduceLessons(await ls.read()).find((item) => item.id === lessonId)
      if (!entry) return
      const step = pendingDigest(entry, Date.now())
      if (step) {
        await ls.append({ t: 'digest-done', at: new Date().toISOString(), id: lessonId, step })
      }
    },
    onCompass: async (lessonId: string, question: string): Promise<void> => {
      await ls.append({
        t: 'confusion-added',
        at: new Date().toISOString(),
        id: lessonId,
        qid: randomUUID(),
        text: question
      })
    },
    onSolved: async (lessonId: string, questions: string[]): Promise<void> => {
      const entry = reduceLessons(await ls.read()).find((item) => item.id === lessonId)
      for (const question of questions) {
        for (const open of entry?.confusionQuestions.filter(
          (q) => q.status === 'open' && q.text === question
        ) ?? []) {
          await ls.append({
            t: 'confusion-resolved',
            at: new Date().toISOString(),
            id: lessonId,
            qid: open.id
          })
        }
      }
    },
    onUpdate: (s: unknown) => broadcast(CH.practiceUpdated, s)
  }
  const practice = createPracticeRunner(practiceDeps)
  void cleanupPhotos(practiceDir, Date.now()).catch(() => undefined)
  const exam = createExamService({ ...practiceDeps, runner: practice })
  const ph = makePracticeHandlers({
    runner: practice,
    exam,
    catalog: async () =>
      buildCatalog({
        graph: await extractor.graph(),
        memory: await review.memory(),
        practiced: await practice.practiced(),
        vault: await vaultOrNull(),
        notebooks: await nbStore.notebooks(),
        now: Date.now()
      }),
    photo: (id, bytes) =>
      transcribePhoto({ bridge: practiceBridge, dir: join(practiceDir, id), bytes }),
    camera: async () =>
      process.platform === 'darwin' ? systemPreferences.askForMediaAccess('camera') : true
  })
  const bg = (p: Promise<unknown>): void => void p.catch((e) => console.warn('[practice]', e))
  const ls = lessonStore(dataDir())
  const lh = makeLessonHandlers({
    read: ls.read,
    append: ls.append,
    memory: () => review.memory(),
    reviews: () => memoryStore(memoryDir).read(),
    readNote: (p) => readFile(p, 'utf8'),
    vaultRoot: async () => (await loadSettings()).vaultPath,
    createPractice: (m) => ph.create(m),
    retryPractice: (id) => bg(ph.retry(id)),
    validConceptIds: async () => {
      const catalog = await ph.catalog()
      return new Set(
        catalog.subjects.flatMap((subject) =>
          subject.notes.flatMap((note) => note.concepts.map((concept) => concept.id))
        )
      )
    }
  })
  ipcMain.handle(CH.lessonsList, () => lh.list())
  ipcMain.handle(CH.lessonsGet, (_e, id) => lh.get(id))
  ipcMain.handle(CH.lessonsCreate, (_e, p) => lh.create(p))
  ipcMain.handle(CH.lessonsUpdate, (_e, id, p) => lh.update(id, p))
  ipcMain.handle(CH.lessonsAddConfusion, (_e, id, t) => lh.addConfusion(id, t))
  ipcMain.handle(CH.lessonsResolveConfusion, (_e, id, q) => lh.resolveConfusion(id, q))
  ipcMain.handle(CH.lessonsSetMastery, (_e, id, l) => lh.setMastery(id, l))
  ipcMain.handle(CH.lessonsArchive, (_e, id) => lh.archive(id))
  ipcMain.handle(CH.lessonsLaunch, (_e, id, m) => lh.launch(id, m))
  ipcMain.handle(CH.tutorCalendar, async () => readTutorCalendar((await loadSettings()).vaultPath))
  const sinapsiTutor = createSinapsiTutorService({
    vaultPath: async () => (await settings.load()).vaultPath,
    graph: () => extractor.graph(),
    reviews: () => memoryStore(memoryDir).read(),
    memoryOf,
    vault: vaultOrNull
  })
  ipcMain.handle(CH.tutorReport, () => sinapsiTutor.report())
  const es = examStore(dataDir())
  const eh = makeExamHandlers(es)
  ipcMain.handle(CH.examsList, () => eh.list())
  ipcMain.handle(CH.examsCreate, (_e, entry) => eh.create(entry))
  ipcMain.handle(CH.examsUpdate, (_e, id, patch) => eh.update(id, patch))
  ipcMain.handle(CH.examsArchive, (_e, id) => eh.archive(id))
  ipcMain.handle(CH.planWeek, async () => {
    const todayDate = new Date()
    const today = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`
    const [exams, lessonEvents, memories, reviews, currentSettings, practiceSessions] =
      await Promise.all([
        eh.list(),
        ls.read(),
        review.memory(),
        memoryStore(memoryDir).read(),
        settings.load(),
        practice.list()
      ])
    const lessons = reduceLessons(lessonEvents)
    const plan = buildWeekPlan({
      today,
      exams,
      lessons,
      memories,
      studyHours: currentSettings.studyHours,
      buffer: currentSettings.planBuffer
    })
    const results = await Promise.all(
      practiceSessions
        .filter((item) => item.mode === 'exam')
        .map(async (item) => {
          const state = await ph.get(item.id)
          return state.exam?.grade
            ? [
                {
                  conceptIds: state.material.conceptIds,
                  total: state.exam.grade.total,
                  at: state.updatedAt
                }
              ]
            : []
        })
    )
    const examResults = results.flat()
    const readiness = exams
      .filter((entry) => entry.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((examEntry) =>
        readinessFor({
          exam: examEntry,
          lessons: lessons.filter((lesson) => lesson.courseId === examEntry.courseId),
          memories,
          reviews,
          examResults,
          now: Date.now()
        })
      )
    return { plan, readiness }
  })
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
    notes: async () => {
      const [list, { moves }] = await Promise.all([notes.list(), store.read()])
      return list.map((note) => ({ ...note, sourcePath: resolvePath(note.sourcePath, moves) }))
    },
    sessions: () => runner.list(),
    practiced: () => practice.practiced(),
    memory: () => review.memory(),
    graph: () => extractor.graph(),
    // The Registro's lessons: Sinapsi's own plus the Obsidian lesson tutor's (never practised = not studied yet).
    lessons: async () => [
      ...(await lh.list()),
      ...((await sinapsiTutor.report().catch(() => null))?.lessons
        .filter((lesson) => lesson.stats.covered === 0 && lesson.lastStudiedAt === null)
        .map((lesson) => ({
          id: `tutor:${lesson.course}:${lesson.date}:${lesson.number ?? ''}`,
          date: lesson.date,
          topic: lesson.items[0]?.label ?? lesson.text.slice(0, 80),
          courseId: lesson.number
            ? `${lesson.courseName} · lezione ${lesson.number}`
            : lesson.courseName
        })) ?? [])
    ],
    studiedLessons: async () =>
      new Set(
        (await ls.read()).filter((event) => event.t === 'session-launched').map((event) => event.id)
      ),
    now: Date.now
  })
  ipcMain.handle(CH.suggestGet, () => suggestions())

  // «Riduci trasparenza»: the renderer turns the Liquid Glass into a solid surface. 'updated' fires
  // for every appearance change (dark mode, contrast…), so only a change of this setting is sent.
  let reducedTransparency = nativeTheme.prefersReducedTransparency
  ipcMain.handle(CH.uiTransparency, () => nativeTheme.prefersReducedTransparency)
  nativeTheme.on('updated', () => {
    if (nativeTheme.prefersReducedTransparency === reducedTransparency) return
    reducedTransparency = nativeTheme.prefersReducedTransparency
    broadcast(CH.uiTransparencyChanged, reducedTransparency)
  })

  // Background extraction: a few notes a day, only while the Mac is idle.
  const tick = async (): Promise<void> => {
    const s = await settings.load()
    await extractor.backgroundTick({
      idleSeconds: powerMonitor.getSystemIdleTime(),
      enabled: s.backgroundExtraction,
      dailyLimit: s.dailyExtractionLimit
    })
  }
  if (process.env.SINAPSI_FAKE_EXTRACT !== '1')
    setInterval(() => void tick().catch((e) => console.warn('[graph] background', e)), 10 * 60_000)
  return { bridge }
}
