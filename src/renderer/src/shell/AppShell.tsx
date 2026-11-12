import { useEffect, useState, type ReactNode } from 'react'
import type { Settings, Engine } from '../../../shared/settings-schema'
import type { VaultResult, EngineStatus as Status, NoteMeta } from '../../../shared/api'
import type { LessonEntry } from '../../../shared/lesson-types'
import { SettingsDialog } from '../home/SettingsDialog'
import { Sidebar } from './Sidebar'
import { LiquidDock, type Destination } from './LiquidDock'
import { MapView } from './MapView'
import './shell.css'

type ShellView =
  | 'home'
  | 'map'
  | 'plan'
  | 'lessons'
  | 'lesson'
  | 'lesson-new'
  | 'lesson-edit'
  | 'practice-setup'
  | 'source'

export function AppShell({
  view,
  children,
  onNavigate,
  onReview,
  onPractice,
  onOpenSource,
  onLesson,
  onLessons,
  index,
  livePaths,
  onSettingsChanged,
  onStudy,
  onMapReview
}: {
  view: ShellView
  children: ReactNode
  onNavigate: (destination: Destination) => void
  onReview: () => void
  onPractice: () => void
  onOpenSource: (path: string) => void
  onLesson: (id: string) => void
  onLessons: () => void
  index: VaultResult | null
  livePaths: string[]
  onSettingsChanged: (s: Settings) => void
  onStudy: (text: string) => void
  onMapReview: (ids: string[]) => void
}): React.JSX.Element {
  const [settingsOpen, setSettingsOpen] = useState(false),
    [lessons, setLessons] = useState<LessonEntry[]>([]),
    [status, setStatus] = useState<Record<Engine, Status> | null>(null),
    [settings, setSettings] = useState<Settings | null>(null),
    [due, setDue] = useState(0),
    [notes, setNotes] = useState<NoteMeta[]>([])

  useEffect(() => {
    const api = window.sinapsi
    void api.lessons
      .list()
      .then(setLessons)
      .catch(() => undefined)
    void api.ai.status().then(setStatus)
    void api.settings.get().then((value) => {
      setSettings(value)
      void import('./theme').then((theme) => theme.applyTheme(value.theme, true))
    })
    void api.notes
      .list()
      .then(setNotes)
      .catch(() => undefined)
    void api.review
      .memory()
      .then((m) =>
        setDue(Object.values(m).filter((x) => x.due !== null && x.due <= Date.now()).length)
      )
      .catch(() => undefined)
    const off = api.ai.onStatus(setStatus)
    const offNotes = api.notes.onUpdate(() => void api.notes.list().then(setNotes))
    return () => {
      off()
      offNotes()
    }
  }, [])

  const destination: Destination =
    view === 'home' ? 'Oggi' : view === 'map' ? 'Mappa' : view === 'plan' ? 'Piano' : 'Oggi'

  const dockColor =
    destination === 'Mappa'
      ? 'var(--sh-map)'
      : destination === 'Piano'
        ? 'var(--sh-plan)'
        : 'var(--sh-violet)'

  return (
    <div className="sh-shell">
      <Sidebar
        index={index && 'notes' in index ? index : null}
        due={due}
        lessons={lessons}
        status={status}
        theme={settings?.theme ?? 'lavagna'}
        onTheme={(t) => {
          if (settings)
            void window.sinapsi.settings.set({ theme: t }).then((s) => {
              setSettings(s)
              onSettingsChanged(s)
              import('./theme').then((m) => m.applyTheme(t))
            })
        }}
        onReview={onReview}
        onPractice={onPractice}
        onOpenSource={onOpenSource}
        onLesson={onLesson}
        onLessons={onLessons}
        onSettings={() => setSettingsOpen(true)}
      />
      <main
        className="sh-main"
        key={view}
        style={{ '--sh-dock-color': dockColor } as React.CSSProperties}
      >
        {view === 'map' ? (
          <MapView
            index={index && 'notes' in index ? index : null}
            livePaths={[
              ...new Set([
                ...livePaths,
                ...notes.filter((note) => note.status === 'ready').map((note) => note.sourcePath)
              ])
            ]}
            onReview={onMapReview}
            onOpenNote={onOpenSource}
            onStudy={onStudy}
          />
        ) : (
          children
        )}
        <LiquidDock active={destination} onChange={onNavigate} />
      </main>
      {settingsOpen && settings && (
        <SettingsDialog
          settings={settings}
          onTheme={(t) => {
            void window.sinapsi.settings.set({ theme: t }).then((s) => {
              setSettings(s)
              onSettingsChanged(s)
              import('./theme').then((m) => m.applyTheme(t))
            })
          }}
          onSaved={(s) => {
            setSettings(s)
            onSettingsChanged(s)
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}
