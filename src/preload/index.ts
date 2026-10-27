import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
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
    extract: (path) => ipcRenderer.invoke(CH.graphExtract, path),
    status: () => ipcRenderer.invoke(CH.graphStatus),
    onChange: (cb) => subscribe(CH.graphChanged, cb),
    positions: () => ipcRenderer.invoke(CH.graphPositions),
    savePositions: (p) => ipcRenderer.invoke(CH.graphSavePositions, p)
  }
}

contextBridge.exposeInMainWorld('sinapsi', api)
