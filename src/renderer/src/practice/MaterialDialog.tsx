import { useEffect, useMemo, useRef, useState } from 'react'
import { GlassSurface } from '@glass-sdk/liquid-glass'
import { GlassOverlay } from '../components/glass'
import type { Catalog, CatalogConcept } from '../../../shared/practice-types'
import { DICTATION_SHORT, useDictation } from '../components/dictation'
import { DictationError, MicButton } from '../components/MicButton'
import { summary } from './summary'
import { focusWhenShown } from '../components/glass-theme'

type Filter = 'weak' | 'due' | 'never' | null
const norm = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const clean = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    ''
  )

function MemBar({ c }: { c: CatalogConcept }): React.JSX.Element {
  const r = c.R ?? 0
  const color =
    c.R === null ? 'var(--hair)' : r < 0.35 ? 'var(--bad)' : r < 0.6 ? 'var(--warn)' : 'var(--good)'
  return (
    <span className="mt-mem">
      {c.due && <span className="mt-tag due">da ripassare</span>}
      {!c.practiced && <span className="mt-tag">mai praticato</span>}
      <span className="bar" aria-hidden="true">
        <b style={{ width: `${r * 100}%`, background: color }} />
      </span>
      {c.R === null ? 'mai visto' : `${Math.round(r * 100)}%`}
    </span>
  )
}

/** Group checkbox: checked when all its visible concepts are chosen, mixed when some are. */
function GroupBox({
  ids,
  chosen,
  label,
  onSet
}: {
  ids: string[]
  chosen: Set<string>
  label: string
  onSet: (ids: string[], on: boolean) => void
}): React.JSX.Element {
  const ref = useRef<HTMLInputElement>(null)
  const n = ids.filter((id) => chosen.has(id)).length
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = n > 0 && n < ids.length
  }, [n, ids.length])
  // The box is 18 px; the span around it is the 28 px target. A click on the span selects instead of folding the group.
  return (
    <span
      className="mt-hit"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        ref.current?.click()
      }}
    >
      <input
        ref={ref}
        type="checkbox"
        className="mt-cb"
        aria-label={`Seleziona tutto ${label}`}
        checked={n > 0 && n === ids.length}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onSet(ids, e.target.checked)}
      />
    </span>
  )
}

export function MaterialDialog({
  catalog,
  concepts,
  sources,
  onConfirm,
  onClose
}: {
  catalog: Catalog
  concepts: Set<string>
  sources: Set<string>
  onConfirm: (concepts: Set<string>, sources: Set<string>) => void
  onClose: () => void
}): React.JSX.Element {
  const api = window.sinapsi
  const [fresh, setFresh] = useState<Catalog | null>(null)
  const liveCatalog = fresh ?? catalog
  const [c, setC] = useState(new Set(concepts))
  const [s, setS] = useState(new Set(sources))
  const [tab, setTab] = useState<'c' | 'f'>('c')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>(null)
  const [subject, setSubject] = useState('')
  const activeSubject = subject || liveCatalog.subjects[0]?.name || ''
  const [actionError, setActionError] = useState<string | null>(null)
  const [addingFiles, setAddingFiles] = useState(false)
  const [ytOpen, setYtOpen] = useState(false)
  const [ytUrl, setYtUrl] = useState('')
  const [addingYt, setAddingYt] = useState(false)

  const search = useRef<HTMLInputElement>(null)
  const searchMic = useDictation({
    target: search,
    value: q,
    onChange: setQ,
    maxSeconds: DICTATION_SHORT
  })

  useEffect(() => {
    if (!api.notebook?.onUpdate || !api.practice?.catalog) return
    const reloadCatalog = (): void => {
      void api.practice.catalog().then(setFresh, () => undefined)
    }
    return api.notebook.onUpdate(reloadCatalog)
  }, [api])

  const handleAddFiles = async (): Promise<void> => {
    const sub = activeSubject
    if (!sub) {
      setActionError('Seleziona una materia prima di aggiungere file.')
      return
    }
    setActionError(null)
    setAddingFiles(true)
    try {
      const bucketId = await api.notebook.bucketFor(sub)
      const res = await api.notebook.chooseFiles(bucketId)
      if (res.rejected.length > 0) {
        setActionError(`Non posso importare: ${res.rejected.join(', ')}`)
      }
      if (api.practice?.catalog) {
        const updated = await api.practice.catalog()
        setFresh(updated)
      }
    } catch (err) {
      setActionError(clean(err))
    } finally {
      setAddingFiles(false)
    }
  }

  const handleAddYoutube = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    const url = ytUrl.trim()
    if (!url || addingYt) return
    const sub = activeSubject
    if (!sub) {
      setActionError('Seleziona una materia prima di aggiungere un video.')
      return
    }
    setActionError(null)
    setAddingYt(true)
    try {
      const bucketId = await api.notebook.bucketFor(sub)
      await api.notebook.addYoutube(bucketId, url)
      setYtUrl('')
      setYtOpen(false)
      if (api.practice?.catalog) {
        const updated = await api.practice.catalog()
        setFresh(updated)
      }
    } catch (err) {
      setActionError(clean(err))
    } finally {
      setAddingYt(false)
    }
  }

  // The dialog's glass shell shows a frame after it mounts: the field takes the focus once it can.
  useEffect(() => focusWhenShown(search.current), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const pass = (x: CatalogConcept, note: string): boolean =>
    (!q || norm(x.name).includes(norm(q)) || norm(note).includes(norm(q))) &&
    (filter === null ||
      (filter === 'weak' && x.R !== null && x.R < 0.45) ||
      (filter === 'due' && x.due) ||
      (filter === 'never' && !x.practiced))
  const tree = useMemo(
    () =>
      liveCatalog.subjects
        .map((sub) => ({
          ...sub,
          notes: sub.notes
            .map((n) => ({ ...n, concepts: n.concepts.filter((x) => pass(x, n.title)) }))
            .filter((n) => n.concepts.length)
        }))
        .filter((sub) => sub.notes.length),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liveCatalog, q, filter]
  )
  const all = liveCatalog.subjects.flatMap((x) => x.notes.flatMap((n) => n.concepts))
  const toggle = (set: Set<string>, id: string, on: boolean): Set<string> => {
    const next = new Set(set)
    if (on) next.add(id)
    else next.delete(id)
    return next
  }
  const setMany = (ids: string[], on: boolean): void =>
    setC((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)))
      return next
    })
  const open = !!(q || filter)

  return (
    <GlassOverlay className="pr-overlay" onClose={onClose}>
      <GlassSurface
        radius={24}
        className="mt-dlg glass-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mt-dt"
      >
        <div className="mt-core dlg-core">
          <div className="mt-dh">
            <h2 id="mt-dt">Scegli il materiale</h2>
            <div className="mt-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'c'}
                onClick={() => setTab('c')}
              >
                Concetti
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'f'}
                onClick={() => setTab('f')}
              >
                Materiale del corso
              </button>
            </div>
            <span className="sp" />
            <button type="button" className="mt-x" aria-label="Chiudi" onClick={onClose}>
              ×
            </button>
          </div>
          {tab === 'c' ? (
            <>
              <div className="mt-tools">
                <label className="mt-search">
                  <span className="mic-field mic-fill">
                    <input
                      ref={search}
                      readOnly={searchMic.state !== 'idle'}
                      placeholder="Cerca tra i concetti…"
                      aria-label="Cerca"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                    />
                    <MicButton dictation={searchMic} size="sm" />
                  </span>
                </label>
                <DictationError dictation={searchMic} />
                <div className="mt-filters" role="group" aria-label="Filtri">
                  {(
                    [
                      ['weak', 'Più deboli'],
                      ['due', 'In scadenza'],
                      ['never', 'Mai praticati']
                    ] as const
                  ).map(([f, label]) => (
                    <button
                      key={f}
                      type="button"
                      aria-pressed={filter === f}
                      onClick={() => setFilter((x) => (x === f ? null : f))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-cols">
                <div className="mt-tree">
                  {tree.length === 0 && (
                    <p className="mt-hint" style={{ padding: 16 }}>
                      {all.length
                        ? 'Nessun concetto corrisponde.'
                        : 'Il grafo è ancora vuoto: apri o studia una nota per estrarne i concetti, oppure scegli una fonte o scrivi un argomento.'}
                    </p>
                  )}
                  {tree.map((sub, i) => (
                    <details key={sub.name} open={open || i === 0}>
                      <summary>
                        <GroupBox
                          ids={sub.notes.flatMap((n) => n.concepts.map((x) => x.id))}
                          chosen={c}
                          label={sub.name}
                          onSet={setMany}
                        />
                        {sub.name}
                        <span className="cnt">
                          {sub.notes.reduce((a, n) => a + n.concepts.length, 0)}
                        </span>
                      </summary>
                      <div className="kids">
                        {sub.notes.map((n) => (
                          <details key={n.path} open={open || i === 0}>
                            <summary>
                              <GroupBox
                                ids={n.concepts.map((x) => x.id)}
                                chosen={c}
                                label={n.title}
                                onSet={setMany}
                              />
                              {n.title}
                              <span className="cnt">{n.concepts.length}</span>
                            </summary>
                            <div className="kids">
                              {n.concepts.map((x) => (
                                <label key={x.id} className="mt-row">
                                  <input
                                    type="checkbox"
                                    className="mt-cb"
                                    aria-label={x.name}
                                    checked={c.has(x.id)}
                                    onChange={(e) =>
                                      setC((prev) => toggle(prev, x.id, e.target.checked))
                                    }
                                  />
                                  {x.name}
                                  <MemBar c={x} />
                                </label>
                              ))}
                            </div>
                          </details>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
                <aside className="mt-sel">
                  <span className="lab">Selezionati</span>
                  <ul>
                    {c.size + s.size === 0 && <li className="none">Niente di selezionato.</li>}
                    {all
                      .filter((x) => c.has(x.id))
                      .map((x) => (
                        <li key={x.id}>
                          <span>{x.name}</span>
                          <button
                            type="button"
                            aria-label={`Togli ${x.name}`}
                            onClick={() => setC((prev) => toggle(prev, x.id, false))}
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    {liveCatalog.sources
                      .filter((x) => s.has(x.id))
                      .map((x) => (
                        <li key={x.id}>
                          <span className="mt-tag">{x.kind}</span>
                          <span>{x.title}</span>
                        </li>
                      ))}
                  </ul>
                </aside>
              </div>
            </>
          ) : (
            <div className="mt-files">
              <p className="lab">
                Materiale del corso · il tutor usa gli esercizi così come sono oppure ne crea di
                simili
              </p>
              <div className="mt-actions">
                <select
                  className="mt-subject-select"
                  value={activeSubject}
                  onChange={(e) => {
                    setSubject(e.target.value)
                    setActionError(null)
                  }}
                  aria-label="Materia"
                  disabled={liveCatalog.subjects.length === 0}
                >
                  {liveCatalog.subjects.map((sub) => (
                    <option key={sub.name} value={sub.name}>
                      {sub.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="mt-btn-act"
                  onClick={() => void handleAddFiles()}
                  disabled={addingFiles || liveCatalog.subjects.length === 0}
                >
                  {addingFiles ? 'Aggiunta…' : 'Aggiungi file…'}
                </button>
                {!ytOpen ? (
                  <button
                    type="button"
                    className="mt-btn-act"
                    onClick={() => {
                      setYtOpen(true)
                      setActionError(null)
                    }}
                    disabled={liveCatalog.subjects.length === 0}
                  >
                    Link YouTube…
                  </button>
                ) : (
                  <form className="mt-yt-form" onSubmit={(e) => void handleAddYoutube(e)}>
                    <input
                      type="url"
                      aria-label="URL video YouTube"
                      placeholder="https://www.youtube.com/watch?v=..."
                      value={ytUrl}
                      onChange={(e) => setYtUrl(e.target.value)}
                      autoFocus
                    />
                    <button type="submit" disabled={!ytUrl.trim() || addingYt}>
                      {addingYt ? 'Aggiunta…' : 'Aggiungi'}
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        setYtOpen(false)
                        setYtUrl('')
                        setActionError(null)
                      }}
                    >
                      Annulla
                    </button>
                  </form>
                )}
              </div>
              {actionError && (
                <p className="mt-action-alert" role="alert">
                  {actionError}
                </p>
              )}
              {liveCatalog.sources.length === 0 && (
                <p className="mt-hint">
                  Nessun materiale: aggiungi PDF, slide o registrazioni del corso.
                </p>
              )}
              {liveCatalog.sources.map((x) => {
                const materia = x.notebook
                return (
                  <label key={x.id} className="mt-file">
                    <input
                      type="checkbox"
                      className="mt-cb"
                      aria-label={`${x.title} · ${x.notebook}`}
                      checked={s.has(x.id)}
                      onChange={(e) => setS((prev) => toggle(prev, x.id, e.target.checked))}
                    />
                    <span className="mt-tag">{x.kind}</span>
                    <span>
                      <b>{x.title}</b>
                      <br />
                      <span className="mt-sub">{materia}</span>
                    </span>
                    <span className="pp">{x.info}</span>
                  </label>
                )
              })}
            </div>
          )}
          <div className="mt-df">
            <span className="mt-sum">{summary(c.size, s.size)}</span>
            <span className="sp" />
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setC(new Set())
                setS(new Set())
              }}
            >
              Svuota
            </button>
            <button type="button" className="pri" onClick={() => onConfirm(c, s)}>
              Conferma
            </button>
          </div>
        </div>
      </GlassSurface>
    </GlassOverlay>
  )
}
