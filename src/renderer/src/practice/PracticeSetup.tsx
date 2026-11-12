import { useEffect, useRef, useState } from 'react'
import { matchConcepts } from '../../../shared/practice-match'
import { PRACTICE_MAX_CONCEPTS, type Catalog } from '../../../shared/practice-types'
import { useDictation } from '../components/dictation'
import { DictationError, MicButton } from '../components/MicButton'
import { GlassContent, GlassSurface } from '@glass-sdk/liquid-glass'
import { ScrollEdges, Seg, ViewScene } from '../components/glass'
import { MaterialDialog } from './MaterialDialog'
import { clampMinutes, summary } from './summary'
import './practice.css'

const clean = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    ''
  )

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
  const [paper, setPaper] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const go = useRef<HTMLButtonElement>(null)
  // The setup under the bar, the scene's live content.
  const page = useRef<HTMLDivElement>(null)
  const freeField = useRef<HTMLTextAreaElement>(null)
  const dictation = useDictation({ target: freeField, value: free, onChange: setFree })
  const dictating = dictation.state !== 'idle'
  const minutes = preset === 'custom' ? custom : Number(preset)
  const changeMode = (next: 'train' | 'exam'): void => {
    if (next === 'train' && concepts.size > PRACTICE_MAX_CONCEPTS) {
      setConcepts(new Set([...concepts].slice(0, PRACTICE_MAX_CONCEPTS)))
      setToast('In un allenamento puoi scegliere al massimo 4 concetti.')
    }
    setMode(next)
  }

  const applyText = (cat: Catalog, raw: string, picked: Set<string>): Set<string> => {
    const hits = matchConcepts(cat, raw)
    const next = new Set(picked)
    hits.forEach((id) => next.add(id))
    // A training keeps at most 4 concepts, also when the text names more.
    if (mode === 'train' && next.size > PRACTICE_MAX_CONCEPTS) {
      setToast(`Trovati più concetti per «${raw}»: in un allenamento ne tengo al massimo 4. Cambiali con la ×.`)
      return new Set([...next].slice(0, PRACTICE_MAX_CONCEPTS))
    }
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
      let picked = new Set(
        initial ? initial.conceptIds : cat.suggested.slice(0, 2).map((x) => x.id)
      )
      if ((initial?.exam ? 'exam' : 'train') === 'train' && picked.size > PRACTICE_MAX_CONCEPTS) {
        picked = new Set([...picked].slice(0, PRACTICE_MAX_CONCEPTS))
        setToast('In un allenamento puoi scegliere al massimo 4 concetti.')
      }
      const text = initialText.trim()
      if (text) {
        picked = applyText(cat, text, picked)
        if (!matchConcepts(cat, text).length) setFree(text)
      }
      if ((initial?.exam ? 'exam' : 'train') === 'train' && picked.size > PRACTICE_MAX_CONCEPTS) {
        picked = new Set([...picked].slice(0, PRACTICE_MAX_CONCEPTS))
        setToast('In un allenamento puoi scegliere al massimo 4 concetti.')
      }
      setConcepts(picked)
      go.current?.focus()
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api])

  const names = new Map(
    catalog?.subjects.flatMap((s) =>
      s.notes.flatMap((n) => n.concepts.map((c) => [c.id, c.name] as const))
    ) ?? []
  )
  const sourceTitle = new Map(catalog?.sources.map((s) => [s.id, s] as const) ?? [])
  const has = concepts.size + sources.size > 0 || free.trim().length > 0
  const start = async (): Promise<void> => {
    if (!has || busy || dictating) return
    setBusy(true)
    setError(null)
    const material = { conceptIds: [...concepts], sourceIds: [...sources], free: free.trim() }
    try {
      onStarted(
        mode === 'exam' ? await api.examStart(material, minutes, paper) : await api.create(material)
      )
    } catch (e) {
      setError(clean(e))
      setBusy(false)
    }
  }

  return (
    <ViewScene className="pr">
      <GlassSurface render={<header />} radius={0} className="pr-top drag glass-bar glass-text">
        <button type="button" className="pill nodrag back-btn" onClick={onBack}>
          ← Home
        </button>
        <h1>Pratica</h1>
      </GlassSurface>
      <ScrollEdges target={page} size={72} />
      <GlassContent layout="scroll" className="pr-setup edge-fade" ref={page}>
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
                      <button
                        type="button"
                        aria-label={`Togli ${names.get(id) ?? id}`}
                        onClick={() => setConcepts((p) => new Set([...p].filter((x) => x !== id)))}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {[...sources].map((id) => (
                    <span key={id} className="mt-chip on">
                      <span className="mt-tag">{sourceTitle.get(id)?.kind}</span>
                      {sourceTitle.get(id)?.title}
                      <button
                        type="button"
                        aria-label={`Togli ${sourceTitle.get(id)?.title}`}
                        onClick={() => setSources((p) => new Set([...p].filter((x) => x !== id)))}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {concepts.size + sources.size === 0 && (
                    <span className="mt-hint">
                      Niente ancora: tocca un suggerito o scrivi un argomento.
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-group" role="group" aria-label="Suggeriti per oggi">
                <span className="lab">Suggeriti per oggi</span>
                <div className="mt-chips">
                  {catalog.suggested
                    .filter((x) => !concepts.has(x.id))
                    .map((x) => (
                      <button
                        key={x.id}
                        type="button"
                        className="mt-chip"
                        disabled={mode === 'train' && concepts.size >= PRACTICE_MAX_CONCEPTS}
                        onClick={() => setConcepts((p) => p.size >= PRACTICE_MAX_CONCEPTS && mode === 'train' ? p : new Set([...p, x.id]))}
                      >
                        {x.name}
                        <small>{x.why}</small>
                      </button>
                    ))}
                  {catalog.suggested.length > 0 &&
                    catalog.suggested.every((x) => concepts.has(x.id)) && (
                      <span className="mt-hint">Hai già preso tutti i suggeriti.</span>
                    )}
                  {catalog.suggested.length === 0 && (
                    <span className="mt-hint">
                      Nessun suggerimento: il grafo è ancora vuoto o tutto è fresco.
                    </span>
                  )}
                </div>
              </div>
              {mode === 'train' && <p className="mt-hint">{concepts.size}/{PRACTICE_MAX_CONCEPTS} concetti · In un allenamento al massimo 4 concetti.</p>}
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
                    onClick={() => changeMode(m)}
                    onKeyDown={(e) => {
                      if (e.key.startsWith('Arrow')) {
                        e.preventDefault()
                        changeMode(mode === 'train' ? 'exam' : 'train')
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
                  <Seg
                    label="Durata"
                    className="dur glass-text"
                    ground="surface"
                    value={preset}
                    onChange={setPreset}
                    options={[
                      ...(['30', '60', '90'] as const).map((d) => ({ value: d, label: `${d} min` })),
                      { value: 'custom' as const, label: 'Altro…' }
                    ]}
                  />
                  {preset === 'custom' && (
                    <div className="custom">
                      <button
                        type="button"
                        aria-label="Meno 5 minuti"
                        onClick={() => setCustom((m) => clampMinutes(m - 5))}
                      >
                        −
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={5}
                        max={300}
                        step={5}
                        aria-label="Durata in minuti"
                        value={custom}
                        onChange={(e) => setCustom(Number(e.target.value))}
                        onBlur={() => setCustom((m) => clampMinutes(m))}
                      />
                      <span>min</span>
                      <button
                        type="button"
                        aria-label="Più 5 minuti"
                        onClick={() => setCustom((m) => clampMinutes(m + 5))}
                      >
                        +
                      </button>
                    </div>
                  )}
                  <span className="lab">Dove</span>
                  <Seg
                    label="Dove scrivi"
                    className="dur glass-text"
                    ground="surface"
                    value={paper ? 'paper' : 'pc'}
                    onChange={(v) => setPaper(v === 'paper')}
                    options={[
                      { value: 'pc', label: 'Al computer' },
                      { value: 'paper', label: 'Carta e penna' }
                    ]}
                  />
                  <div className="rules">
                    <span>✕ niente indizi</span>
                    <span>✕ niente correzione durante</span>
                    {paper && <span>✎ alla fine ti dai tu il voto, prima della correzione</span>}
                  </div>
                </div>
              )}
              {error && (
                <p className="pr-alert" role="alert">
                  {error}
                </p>
              )}
              <div className="startrow">
                <div className="mic-field mic-fill mic-row">
                  <textarea
                    ref={freeField}
                    readOnly={dictating}
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
                      if (e.key !== 'Enter' || e.shiftKey || dictating || !free.trim() || !catalog)
                        return
                      e.preventDefault()
                      const raw = free.trim()
                      const hits = matchConcepts(catalog, raw)
                      setConcepts((p) => applyText(catalog, raw, p))
                      if (hits.length) setFree('')
                    }}
                  />
                  <MicButton dictation={dictation} />
                </div>
                <button
                  ref={go}
                  type="button"
                  className={'pri' + (mode === 'exam' ? ' exam' : '')}
                  disabled={!has || busy || dictating}
                  onClick={() => void start()}
                >
                  {mode === 'exam'
                    ? `Inizia simulazione${paper ? ' su carta' : ''} · ${minutes} min`
                    : 'Inizia allenamento'}
                </button>
              </div>
              <DictationError dictation={dictation} />
            </div>
          </div>
        )}
      </GlassContent>
      {dialog && catalog && (
        <MaterialDialog
          catalog={catalog}
          concepts={concepts}
          sources={sources}
          onClose={() => setDialog(false)}
          onConfirm={(c, s) => {
            setConcepts(mode === 'train' ? new Set([...c].slice(0, PRACTICE_MAX_CONCEPTS)) : c)
            if (mode === 'train' && c.size > PRACTICE_MAX_CONCEPTS) setToast('In un allenamento puoi scegliere al massimo 4 concetti.')
            setSources(s)
            setDialog(false)
          }}
        />
      )}
    </ViewScene>
  )
}
