import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EngineStatus as Status, NoteMeta, PracticeSummary, ReviewSession, SessionSummary, VaultResult } from '../../../shared/api'
import type { Engine, Settings } from '../../../shared/settings-schema'
import { buildTree } from './build-tree'
import { Composer } from './Composer'
import { EngineStatus } from './EngineStatus'
import { IconPanel } from './icons'
import { LeftPanel } from './LeftPanel'
import { NotebookPanel } from './NotebookPanel'
import { GraphView } from '../graph/GraphView'
import './home.css'

function applyTheme(theme: Settings['theme']): void {
  const dark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.dataset.theme = theme === 'system' ? (dark ? 'lavagna' : 'trattato') : theme
}

type HomeProps = {
  onOpenSession?: (id: string) => void
  onOpenNota?: (id: string) => void
  onOpenSource?: (path: string) => void
  onOpenReview?: (query: string, conceptIds?: string[]) => void
  onOpenNotebook?: (id: string) => void
  onOpenPractice?: (text: string) => void
  onOpenPracticeSession?: (id: string) => void
}

export default function Home({ onOpenSession, onOpenNota, onOpenSource, onOpenReview, onOpenNotebook, onOpenPractice, onOpenPracticeSession }: HomeProps = {}): React.JSX.Element {
  const api = window.sinapsi
  const [index, setIndex] = useState<VaultResult | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [status, setStatus] = useState<Record<Engine, Status> | null>(null)
  const [left, setLeft] = useState(true)
  const [right, setRight] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [practices, setPractices] = useState<PracticeSummary[]>([])
  const [reviews, setReviews] = useState<ReviewSession[]>([])
  const [notes, setNotes] = useState<NoteMeta[]>([])
  const [due, setDue] = useState(0)

  const [loadError, setLoadError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    try {
      const [s, idx] = await Promise.all([api.settings.get(), api.vault.index()])
      setSettings(s)
      applyTheme(s.theme)
      setIndex(idx)
      setLoadError(null)
    } catch (e) {
      // Without this the home stayed empty with no explanation.
      setLoadError((e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    }
  }, [api])

  useEffect(() => {
    void reload()
    void api.ai.status().then(setStatus)
    void api.session?.list().then(setSessions)
    void api.practice?.list().then(setPractices).catch(() => undefined)
    // Memory moves while the app stays open: the badge and the session list refresh on focus and every 10 minutes.
    const refresh = (): void => {
      void api.review
        ?.memory()
        .then((m) => setDue(Object.values(m).filter((x) => x.due !== null && x.due <= Date.now()).length))
        .catch(() => undefined)
      void api.review?.sessions?.().then(setReviews).catch(() => undefined)
    }
    refresh()
    window.addEventListener('focus', refresh)
    const every = setInterval(refresh, 10 * 60_000)
    const loadNotes = (): void => void api.notes?.list().then(setNotes)
    loadNotes()
    const offNotes = api.notes?.onUpdate(loadNotes)
    const offVault = api.vault.onChange(setIndex)
    const offAi = api.ai.onStatus(setStatus)
    return () => {
      window.removeEventListener('focus', refresh)
      clearInterval(every)
      offVault()
      offAi()
      offNotes?.()
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
        sessions={sessions}
        practices={practices}
        reviews={reviews}
        onOpenSession={(id) => onOpenSession?.(id)}
        onOpenPractice={(id) => onOpenPracticeSession?.(id)}
        onOpenReview={(ids) => onOpenReview?.('', ids)}
        notes={notes}
        subjectOf={(path) => (index && 'notes' in index ? (index.notes.find((n) => n.path === path)?.subject ?? null) : null)}
        onOpenNota={(id) => onOpenNota?.(id)}
        settings={settings}
        onSettings={setSettings}
        onTheme={(t) => void setTheme(t)}
        onClose={() => setLeft(false)}
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
        {loadError && (
          <div className="missing">
            <div role="alert">
              <h2>Non riesco a caricare i dati dell’app</h2>
              <p>{`Non riesco a caricare: ${loadError}`}</p>
              <button type="button" className="btn pri" onClick={() => void reload()}>
                Riprova
              </button>
            </div>
          </div>
        )}
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
        ) : index && 'notes' in index && index.notes.length > 0 && api.graph ? (
          <GraphView
            index={index}
            onReview={(ids) => onOpenReview?.('', ids)}
            onOpenNote={(path) => onOpenSource?.(path)}
            onStudy={(title) =>
              void api.session
                ?.start(title)
                .then((id) => onOpenSession?.(id))
                .catch((e) => setToast(e instanceof Error ? e.message : String(e)))
            }
          />
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
        <Composer
          due={due}
          onSubmit={async (mode, text) => {
            if (mode === 'Ripasso') return onOpenReview?.(text)
            if (mode === 'Pratica') return onOpenPractice?.(text)
            if (mode !== 'Apprendimento' || !api.session) return setToast(`${mode}: arriva in una prossima fase`)
            const id = await api.session.start(text)
            onOpenSession?.(id)
          }}
        />
      </main>
      <NotebookPanel
        onClose={() => setRight(false)}
        onOpen={(id) => onOpenNotebook?.(id)}
        tree={tree}
        onOpenNote={(path) => onOpenSource?.(path)}
        vaultPath={settings?.vaultPath}
        onChooseVault={() => void chooseVault()}
      />
    </div>
  )
}
