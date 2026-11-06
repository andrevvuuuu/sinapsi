import { useMemo, useRef, useState } from 'react'
import { DICTATION_SHORT, useDictation } from '../components/dictation'
import { DictationError, MicButton } from '../components/MicButton'
import { LogoMark } from './LogoMark'
import type { NoteMeta, PracticeSummary, ReviewSession, SessionSummary } from '../../../shared/api'
import type { Settings } from '../../../shared/settings-schema'
import { IconChevron, IconGear, IconPanel } from './icons'
import { SettingsDialog } from './SettingsDialog'
import { Splitter } from './Splitter'
import { SegLens } from '../components/SegLens'
import { Inline } from '../nota/Md'

const KINDS = ['Tutte', 'Apprendimento', 'Pratica', 'Ripasso'] as const
type Kind = (typeof KINDS)[number]
const norm = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

type Props = {
  sessions: SessionSummary[]
  practices?: PracticeSummary[]
  reviews?: ReviewSession[]
  onOpenSession: (id: string) => void
  onOpenPractice?: (id: string) => void
  onOpenReview?: (conceptIds: string[]) => void
  notes: NoteMeta[]
  /** The vault subject (topic folder) of a note's source, for the note vive explorer. */
  subjectOf: (sourcePath: string) => string | null
  onOpenNota: (id: string) => void
  settings: Settings | null
  onSettings: (s: Settings) => void
  onTheme: (t: Settings['theme']) => void
  onClose: () => void
  sessionsHeight?: number
  onSessionsHeight?: (v: number) => void
}

export function LeftPanel(p: Props): React.JSX.Element {
  const [kind, setKind] = useState<Kind>('Tutte')
  const [searching, setSearching] = useState(false)
  const [q, setQ] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const gear = useRef<HTMLButtonElement>(null)
  const searchField = useRef<HTMLInputElement>(null)
  const searchMic = useDictation({
    target: searchField,
    value: q,
    onChange: setQ,
    maxSeconds: DICTATION_SHORT
  })
  const [opened, setOpened] = useState<Record<string, boolean>>({})
  const day = (t: number): string =>
    new Date(t).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })

  const rows = useMemo(() => {
    const all = [
      ...(kind === 'Tutte' || kind === 'Apprendimento'
        ? p.sessions.map((x) => ({
            key: 's' + x.id,
            topic: x.topic,
            at: x.updatedAt,
            label: 'Apprendimento',
            open: () => p.onOpenSession(x.id)
          }))
        : []),
      ...(kind === 'Tutte' || kind === 'Pratica'
        ? (p.practices ?? []).map((x) => ({
            key: 'p' + x.id,
            topic: x.topic,
            at: x.updatedAt,
            label: x.mode === 'exam' ? 'Simulazione' : 'Pratica',
            open: () => p.onOpenPractice?.(x.id)
          }))
        : []),
      ...(kind === 'Tutte' || kind === 'Ripasso'
        ? (p.reviews ?? []).map((x) => ({
            key: x.id,
            topic: x.topic,
            at: x.at,
            label: `Ripasso · ${x.count} domande`,
            open: () => p.onOpenReview?.(x.conceptIds)
          }))
        : [])
    ]
    const words = norm(q).split(/\s+/).filter(Boolean)
    return all
      .filter((r) => words.every((w) => norm(r.topic).includes(w)))
      .sort((a, b) => b.at - a.at)
  }, [kind, q, p])

  const folders = useMemo(() => {
    const m = new Map<string, NoteMeta[]>()
    for (const n of p.notes) {
      const s = p.subjectOf(n.sourcePath) ?? 'Altro'
      m.set(s, [...(m.get(s) ?? []), n])
    }
    return [...m].sort(([a], [b]) =>
      a === 'Altro' ? 1 : b === 'Altro' ? -1 : a.localeCompare(b, 'it')
    )
  }, [p])

  return (
    <aside className="left" aria-label="Sessioni e note vive">
      <div className="ph drag">
        <span className="logo" style={{ paddingLeft: 64 }}>
          <LogoMark />
          Sinapsi
        </span>
        <button
          type="button"
          className="icon-btn nodrag"
          aria-label="Chiudi il pannello laterale"
          onClick={p.onClose}
        >
          <IconPanel />
        </button>
      </div>
      <section
        className="psec"
        aria-label="Sessioni"
        style={p.sessionsHeight ? { maxHeight: p.sessionsHeight } : undefined}
      >
        <div className="seg seg-track glass glass-text" role="group" aria-label="Sessioni da mostrare">
          {KINDS.map((k) => (
            <button key={k} type="button" aria-pressed={k === kind} onClick={() => setKind(k)}>
              {k}
            </button>
          ))}
          <SegLens />
        </div>
        <div className="sess-search">
          {searching ? (
            <div className="mic-field">
              <input
                ref={searchField}
                readOnly={searchMic.state !== 'idle'}
                autoFocus
                aria-label="Cerca tra le sessioni"
                placeholder="Cerca una sessione già fatta…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    // While dictating, Escape only stops the recording: the field stays.
                    if (searchMic.state !== 'idle')
                      return searchMic.state === 'recording' ? searchMic.toggle() : undefined
                    setQ('')
                    setSearching(false)
                  }
                }}
              />
              <MicButton dictation={searchMic} size="sm" />
            </div>
          ) : (
            <button type="button" className="sess-find" onClick={() => setSearching(true)}>
              Cerca una sessione
            </button>
          )}
        </div>
        <DictationError dictation={searchMic} />
        {rows.length === 0 ? (
          <p className="empty">{q ? 'Nessuna sessione trovata.' : 'Nessuna sessione ancora.'}</p>
        ) : (
          <ul className="sessions scroll" aria-label="Sessioni passate">
            {rows.slice(0, 30).map((x) => (
              <li key={x.key}>
                <button type="button" onClick={x.open}>
                  <i className="dot" aria-hidden="true" />
                  <span className="t">{x.topic}</span>
                  <span className="s">
                    {x.label} · {day(x.at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {p.onSessionsHeight ? (
        <Splitter
          orientation="horizontal"
          label="Altezza delle sessioni"
          value={p.sessionsHeight ?? 300}
          min={120}
          max={900}
          onChange={p.onSessionsHeight}
          className="sec-split"
        />
      ) : (
        <div className="divider" />
      )}
      <section className="psec scroll nv-explorer" aria-label="Note vive">
        <h2>Note vive</h2>
        {folders.length === 0 ? (
          <p className="empty">
            Le note vive nascono dopo le sessioni di Apprendimento o dalle note di Obsidian.
          </p>
        ) : (
          <div className="tree">
            {folders.map(([subject, list]) => (
              <details
                key={subject}
                open={opened[subject] ?? folders.length <= 2}
                onToggle={(e) =>
                  setOpened((o) => ({ ...o, [subject]: (e.target as HTMLDetailsElement).open }))
                }
              >
                <summary>
                  <IconChevron />
                  {subject}
                  <small className="cnt">{list.length}</small>
                </summary>
                <div className="kids">
                  {list.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      className="leaf nv-leaf"
                      onClick={() => p.onOpenNota(n.id)}
                    >
                      <i className={'dot nv-' + n.status} aria-hidden="true" />
                      <span>
                        <Inline md={n.title} />
                      </span>
                      {n.status !== 'ready' && (
                        <small>{n.status === 'generating' ? 'in scrittura' : 'da riprovare'}</small>
                      )}
                    </button>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </section>
      <div className="pf">
        <div className="row">
          <button
            ref={gear}
            type="button"
            className="icon-btn"
            aria-label="Impostazioni"
            aria-haspopup="dialog"
            onClick={() => setSettingsOpen(true)}
          >
            <IconGear />
          </button>
          <span className="vp">Impostazioni</span>
        </div>
      </div>
      {settingsOpen && p.settings && (
        <SettingsDialog
          settings={p.settings}
          onTheme={p.onTheme}
          onSaved={p.onSettings}
          onClose={() => {
            setSettingsOpen(false)
            gear.current?.focus()
          }}
        />
      )}
    </aside>
  )
}
