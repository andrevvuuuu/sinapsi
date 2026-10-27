import { useCallback, useEffect, useMemo, useState } from 'react'
import { NOTEBOOKLM_PREFIX, type ChatTurn, type Excerpt, type Notebook } from '../../../shared/notebook-types'
import { ChatPane } from './ChatPane'
import { SourceList } from './SourceList'
import { SourceViewer } from './SourceViewer'
import './notebook.css'

const clean = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

function LinkBox({ notebook }: { notebook: Notebook }): React.JSX.Element {
  const api = window.sinapsi
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(notebook.link ?? '')
  const [err, setErr] = useState<string | null>(null)
  const save = async (link: string | null): Promise<void> => {
    if (link !== null && !link.startsWith(NOTEBOOKLM_PREFIX)) return setErr(`Serve il link di un notebook, che inizia con ${NOTEBOOKLM_PREFIX}`)
    try {
      await api.notebook.update(notebook.id, { link })
      setErr(null)
      setOpen(false)
    } catch (e) {
      setErr(clean(e))
    }
  }
  return (
    <div className="nb-link">
      {notebook.link ? (
        <>
          <button type="button" className="pill nodrag" onClick={() => void api.app.openExternal(notebook.link!)}>
            Apri in NotebookLM <span aria-hidden="true">↗</span>
          </button>
          <button type="button" className="ghost nodrag" aria-label="Modifica il link a NotebookLM" onClick={() => setOpen((o) => !o)}>
            Modifica
          </button>
        </>
      ) : (
        <button type="button" className="pill nodrag" onClick={() => setOpen((o) => !o)}>
          Collega NotebookLM
        </button>
      )}
      {open && (
        <form
          className="nb-pop nodrag"
          onSubmit={(e) => {
            e.preventDefault()
            void save(value.trim() || null)
          }}
        >
          <label htmlFor="nb-link-in">Link del notebook su NotebookLM</label>
          <input id="nb-link-in" autoFocus placeholder={`${NOTEBOOKLM_PREFIX}notebook/…`} value={value} onChange={(e) => setValue(e.target.value)} />
          <p className="hint">
            Apri NotebookLM, entra nel notebook con lo stesso argomento, copia il link dalla barra degli indirizzi e incollalo qui.{' '}
            <button type="button" className="linkish" onClick={() => void api.app.openExternal(NOTEBOOKLM_PREFIX)}>
              Apri NotebookLM
            </button>
          </p>
          {err && (
            <p className="nb-alert" role="alert">
              {err}
            </p>
          )}
          <div className="row">
            {notebook.link && (
              <button type="button" className="ghost" onClick={() => void save(null)}>
                Scollega
              </button>
            )}
            <button type="submit" className="pri">
              Salva link
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

export function NotebookView({ id, onBack }: { id: string; onBack: () => void }): React.JSX.Element {
  const api = window.sinapsi
  const [nb, setNb] = useState<Notebook | null | undefined>(undefined)
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [subjects, setSubjects] = useState<string[]>([])
  const [notes, setNotes] = useState<{ path: string; title: string }[]>([])
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState(false)
  const [viewer, setViewer] = useState<{ sourceId: string; excerpt: Excerpt | null } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [name, setName] = useState('')

  const load = useCallback(async () => {
    const found = (await api.notebook.list()).find((n) => n.id === id) ?? null
    setNb(found)
    return found
  }, [api, id])
  const loadChat = useCallback(async () => setTurns(await api.notebook.chat(id)), [api, id])

  useEffect(() => {
    void Promise.resolve()
      .then(load)
      .then((n) => n && setName(n.name))
    void Promise.resolve().then(loadChat)
    void api.vault.index().then((idx) => {
      if ('error' in idx) return
      setSubjects(idx.subjects.map((s) => s.id))
      setNotes(idx.notes.filter((n) => n.available).map((n) => ({ path: n.path, title: n.title })))
    })
    return api.notebook.onUpdate((e) => {
      void load()
      if (!e.notebookId || e.notebookId === id) void loadChat()
    })
  }, [api, id, load, loadChat])

  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(null), 6000)
    return () => clearTimeout(t)
  }, [message])

  const ready = useMemo(() => nb?.sources.filter((s) => s.status === 'ready') ?? [], [nb])
  const selected = ready.filter((s) => !excluded.has(s.id))

  const ask = async (q: string, ids = selected.map((s) => s.id)): Promise<void> => {
    setPending(true)
    try {
      await api.notebook.ask(id, q, ids)
    } catch (e) {
      setMessage(clean(e))
    } finally {
      setPending(false)
      void loadChat()
    }
  }

  if (nb === undefined) return <div className="nb" />
  if (nb === null)
    return (
      <div className="nb">
        <p className="nb-empty">Notebook non trovato.</p>
        <button type="button" className="pill" onClick={onBack}>
          ← Home
        </button>
      </div>
    )
  const viewed = viewer && nb.sources.find((s) => s.id === viewer.sourceId)

  return (
    <div className={'nb' + (viewed ? ' with-viewer' : '')}>
      <header className="nb-top drag">
        <button type="button" className="pill nodrag" onClick={onBack}>
          ← Home
        </button>
        <input
          className="nb-name nodrag"
          aria-label="Nome del notebook"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const n = name.trim()
            if (n && n !== nb.name) void api.notebook.update(id, { name: n }).catch((e) => setMessage(clean(e)))
            else setName(nb.name)
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <label className="nb-subject nodrag">
          <span className="lab">Materia</span>
          <select aria-label="Materia" value={nb.subject ?? ''} onChange={(e) => void api.notebook.update(id, { subject: e.target.value || null }).catch((er) => setMessage(clean(er)))}>
            <option value="">nessuna</option>
            {subjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <LinkBox key={nb.link ?? ''} notebook={nb} />
      </header>
      {message && (
        <p className="nb-alert floating" role="alert">
          {message}
        </p>
      )}
      <div className="nb-body">
        <SourceList
          notebook={nb}
          excluded={excluded}
          notes={notes}
          onMessage={setMessage}
          onToggle={(sid) =>
            setExcluded((x) => {
              const next = new Set(x)
              if (next.has(sid)) next.delete(sid)
              else next.add(sid)
              return next
            })
          }
          onView={(sid) => setViewer({ sourceId: sid, excerpt: null })}
        />
        <ChatPane
          turns={turns}
          pending={pending}
          selected={selected.length}
          ready={ready.length}
          onAsk={(q) => void ask(q)}
          onRetry={(i) => {
            const prev = turns.slice(0, i).reverse().find((t) => t.role === 'user')
            if (prev && prev.role === 'user') void ask(prev.text, prev.sourceIds)
          }}
          onCite={(e) => setViewer({ sourceId: e.sourceId, excerpt: e })}
        />
        {viewed && <SourceViewer key={viewed.id} source={viewed} excerpt={viewer!.excerpt} onClose={() => setViewer(null)} />}
      </div>
    </div>
  )
}
