import { useEffect, useState } from 'react'
import type { NoteMeta } from '../../../shared/api'
import { remoteMessage } from './NotaView'
import './nota.css'

/** An Obsidian note from the tree: its notes vive, and the way to write a new one. */
export function NotePicker({ path, onOpenNota, onBack }: { path: string; onOpenNota: (id: string) => void; onBack: () => void }): React.JSX.Element {
  const api = window.sinapsi
  const [title, setTitle] = useState(path.split('/').pop()?.replace(/\.md$/, '') ?? path)
  const [mine, setMine] = useState<NoteMeta[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [concepts, setConcepts] = useState<number | null>(null)

  // Opening a note is a moment to extract its concepts (skipped when unchanged since last time).
  useEffect(() => {
    if (!api.graph) return
    let alive = true
    const count = (): void => void api.graph.get().then((g) => alive && setConcepts(g.concepts.filter((c) => c.notes.includes(path)).length))
    count()
    void api.graph.extract(path, 'study').catch(() => undefined)
    const off = api.graph.onChange((e) => e.graph && alive && setConcepts(e.graph.concepts.filter((c) => c.notes.includes(path)).length))
    return () => {
      alive = false
      off()
    }
  }, [api, path])

  useEffect(() => {
    let alive = true
    void api.vault.index().then((idx) => {
      const n = 'notes' in idx ? idx.notes.find((x) => x.path === path) : undefined
      if (alive && n) setTitle(n.title)
    })
    const load = (): void => void api.notes.list().then((l) => alive && setMine(l.filter((m) => m.sourcePath === path)))
    load()
    const off = api.notes.onUpdate(load)
    return () => {
      alive = false
      off()
    }
  }, [api, path])

  const create = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      onOpenNota(await api.notes.create({ sourcePath: path }))
    } catch (e) {
      setError(remoteMessage(e))
      setBusy(false)
    }
  }

  return (
    <div className="nota">
      <nav className="island" aria-label="Controlli">
        <button type="button" className="back" onClick={onBack}>
          ← Home
        </button>
      </nav>
      <div className="state picker">
        <h1>{title}</h1>
        <p>{"Una nota viva è la tua nota Obsidian trasformata in una pagina da cui studiare: figure da toccare, quiz accanto ai paragrafi, passi da provare da solo. La tua nota resta com'è."}</p>
        <div className="nv-row" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn pri" disabled={busy} onClick={() => void create()}>
            Crea la nota viva
          </button>
          <button type="button" className="btn" onClick={() => void api.app.openExternal('obsidian://open?path=' + encodeURIComponent(path))}>
            Apri in Obsidian
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
        {concepts !== null && (
          <p className="nv-concepts">
            {concepts === 1 ? '1 concetto nel grafo' : `${concepts} concetti nel grafo`}
            <button type="button" className="nv-chip" onClick={() => void api.graph.extract(path).catch(() => undefined)}>
              Estrai di nuovo i concetti
            </button>
          </p>
        )}
        {mine && mine.length > 0 && (
          <ul className="nv-list">
            {mine.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  aria-label={`Apri la nota viva del ${new Date(m.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}`}
                  onClick={() => onOpenNota(m.id)}
                >
                  <i className={'dot ' + m.status} aria-hidden="true" />
                  <span>{m.title}</span>
                  <small>
                    {m.status === 'generating' ? 'in scrittura' : m.status === 'error' ? 'da riprovare' : new Date(m.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
