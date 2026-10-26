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
  app: { openExternal: (url) => ipcRenderer.invoke(CH.openExternal, url) }
}

contextBridge.exposeInMainWorld('sinapsi', api)
