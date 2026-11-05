import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { CH, type SinapsiApi } from '../shared/api'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: SinapsiApi = {
  settings: {
    get: () => ipcRenderer.invoke(CH.settingsGet),
    set: (patch) => ipcRenderer.invoke(CH.settingsSet, patch),
    chooseVault: () => ipcRenderer.invoke(CH.settingsChooseVault)
  },
  vault: {
    index: () => ipcRenderer.invoke(CH.vaultIndex),
    onChange: (cb) => subscribe(CH.vaultChanged, cb)
  },
  ai: {
    status: () => ipcRenderer.invoke(CH.aiStatus),
    onStatus: (cb) => subscribe(CH.aiStatusChanged, cb)
  },
  app: { openExternal: (url) => ipcRenderer.invoke(CH.openExternal, url) },
  session: {
    start: (topic) => ipcRenderer.invoke(CH.sessionStart, topic),
    list: () => ipcRenderer.invoke(CH.sessionList),
    get: (id) => ipcRenderer.invoke(CH.sessionGet, id),
    answer: (id, a) => ipcRenderer.invoke(CH.sessionAnswer, id, a),
    say: (id, text) => ipcRenderer.invoke(CH.sessionSay, id, text),
    retry: (id) => ipcRenderer.invoke(CH.sessionRetry, id),
    onUpdate: (cb) => subscribe(CH.sessionUpdated, cb)
  },
  notes: {
    create: (req) => ipcRenderer.invoke(CH.notesCreate, req),
    list: () => ipcRenderer.invoke(CH.notesList),
    get: (id) => ipcRenderer.invoke(CH.notesGet, id),
    retry: (id) => ipcRenderer.invoke(CH.notesRetry, id),
    onUpdate: (cb) => subscribe(CH.notesUpdated, cb)
  },
  graph: {
    get: () => ipcRenderer.invoke(CH.graphGet),
    extract: (path, reason) => ipcRenderer.invoke(CH.graphExtract, path, reason),
    status: () => ipcRenderer.invoke(CH.graphStatus),
    onChange: (cb) => subscribe(CH.graphChanged, cb),
    positions: () => ipcRenderer.invoke(CH.graphPositions),
    savePositions: (p) => ipcRenderer.invoke(CH.graphSavePositions, p)
  },
  voice: {
    transcribe: (bytes) => ipcRenderer.invoke(CH.voiceTranscribe, bytes),
    microphone: () => ipcRenderer.invoke(CH.voiceMicrophone),
    onStage: (cb) => subscribe(CH.voiceStage, cb)
  },
  review: {
    plan: (opts) => ipcRenderer.invoke(CH.reviewPlan, opts),
    grade: (req) => ipcRenderer.invoke(CH.reviewGrade, req),
    explain: (req) => ipcRenderer.invoke(CH.reviewExplain, req),
    voice: (bytes) => ipcRenderer.invoke(CH.reviewVoice, bytes),
    microphone: () => ipcRenderer.invoke(CH.reviewMicrophone),
    record: (r) => ipcRenderer.invoke(CH.reviewRecord, r),
    memory: () => ipcRenderer.invoke(CH.reviewMemory),
    intervals: (id) => ipcRenderer.invoke(CH.reviewIntervals, id),
    sessions: () => ipcRenderer.invoke(CH.reviewSessions)
  },
  notebook: {
    list: () => ipcRenderer.invoke(CH.notebookList),
    create: (name) => ipcRenderer.invoke(CH.notebookCreate, name),
    update: (id, patch) => ipcRenderer.invoke(CH.notebookUpdate, id, patch),
    remove: (id) => ipcRenderer.invoke(CH.notebookRemove, id),
    addFiles: (id, paths) => ipcRenderer.invoke(CH.notebookAddFiles, id, paths),
    chooseFiles: (id) => ipcRenderer.invoke(CH.notebookChooseFiles, id),
    addYoutube: (id, url) => ipcRenderer.invoke(CH.notebookAddYoutube, id, url),
    addVault: (id, path) => ipcRenderer.invoke(CH.notebookAddVault, id, path),
    removeSource: (id) => ipcRenderer.invoke(CH.notebookRemoveSource, id),
    retrySource: (id) => ipcRenderer.invoke(CH.notebookRetrySource, id),
    refreshSource: (id) => ipcRenderer.invoke(CH.notebookRefreshSource, id),
    busy: (id) => ipcRenderer.invoke(CH.notebookBusy, id),
    text: (id) => ipcRenderer.invoke(CH.notebookText, id),
    chat: (id) => ipcRenderer.invoke(CH.notebookChat, id),
    ask: (id, q, ids) => ipcRenderer.invoke(CH.notebookAsk, id, q, ids),
    openFile: (id) => ipcRenderer.invoke(CH.notebookOpenFile, id),
    pathForFile: (file) => webUtils.getPathForFile(file),
    onUpdate: (cb) => subscribe(CH.notebookUpdated, cb)
  },
  practice: {
    catalog: () => ipcRenderer.invoke(CH.practiceCatalog),
    create: (m) => ipcRenderer.invoke(CH.practiceCreate, m),
    submit: (id, s) => ipcRenderer.invoke(CH.practiceSubmit, id, s),
    retry: (id) => ipcRenderer.invoke(CH.practiceRetry, id),
    get: (id) => ipcRenderer.invoke(CH.practiceGet, id),
    list: () => ipcRenderer.invoke(CH.practiceList),
    examStart: (m, minutes, paper) => ipcRenderer.invoke(CH.practiceExamStart, m, minutes, paper),
    examSave: (id, a) => ipcRenderer.invoke(CH.practiceExamSave, id, a),
    examDeliver: (id, a) => ipcRenderer.invoke(CH.practiceExamDeliver, id, a),
    examHand: (id) => ipcRenderer.invoke(CH.practiceExamHand, id),
    examSelf: (id, problemId, points) => ipcRenderer.invoke(CH.practiceExamSelf, id, problemId, points),
    calibration: () => ipcRenderer.invoke(CH.practiceCalibration),
    photo: (id, bytes) => ipcRenderer.invoke(CH.practicePhoto, id, bytes),
    camera: () => ipcRenderer.invoke(CH.practiceCamera),
    onUpdate: (cb) => subscribe(CH.practiceUpdated, cb)
  },
  suggest: { get: () => ipcRenderer.invoke(CH.suggestGet) },
  ui: {
    reducedTransparency: () => ipcRenderer.invoke(CH.uiTransparency),
    onReducedTransparency: (cb) => subscribe(CH.uiTransparencyChanged, cb)
  }
}

contextBridge.exposeInMainWorld('sinapsi', api)
