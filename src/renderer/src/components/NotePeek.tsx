import React, { useEffect, useRef, useState } from 'react'
import './note-peek.css'

export type NotePeekProps = {
  concept?: {
    id: string
    name: string
    statement?: string
    birth?: string
    sections?: Record<string, string>
  } | null
  notePath: string
  noteTitle?: string
  sectionTitle?: string
  chainIds?: string[]
  onClose: () => void
  onOpenNote: (path: string) => void
  triggerRef?: React.RefObject<HTMLElement | null>
}

export function NotePeek({
  concept,
  notePath,
  noteTitle,
  sectionTitle,
  chainIds,
  onClose,
  onOpenNote,
  triggerRef
}: NotePeekProps): React.JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const prevFocusRef = useRef<HTMLElement | null>(null)

  const [hasLiveNote, setHasLiveNote] = useState(false)
  const [excerpts, setExcerpts] = useState<{ heading: string; text: string }[]>([])

  useEffect(() => {
    prevFocusRef.current = (triggerRef?.current ?? document.activeElement) as HTMLElement | null
    closeBtnRef.current?.focus()
    return () => {
      prevFocusRef.current?.focus()
    }
  }, [triggerRef])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    const onMouseDown = (e: MouseEvent): void => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        if (triggerRef?.current && triggerRef.current.contains(e.target as Node)) {
          return
        }
        onClose()
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [onClose, triggerRef])

  useEffect(() => {
    let alive = true
    const checkLiveNotes = async (): Promise<void> => {
      try {
        if (typeof window !== 'undefined' && window.sinapsi?.notes?.list) {
          const list = await window.sinapsi.notes.list()
          if (!alive) return
          const exists = list.some((n) => n.sourcePath === notePath)
          setHasLiveNote(exists)
        }
      } catch {
        // ignore errors
      }
    }
    void checkLiveNotes()

    const loadChainSources = async (): Promise<void> => {
      if (!chainIds || chainIds.length === 0) return
      try {
        if (typeof window !== 'undefined' && window.sinapsi?.graph?.chainSource) {
          const sources = await Promise.all(
            chainIds.map((cid) => window.sinapsi.graph.chainSource(cid).catch(() => null))
          )
          if (!alive) return
          const allExcerpts: { heading: string; text: string }[] = []
          for (const s of sources) {
            if (s && Array.isArray(s.excerpts)) {
              for (const ex of s.excerpts) {
                if (ex.text) {
                  allExcerpts.push({ heading: ex.heading, text: ex.text })
                }
              }
            }
          }
          setExcerpts(allExcerpts)
        }
      } catch {
        // ignore errors
      }
    }
    void loadChainSources()

    return () => {
      alive = false
    }
  }, [notePath, chainIds])

  const displayName = concept?.name ?? noteTitle ?? 'Anteprima nota'
  const displayOrigin = noteTitle ?? concept?.birth ?? notePath
  const displaySection =
    sectionTitle ?? (concept?.birth ? concept?.sections?.[concept.birth] : undefined) ?? (concept?.sections ? Object.values(concept.sections)[0] : undefined)

  return (
    <aside
      ref={panelRef}
      className="note-peek"
      role="dialog"
      aria-modal="false"
      aria-labelledby="note-peek-title"
    >
      <header className="note-peek-header">
        <div className="note-peek-title-group">
          <p className="note-peek-eyebrow">Anteprima della nota</p>
          <h2 id="note-peek-title" className="note-peek-title">
            {displayName}
          </h2>
        </div>
        <button
          ref={closeBtnRef}
          type="button"
          className="note-peek-close"
          aria-label="Chiudi"
          onClick={onClose}
        >
          ✕
        </button>
      </header>

      <div className="note-peek-body">
        {concept?.statement && (
          <div className="note-peek-statement-box">
            <h3 className="note-peek-section-heading">Enunciato</h3>
            <p className="note-peek-statement">{concept.statement}</p>
          </div>
        )}

        <div className="note-peek-meta">
          <div className="note-peek-meta-row">
            <span className="note-peek-meta-label">Nota d'origine:</span>
            <span className="note-peek-meta-value">{displayOrigin}</span>
          </div>
          {displaySection && (
            <div className="note-peek-meta-row">
              <span className="note-peek-meta-label">Sezione:</span>
              <span className="note-peek-meta-value">{displaySection}</span>
            </div>
          )}
        </div>

        {excerpts.length > 0 && (
          <div className="note-peek-excerpts">
            <h3 className="note-peek-section-heading">Estratti dimostrazione</h3>
            {excerpts.map((ex, idx) => (
              <div key={idx} className="note-peek-excerpt-item">
                {ex.heading && <div className="note-peek-excerpt-heading">{ex.heading}</div>}
                <div className="note-peek-excerpt-text">{ex.text}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="note-peek-footer">
        <button
          type="button"
          className={hasLiveNote ? 'note-peek-btn-pri' : 'note-peek-btn-sec'}
          onClick={() => onOpenNote(notePath)}
        >
          {hasLiveNote ? 'Apri Nota Viva completa' : 'Apri la nota'}
        </button>
      </div>
    </aside>
  )
}
