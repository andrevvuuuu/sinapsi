import { useEffect, useState, type ReactNode } from 'react'
import type { Settings } from '../../../shared/settings-schema'
import type { VaultResult } from '../../../shared/api'
import { SettingsDialog } from '../home/SettingsDialog'
import { Sidebar } from './Sidebar'
import { LiquidDock, type Destination } from './LiquidDock'
import { MapView } from './MapView'
import { useAppData } from './AppData'
import { CommandPalette } from './CommandPalette'
import './shell.css'

type ShellView =
  | 'home'
  | 'map'
  | 'notes'
  | 'plan'
  | 'lessons'
  | 'lesson'
  | 'lesson-new'
  | 'lesson-edit'
  | 'practice-setup'
  | 'review'
  | 'source'

export function AppShell({
  view,
  children,
  onNavigate,
  onHome,
  onReview,
  onPractice,
  onOpenSource,
  onLesson,
  onLessons,
  onNotes,
  index,
  livePaths,
  onSettingsChanged,
  onStudy,
  onMapReview,
  onMapAskTutor
}: {
  view: ShellView
  children: ReactNode
  onNavigate: (destination: Destination) => void
  onHome: () => void
  onReview: () => void
  onPractice: () => void
  onOpenSource: (path: string) => void
  onLesson: (id: string) => void
  onLessons: () => void
  onNotes: () => void
  index: VaultResult | null
  livePaths: string[]
  onSettingsChanged: (s: Settings) => void
  onStudy: (text: string) => void
  onMapReview: (ids: string[], opts?: { cascadeWeak?: string[] }) => void
  onMapAskTutor?: (conceptId: string, name: string) => void
}): React.JSX.Element {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)

  const {
    settings,
    setSettings,
    lessons,
    aiStatus: status,
    due,
    notes,
    index: appIndex
  } = useAppData()

  const resolvedIndex = index ?? appIndex

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setCmdOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const current =
    view === 'review'
      ? 'review'
      : view === 'practice-setup'
        ? 'practice'
        : view.startsWith('lesson')
          ? 'lessons'
          : view === 'home'
            ? 'home'
            : view === 'notes' || view === 'source'
              ? 'notes'
              : null
  const dockActive: Destination | null =
    view === 'home' ? 'Oggi' : view === 'map' ? 'Mappa' : view === 'plan' ? 'Piano' : null
  const setTheme = (t: Settings['theme']): void => {
    // Optimistic: apply theme immediately, persist asynchronously
    setSettings((s) => (s ? { ...s, theme: t } : s))
    void import('./theme').then((m) => m.applyTheme(t))
    if (!settings) return
    void window.sinapsi?.settings
      ?.set?.({ theme: t })
      .then((s) => {
        if (s) {
          setSettings(s)
          onSettingsChanged(s)
        }
      })
      .catch(() => undefined)
  }

  const dockColor = 'var(--sh-violet)'

  return (
    <div className="sh-shell">
      <Sidebar
        index={resolvedIndex && 'notes' in resolvedIndex ? resolvedIndex : null}
        due={due}
        lessons={lessons}
        status={status}
        current={current}
        onHome={onHome}
        onReview={onReview}
        onPractice={onPractice}
        onOpenSource={onOpenSource}
        onLesson={onLesson}
        onLessons={onLessons}
        onNotes={onNotes}
        onSettings={() => setSettingsOpen(true)}
        subjectPrefs={{
          subjectOrder: settings?.subjectOrder ?? [],
          universitySubjects: settings?.universitySubjects ?? null
        }}
        onSubjectPrefs={(prefs) => {
          // Optimistic: the sidebar reorders at once; the saved settings follow.
          setSettings((s) => (s ? { ...s, ...prefs } : s))
          void window.sinapsi?.settings
            ?.set?.(prefs)
            .then((s) => {
              if (s) {
                setSettings(s)
                onSettingsChanged(s)
              }
            })
            .catch(() => undefined)
        }}
      />
      <div className="sh-main-wrap" style={{ '--sh-dock-color': dockColor } as React.CSSProperties}>
        <main className="sh-main" key={view}>
          {view === 'map' ? (
            <MapView
              index={resolvedIndex && 'notes' in resolvedIndex ? resolvedIndex : null}
              livePaths={[
                ...new Set([
                  ...livePaths,
                  ...notes.filter((note) => note.status === 'ready').map((note) => note.sourcePath)
                ])
              ]}
              onReview={onMapReview}
              onAskTutor={onMapAskTutor}
              onOpenNote={onOpenSource}
              onStudy={onStudy}
            />
          ) : (
            children
          )}
        </main>
        {dockActive && <LiquidDock active={dockActive} onChange={onNavigate} />}
      </div>
      {settingsOpen && settings && (
        <SettingsDialog
          settings={settings}
          onTheme={setTheme}
          onSaved={(s) => {
            setSettings(s)
            onSettingsChanged(s)
            setSettingsOpen(false)
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {cmdOpen && (
        <CommandPalette
          onClose={() => setCmdOpen(false)}
          onOpenSource={onOpenSource}
          onStudy={onStudy}
          onMapReview={onMapReview}
          onLesson={onLesson}
          onReview={onReview}
          onPractice={onPractice}
          onNavigate={onNavigate}
          onNotes={onNotes}
          onLessons={onLessons}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}
    </div>
  )
}
