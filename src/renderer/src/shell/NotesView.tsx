import { useEffect, useRef, useState } from 'react'
import type { NoteMeta } from '../../../shared/api'

function folderOf(sourcePath?: string): string {
  if (!sourcePath) return ''
  const parts = sourcePath.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts.length > 1 ? parts[parts.length - 2] : ''
}

export function NotesView({
  onOpenNota
}: {
  onOpenNota: (id: string) => void
}): React.JSX.Element {
  const [notes, setNotes] = useState<NoteMeta[] | null>(null)
  const [retrying, setRetrying] = useState<Record<string, boolean>>({})
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    let alive = true
    const load = (): void => {
      void window.sinapsi.notes
        .list()
        .then((l) => {
          if (alive) setNotes(l)
        })
        .catch(() => undefined)
    }
    load()
    const off = window.sinapsi.notes.onUpdate(load)
    return () => {
      alive = false
      aliveRef.current = false
      off()
    }
  }, [])

  const handleRetry = async (e: React.MouseEvent, id: string): Promise<void> => {
    e.stopPropagation()
    setRetrying((prev) => ({ ...prev, [id]: true }))
    try {
      await window.sinapsi.notes.retry(id)
    } catch {
      // broadcast onUpdate will refresh
    } finally {
      if (aliveRef.current) {
        setRetrying((prev) => ({ ...prev, [id]: false }))
      }
    }
  }

  if (!notes || notes.length === 0) {
    return (
      <div className="sh-notes-empty" role="region" aria-label="Note">
        <p>Scegli una nota dall&apos;elenco</p>
        <p className="sh-notes-empty-sub">Le note vive si creano aprendo una nota dall&apos;albero.</p>
      </div>
    )
  }

  const sorted = [...notes].sort(
    (a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)
  )

  return (
    <div className="sh-notes-wrap" role="region" aria-label="Note">
      <ul className="sh-notes-list">
        {sorted.map((m) => {
          const folder = folderOf(m.sourcePath)
          const title = m.title || m.sourceTitle || 'Nota senza titolo'
          if (m.status === 'error') {
            return (
              <li key={m.id} className="sh-notes-item">
                <div className="sh-notes-row sh-notes-row-error">
                  <div className="sh-notes-info">
                    <span className="sh-notes-title">{title}</span>
                    {folder && <span className="sh-notes-folder">{folder}</span>}
                    {m.error && (
                      <p className="sh-notes-error" title={m.error}>
                        {m.error}
                      </p>
                    )}
                  </div>
                  <div className="sh-notes-side">
                    <span className="sh-notes-state" aria-label="errore">
                      <i className="sh-notes-dot sh-notes-dot-error" aria-hidden="true" />
                      <span>errore</span>
                    </span>
                    <button
                      type="button"
                      className="sh-notes-retry"
                      disabled={Boolean(retrying[m.id])}
                      onClick={(e) => void handleRetry(e, m.id)}
                    >
                      Riprova
                    </button>
                  </div>
                </div>
              </li>
            )
          }
          const isGenerating = m.status === 'generating'
          return (
            <li key={m.id} className="sh-notes-item">
              <button
                type="button"
                className="sh-notes-row"
                onClick={() => onOpenNota(m.id)}
              >
                <span className="sh-notes-info">
                  <span className="sh-notes-title">{title}</span>
                  {folder && <span className="sh-notes-folder">{folder}</span>}
                </span>
                <span className="sh-notes-side">
                  {isGenerating ? (
                    <span
                      className="sh-notes-state"
                      role="status"
                      aria-label="in scrittura"
                    >
                      <i className="sh-notes-dot sh-notes-dot-generating" aria-hidden="true" />
                      <span>in scrittura</span>
                    </span>
                  ) : (
                    <span className="sh-notes-state" aria-label="pronta">
                      <i className="sh-notes-dot sh-notes-dot-ready" aria-hidden="true" />
                      <span>pronta</span>
                    </span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
