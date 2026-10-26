import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { APP_NAME } from '../shared/version'
import { registerIpc } from './ipc'
import { navigationDecision } from './navigation'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: APP_NAME,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f100d',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  // A link written by the tutor must never replace the app (and its API) with a web page.
  mainWindow.webContents.on('will-navigate', (e, url) => {
    e.preventDefault()
    const d = navigationDecision(url)
    if (d.external) void shell.openExternal(d.external)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (details.url.startsWith('https://')) shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.setName(APP_NAME)

app.whenReady().then(() => {
  electronApp.setAppUserModelId('it.andreaantonelli.sinapsi')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
