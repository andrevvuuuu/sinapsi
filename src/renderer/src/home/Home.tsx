import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EngineStatus as Status, VaultResult } from '../../../shared/api'
import type { Engine, Settings } from '../../../shared/settings-schema'
import { buildTree } from './build-tree'
import { Composer } from './Composer'
import { EngineStatus } from './EngineStatus'
import { IconPanel } from './icons'
import { LeftPanel } from './LeftPanel'
import { NotebookPanel } from './NotebookPanel'
import './home.css'

function applyTheme(theme: Settings['theme']): void {
  const dark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.dataset.theme = theme === 'system' ? (dark ? 'lavagna' : 'trattato') : theme
}

export default function Home(): React.JSX.Element {
  const api = window.sinapsi
  const [index, setIndex] = useState<VaultResult | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [status, setStatus] = useState<Record<Engine, Status> | null>(null)
  const [left, setLeft] = useState(true)
  const [right, setRight] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const [s, idx] = await Promise.all([api.settings.get(), api.vault.index()])
    setSettings(s)
    applyTheme(s.theme)
    setIndex(idx)
  }, [api])

  useEffect(() => {
    void reload()
    void api.ai.status().then(setStatus)
    const offVault = api.vault.onChange(setIndex)
    const offAi = api.ai.onStatus(setStatus)
    return () => {
      offVault()
      offAi()
    }
  }, [api, reload])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  const tree = useMemo(() => (index && 'notes' in index ? buildTree(index.notes) : []), [index])
  const chooseVault = async (): Promise<void> => {
    await api.settings.chooseVault()
    await reload()
  }
  const setTheme = async (theme: Settings['theme']): Promise<void> => {
    setSettings(await api.settings.set({ theme }))
    applyTheme(theme)
  }

  return (
    <div className={'app' + (left ? '' : ' l-off') + (right ? '' : ' r-off')}>
      <LeftPanel
        tree={tree}
        settings={settings}
        onClose={() => setLeft(false)}
        onOpenNote={(path) => void api.app.openExternal('obsidian://open?path=' + encodeURIComponent(path))}
        onTheme={(t) => void setTheme(t)}
        onChooseVault={() => void chooseVault()}
      />
      <main className="center">
        <div className="topbar drag" />
        <div className="reopen l">
          <button type="button" className="icon-btn" aria-label="Apri il pannello laterale" onClick={() => setLeft(true)}>
            <IconPanel />
          </button>
        </div>
        <div className="reopen r">
          <button type="button" className="icon-btn" aria-label="Apri il pannello Notebook" onClick={() => setRight(true)}>
            <IconPanel />
          </button>
        </div>
        <EngineStatus status={status} />
        {index && 'error' in index ? (
          <div className="missing">
            <div>
              <h2>Non trovo il tuo vault Obsidian</h2>
              <p>
                Cercavo in <code>{index.path}</code>
              </p>
              <button type="button" className="btn pri" onClick={() => void chooseVault()}>
                Scegli la cartella del vault
              </button>
            </div>
          </div>
        ) : (
          <div className="placeholder">
            <div>
              <div className="orb" aria-hidden="true">
                <i />
              </div>
              <h2>
                Il grafo apparirà quando <em>inizi a studiare</em>
              </h2>
              <p>
                {index && 'notes' in index ? `${index.notes.length} note lette dal tuo vault. ` : ''}Scrivi qui sotto cosa vuoi imparare.
              </p>
            </div>
          </div>
        )}
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
        <Composer onSubmit={() => setToast('Le sessioni arrivano nella prossima fase')} />
      </main>
      <NotebookPanel onClose={() => setRight(false)} />
    </div>
  )
}
