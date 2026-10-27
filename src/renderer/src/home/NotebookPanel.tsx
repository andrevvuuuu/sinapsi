import { useEffect, useState } from 'react'
import type { Notebook } from '../../../shared/notebook-types'
import { IconPanel } from './icons'

export function NotebookPanel({ onClose, onOpen }: { onClose: () => void; onOpen: (id: string) => void }): React.JSX.Element {
  const api = window.sinapsi
  const [list, setList] = useState<Notebook[]>([])
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  useEffect(() => {
    if (!api.notebook) return
    const load = (): void => void api.notebook.list().then(setList, () => undefined)
    load()
    return api.notebook.onUpdate(load)
  }, [api])

  return (
    <aside className="right" aria-label="Notebook">
      <div className="ph drag">
        <button type="button" className="icon-btn nodrag" aria-label="Chiudi il pannello Notebook" onClick={onClose}>
          <IconPanel />
        </button>
        <button type="button" className="btn-imp on nodrag" aria-expanded={creating} onClick={() => setCreating((c) => !c)}>
          <span aria-hidden="true">+</span> Nuovo notebook
        </button>
      </div>
      <div className="rt">
        <h1>Notebook</h1>
        <p>Le tue fonti (PDF, slide, registrazioni, video) e una chat che risponde solo da quelle.</p>
      </div>
      {creating && (
        <form
          className="nb-new"
          onSubmit={(e) => {
            e.preventDefault()
            const n = name.trim()
            if (!n) return
            void api.notebook.create(n).then((id) => {
              setName('')
              setCreating(false)
              onOpen(id)
            })
          }}
        >
          <input autoFocus aria-label="Nome del notebook" placeholder="Per esempio: Analisi 1" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="btn pri">
            Crea
          </button>
        </form>
      )}
      {list.length === 0 ? (
        <p className="empty" style={{ padding: '4px 18px' }}>
          Nessun notebook ancora.
        </p>
      ) : (
        <ul className="sessions scroll" style={{ padding: '0 12px' }}>
          {list.map((n) => {
            const working = n.sources.some((s) => s.status === 'queued' || s.status === 'processing')
            return (
              <li key={n.id}>
                <button type="button" onClick={() => onOpen(n.id)}>
                  <span className={'dot' + (working ? '' : ' nv-ready')} />
                  <span className="t">{n.name}</span>
                  <span className="s">
                    {n.sources.length === 1 ? '1 fonte' : `${n.sources.length} fonti`}
                    {n.subject ? ` · ${n.subject}` : ''}
                    {working ? ' · in lavorazione' : ''}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}
