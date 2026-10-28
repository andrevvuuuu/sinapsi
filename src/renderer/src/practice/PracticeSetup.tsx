import { useEffect, useRef, useState } from 'react'
import { matchConcepts } from '../../../shared/practice-match'
import type { Catalog } from '../../../shared/practice-types'
import { MaterialDialog } from './MaterialDialog'
import { clampMinutes, summary } from './summary'
import './practice.css'

const clean = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

export function PracticeSetup({
  initialText = '',
  initial,
  onBack,
  onStarted
}: {
  initialText?: string
  /** From a suggestion chip: these concepts, maybe as an exam. */
  initial?: { conceptIds: string[]; exam?: boolean }
  onBack: () => void
  onStarted: (id: string) => void
}): React.JSX.Element {
  const api = window.sinapsi.practice
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [concepts, setConcepts] = useState<Set<string>>(new Set())
  const [sources, setSources] = useState<Set<string>>(new Set())
  const [free, setFree] = useState('')
  const [toast, setToast] = useState('')
  const [dialog, setDialog] = useState(false)
  const [mode, setMode] = useState<'train' | 'exam'>(initial?.exam ? 'exam' : 'train')
  const [preset, setPreset] = useState<'30' | '60' | '90' | 'custom'>('60')
  const [custom, setCustom] = useState(45)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const go = useRef<HTMLButtonElement>(null)
  const minutes = preset === 'custom' ? custom : Number(preset)

  const applyText = (cat: Catalog, raw: string, picked: Set<string>): Set<string> => {
    const hits = matchConcepts(cat, raw)
    const next = new Set(picked)
    hits.forEach((id) => next.add(id))
    setToast(
      hits.length
        ? `${hits.length === 1 ? 'Trovato 1 concetto' : `Trovati ${hits.length} concetti`} per «${raw}»: ${hits.length === 1 ? 'aggiunto' : 'aggiunti'}. Toglili con la ×.`
        : `Nessun concetto per «${raw}» nelle tue note: lo userò come argomento libero.`
    )
    return next
  }

  useEffect(() => {
    let live = true
    void api.catalog().then((cat) => {
      if (!live) return
      setCatalog(cat)
      let picked = new Set(initial ? initial.conceptIds : cat.suggested.slice(0, 2).map((x) => x.id))
      const text = initialText.trim()
      if (text) {
        picked = applyText(cat, text, picked)
        if (!matchConcepts(cat, text).length) setFree(text)
      }
      setConcepts(picked)
      go.current?.focus()
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api])

  const names = new Map(catalog?.subjects.flatMap((s) => s.notes.flatMap((n) => n.concepts.map((c) => [c.id, c.name] as const))) ?? [])
  const sourceTitle = new Map(catalog?.sources.map((s) => [s.id, s] as const) ?? [])
  const has = concepts.size + sources.size > 0 || free.trim().length > 0
  const start = async (): Promise<void> => {
    if (!has || busy) return
    setBusy(true)
    setError(null)
    const material = { conceptIds: [...concepts], sourceIds: [...sources], free: free.trim() }
    try {
      onStarted(mode === 'exam' ? await api.examStart(material, minutes) : await api.create(material))
    } catch (e) {
      setError(clean(e))
      setBusy(false)
    }
  }

  return (
    <div className="pr">
      <header className="pr-top drag">
        <button type="button" className="pill nodrag back-btn" onClick={onBack}>
          ← Home
        </button>
        <h1>Pratica</h1>
      </header>
      <div className="pr-setup">
        <p className="pr-lead">
          {initial
            ? 'Ho preparato il materiale del consiglio che hai scelto: puoi aggiungere o togliere concetti prima di iniziare.'
            : initialText.trim()
              ? 'Ho scelto il materiale a partire da quello che hai scritto: puoi aggiungere o togliere concetti prima di iniziare.'
              : 'Su cosa ti alleni oggi? Ho già scelto i due concetti più urgenti; gli altri suggeriti hanno accanto il motivo.'}
        </p>
        {!catalog ? (
          <p className="mt-hint">Carico il materiale…</p>
        ) : (
          <div className="shell">
            <div className="inner">
              <div className="mt-head">
                <span className="lab">Materiale</span>
                <span className="mt-sum" aria-live="polite">
                  {summary(concepts.size, sources.size, !!free.trim())}
                </span>
                <span className="sp" />
                <button type="button" className="mt-open" onClick={() => setDialog(true)}>
                  Scegli…
                </button>
              </div>
              <div className="mt-group" role="group" aria-label="Scelti">
                <span className="lab">Scelti</span>
                <div className="mt-chips">
                  {[...concepts].map((id) => (
                    <span key={id} className="mt-chip on">
                      {names.get(id) ?? id}
                      <button type="button" aria-label={`Togli ${names.get(id) ?? id}`} onClick={() => setConcepts((p) => new Set([...p].filter((x) => x !== id)))}>
                        ×
                      </button>
                    </span>
                  ))}
                  {[...sources].map((id) => (
                    <span key={id} className="mt-chip on">
                      <span className="mt-tag">{sourceTitle.get(id)?.kind}</span>
                      {sourceTitle.get(id)?.title}
                      <button type="button" aria-label={`Togli ${sourceTitle.get(id)?.title}`} onClick={() => setSources((p) => new Set([...p].filter((x) => x !== id)))}>
                        ×
                      </button>
                    </span>
                  ))}
                  {concepts.size + sources.size === 0 && <span className="mt-hint">Niente ancora: tocca un suggerito o scrivi un argomento.</span>}
                </div>
              </div>
              <div className="mt-group" role="group" aria-label="Suggeriti per oggi">
                <span className="lab">Suggeriti per oggi</span>
                <div className="mt-chips">
                  {catalog.suggested
                    .filter((x) => !concepts.has(x.id))
                    .map((x) => (
                      <button key={x.id} type="button" className="mt-chip" onClick={() => setConcepts((p) => new Set([...p, x.id]))}>
                        {x.name}
                        <small>{x.why}</small>
                      </button>
                    ))}
                  {catalog.suggested.length > 0 && catalog.suggested.every((x) => concepts.has(x.id)) && <span className="mt-hint">Hai già preso tutti i suggeriti.</span>}
                  {catalog.suggested.length === 0 && <span className="mt-hint">Nessun suggerimento: il grafo è ancora vuoto o tutto è fresco.</span>}
                </div>
              </div>
              <div className="mt-toast" role="status">
                {toast}
              </div>
              <div className="modes" role="radiogroup" aria-label="Tipo di sessione">
                {(
                  [
                    ['train', 'Allenamento', 'Indizi quando servono, correzione subito'],
                    ['exam', "Simulazione d'esame", 'A tempo, nessun aiuto, voto alla fine']
                  ] as const
                ).map(([m, title, sub]) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={mode === m}
                    className={'mode' + (m === 'exam' ? ' exam' : '')}
                    onClick={() => setMode(m)}
                    onKeyDown={(e) => {
                      if (e.key.startsWith('Arrow')) {
                        e.preventDefault()
                        setMode(mode === 'train' ? 'exam' : 'train')
                      }
                    }}
                  >
                    <span>
                      <b>{title}</b>
                      <small>{sub}</small>
                    </span>
                    <span className="tick" aria-hidden="true" />
                  </button>
                ))}
              </div>
              {mode === 'exam' && (
                <div className="examrow">
                  <span className="lab">Durata</span>
                  <div className="dur" role="group" aria-label="Durata">
                    {(['30', '60', '90'] as const).map((d) => (
                      <button key={d} type="button" aria-pressed={preset === d} onClick={() => setPreset(d)}>
                        {d} min
                      </button>
                    ))}
                    <button type="button" aria-pressed={preset === 'custom'} onClick={() => setPreset('custom')}>
                      Altro…
                    </button>
                  </div>
                  {preset === 'custom' && (
                    <div className="custom">
                      <button type="button" aria-label="Meno 5 minuti" onClick={() => setCustom((m) => clampMinutes(m - 5))}>
                        −
                      </button>
                      <input type="number" inputMode="numeric" min={5} max={300} step={5} aria-label="Durata in minuti" value={custom} onChange={(e) => setCustom(Number(e.target.value))} onBlur={() => setCustom((m) => clampMinutes(m))} />
                      <span>min</span>
                      <button type="button" aria-label="Più 5 minuti" onClick={() => setCustom((m) => clampMinutes(m + 5))}>
                        +
                      </button>
                    </div>
                  )}
                  <div className="rules">
                    <span>✕ niente indizi</span>
                    <span>✕ niente correzione durante</span>
                  </div>
                </div>
              )}
              {error && (
                <p className="pr-alert" role="alert">
                  {error}
                </p>
              )}
              <div className="startrow">
                <textarea
                  rows={free.includes('\n') ? 4 : 1}
                  aria-label="Argomento libero"
                  placeholder="Scrivi un argomento (es. «autovalori») o incolla un esercizio d'esame"
                  value={free}
                  onChange={(e) => {
                    setFree(e.target.value)
                    setToast('')
                  }}
                  onKeyDown={(e) => {
                    // Enter looks for concepts; Shift+Enter keeps the lines of a pasted problem.
                    if (e.key !== 'Enter' || e.shiftKey || !free.trim() || !catalog) return
                    e.preventDefault()
                    const raw = free.trim()
                    const hits = matchConcepts(catalog, raw)
                    setConcepts((p) => applyText(catalog, raw, p))
                    if (hits.length) setFree('')
                  }}
                />
                <button ref={go} type="button" className={'pri' + (mode === 'exam' ? ' exam' : '')} disabled={!has || busy} onClick={() => void start()}>
                  {mode === 'exam' ? `Inizia simulazione · ${minutes} min` : 'Inizia allenamento'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {dialog && catalog && (
        <MaterialDialog
          catalog={catalog}
          concepts={concepts}
          sources={sources}
          onClose={() => setDialog(false)}
          onConfirm={(c, s) => {
            setConcepts(c)
            setSources(s)
            setDialog(false)
          }}
        />
      )}
    </div>
  )
}
