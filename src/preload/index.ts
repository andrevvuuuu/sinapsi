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
    attempt: (a) => ipcRenderer.invoke(CH.notesAttempt, a),
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
    record: (r) => ipcRenderer.invoke(CH.reviewRecord, r),
    memory: () => ipcRenderer.invoke(CH.reviewMemory),
    calibration: () => ipcRenderer.invoke(CH.reviewCalibration),
    intervals: (id) => ipcRenderer.invoke(CH.reviewIntervals, id),
    sessions: () => ipcRenderer.invoke(CH.reviewSessions)
  },
  notebook: {
    list: () => ipcRenderer.invoke(CH.notebookList),
    create: (name) => ipcRenderer.invoke(CH.notebookCreate, name),
    bucketFor: (subject) => ipcRenderer.invoke(CH.notebookBucketFor, subject),
    remove: (id) => ipcRenderer.invoke(CH.notebookRemove, id),
    addFiles: (id, paths) => ipcRenderer.invoke(CH.notebookAddFiles, id, paths),
    chooseFiles: (id) => ipcRenderer.invoke(CH.notebookChooseFiles, id),
    addYoutube: (id, url) => ipcRenderer.invoke(CH.notebookAddYoutube, id, url),
    removeSource: (id) => ipcRenderer.invoke(CH.notebookRemoveSource, id),
    retrySource: (id) => ipcRenderer.invoke(CH.notebookRetrySource, id),
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
    examSelf: (id, problemId, points) =>
      ipcRenderer.invoke(CH.practiceExamSelf, id, problemId, points),
    calibration: () => ipcRenderer.invoke(CH.practiceCalibration),
    photo: (id, bytes) => ipcRenderer.invoke(CH.practicePhoto, id, bytes),
    camera: () => ipcRenderer.invoke(CH.practiceCamera),
    onUpdate: (cb) => subscribe(CH.practiceUpdated, cb)
  },
  lessons: {
    list: () => ipcRenderer.invoke(CH.lessonsList),
    get: (id) => ipcRenderer.invoke(CH.lessonsGet, id),
    create: (e) => ipcRenderer.invoke(CH.lessonsCreate, e),
    update: (id, p) => ipcRenderer.invoke(CH.lessonsUpdate, id, p),
    addConfusion: (id, t) => ipcRenderer.invoke(CH.lessonsAddConfusion, id, t),
    resolveConfusion: (id, q) => ipcRenderer.invoke(CH.lessonsResolveConfusion, id, q),
    setMastery: (id, l) => ipcRenderer.invoke(CH.lessonsSetMastery, id, l),
    archive: (id) => ipcRenderer.invoke(CH.lessonsArchive, id),
    launch: (id, m) => ipcRenderer.invoke(CH.lessonsLaunch, id, m)
  },
  tutor: {
    calendar: () => ipcRenderer.invoke(CH.tutorCalendar),
    report: () => ipcRenderer.invoke(CH.tutorReport)
  },
  exams: {
    list: () => ipcRenderer.invoke(CH.examsList),
    create: (entry) => ipcRenderer.invoke(CH.examsCreate, entry),
    update: (id, patch) => ipcRenderer.invoke(CH.examsUpdate, id, patch),
    archive: (id) => ipcRenderer.invoke(CH.examsArchive, id)
  },
  plan: { week: () => ipcRenderer.invoke(CH.planWeek) },
  suggest: { get: () => ipcRenderer.invoke(CH.suggestGet) },
  ui: {
    reducedTransparency: () => ipcRenderer.invoke(CH.uiTransparency),
    onReducedTransparency: (cb) => subscribe(CH.uiTransparencyChanged, cb)
  }
}

contextBridge.exposeInMainWorld('sinapsi', api)
