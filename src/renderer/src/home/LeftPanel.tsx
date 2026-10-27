import { useState } from 'react'
import type { NoteMeta, SessionSummary } from '../../../shared/api'
import type { Settings } from '../../../shared/settings-schema'
import type { TreeNode } from './build-tree'
import { IconGear, IconPanel } from './icons'
import { NoteTree } from './NoteTree'

const FILTERS = ['Pratica', 'Apprendimento', 'Entrambe'] as const
const THEMES: [Settings['theme'], string][] = [['lavagna', 'Lavagna'], ['trattato', 'Trattato'], ['system', 'Sistema']]

type Props = {
  tree: TreeNode[]
  sessions: SessionSummary[]
  onOpenSession: (id: string) => void
  notes: NoteMeta[]
  onOpenNota: (id: string) => void
  settings: Settings | null
  onClose: () => void
  onOpenNote: (path: string) => void
  onTheme: (t: Settings['theme']) => void
  onChooseVault: () => void
}

export function LeftPanel({ tree, sessions, onOpenSession, notes, onOpenNota, settings, onClose, onOpenNote, onTheme, onChooseVault }: Props): React.JSX.Element {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('Entrambe')
  const [open, setOpen] = useState(false)
  return (
    <aside className="left" aria-label="Sessioni e note">
      <div className="ph drag">
        <span className="logo" style={{ paddingLeft: 64 }}>
          <i aria-hidden="true" />
          Sinapsi
        </span>
        <button type="button" className="icon-btn nodrag" aria-label="Chiudi il pannello laterale" onClick={onClose}>
          <IconPanel />
        </button>
      </div>
      <div className="psec">
        <div className="seg" role="group" aria-label="Filtra le sessioni">
          {FILTERS.map((f) => (
            <button key={f} type="button" aria-pressed={f === filter} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
        {filter === 'Pratica' || sessions.length === 0 ? (
          <p className="empty">Nessuna sessione ancora.</p>
        ) : (
          <ul className="sessions">
            {sessions.slice(0, 8).map((x) => (
              <li key={x.id}>
                <button type="button" onClick={() => onOpenSession(x.id)}>
                  <i className="dot" aria-hidden="true" />
                  <span className="t">{x.topic}</span>
                  <span className="s">Apprendimento · {new Date(x.updatedAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {notes.length > 0 && (
        <>
          <div className="divider" />
          <div className="psec">
            <h2>Note vive</h2>
            <ul className="sessions">
              {notes.slice(0, 8).map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => onOpenNota(n.id)}>
                    <i className={'dot nv-' + n.status} aria-hidden="true" />
                    <span className="t">{n.title}</span>
                    <span className="s">
                      {n.status === 'generating' ? 'in scrittura…' : n.status === 'error' ? 'da riprovare' : new Date(n.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
      <div className="divider" />
      <div className="psec scroll" style={{ flex: 1 }}>
        <h2>Note</h2>
        <NoteTree nodes={tree} onOpen={onOpenNote} />
      </div>
      <div className="pf">
        {open && settings && (
          <div className="settings-pop" role="dialog" aria-label="Impostazioni">
            <h3>Tema</h3>
            <div className="seg" role="group" aria-label="Tema">
              {THEMES.map(([id, label]) => (
                <button key={id} type="button" aria-pressed={settings.theme === id} onClick={() => onTheme(id)}>
                  {label}
                </button>
              ))}
            </div>
            <h3>Vault Obsidian</h3>
            <span className="path">{settings.vaultPath}</span>
            <button type="button" className="btn" onClick={onChooseVault}>
              Cambia cartella
            </button>
          </div>
        )}
        <div className="row">
          <button type="button" className="icon-btn" aria-label="Impostazioni" aria-expanded={open} onClick={() => setOpen(!open)}>
            <IconGear />
          </button>
          <span className="vp">{settings?.vaultPath.split('/').pop()}</span>
        </div>
      </div>
    </aside>
  )
}
