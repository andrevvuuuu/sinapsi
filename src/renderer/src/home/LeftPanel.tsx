import { useState } from 'react'
import type { Settings } from '../../../shared/settings-schema'
import type { TreeNode } from './build-tree'
import { IconGear, IconPanel } from './icons'
import { NoteTree } from './NoteTree'

const FILTERS = ['Pratica', 'Apprendimento', 'Entrambe'] as const
const THEMES: [Settings['theme'], string][] = [['lavagna', 'Lavagna'], ['trattato', 'Trattato'], ['system', 'Sistema']]

type Props = {
  tree: TreeNode[]
  settings: Settings | null
  onClose: () => void
  onOpenNote: (path: string) => void
  onTheme: (t: Settings['theme']) => void
  onChooseVault: () => void
}

export function LeftPanel({ tree, settings, onClose, onOpenNote, onTheme, onChooseVault }: Props): React.JSX.Element {
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
        <p className="empty">Nessuna sessione ancora.</p>
      </div>
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
