import { useCallback, useEffect, useRef, useState } from 'react'
import type { ExplainTurn } from '../../../main/memory/explain'
import type { ReviewItem } from '../../../main/memory/review'
import { proposeGrade, type ExerciseType, type Grade } from '../../../shared/memory-types'
import { EXERCISE_TYPES } from '../../../shared/memory-types'
import { GlassContent, GlassSurface } from '@glass-sdk/liquid-glass'
import { GlassRange, ScrollEdges, ViewScene } from '../components/glass'
import { RichText } from '../session/RichText'
import { MODE, TYPE_LABEL } from './labels'
import { ExerciseView, type ExerciseState } from './ExerciseView'
import './review.css'

const GRADES: [Grade, string][] = [
  [1, 'Di nuovo'],
  [2, 'Difficile'],
  [3, 'Bene'],
  [4, 'Facile']
]

type Verdict = {
  kind: 'ok' | 'partial' | 'wrong' | 'mis' | 'idk'
  feedback: string
  proposed: Grade
  correct: boolean
  dontKnow: boolean
}
type Result = {
  item: ReviewItem
  grade: Grade
  before: number | null
  after: number | null
  misconception: boolean
}
const pct = (r: number | null): string => (r === null ? 'nuovo' : `${Math.round(r * 100)}%`)
const remote = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    ''
  )

/** The Ripasso session: what is fading, asked in a new form each time (prototype ripasso-v1). */
export function ReviewView({
  query,
  conceptIds,
  onBack,
  onStudy,
  onOpenNote
}: {
  query?: string
  conceptIds?: string[]
  onBack: () => void
  onStudy: (name: string) => void
  onOpenNote: (path: string) => void
}): React.JSX.Element {
  const api = window.sinapsi
  const [items, setItems] = useState<ReviewItem[] | null>(null)
  const [due, setDue] = useState(0)
  const [types, setTypes] = useState<ExerciseType[]>([...EXERCISE_TYPES])
  const [i, setI] = useState(-1)
  const [state, setState] = useState<ExerciseState>({ answer: '', correct: null, ready: false })
  const [confidence, setConfidence] = useState(50)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  // "Spiegalo tu": the dialogue with the picky student, Andrea's turns and its questions.
  const [turns, setTurns] = useState<ExplainTurn[]>([])
  const [checking, setChecking] = useState(false)
  const [grade, setGrade] = useState<Grade>(3)
  const [intervals, setIntervals] = useState<Record<Grade, string> | null>(null)
  const [results, setResults] = useState<Result[]>([])
  const [error, setError] = useState<string | null>(null)
  const [typeError, setTypeError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const nextRef = useRef<HTMLButtonElement>(null)
  // The page under the bar, the scene's live content.
  const page = useRef<HTMLDivElement>(null)
  const questionRef = useRef<HTMLDivElement>(null)
  const [startedAt] = useState(() => Date.now())
  const [endedAt, setEndedAt] = useState<number | null>(null)

  const load = useCallback(
    async (opts?: { conceptIds?: string[]; weakest?: boolean }, reset = true) => {
      if (reset) {
        setItems(null)
        setError(null)
      }
      try {
        let o = opts
        if (!o && conceptIds) o = { conceptIds }
        if (!o && query && api.graph) {
          const g = await api.graph.get()
          const q = query.toLowerCase()
          const ids = g.concepts
            .filter(
              (c) =>
                c.name.toLowerCase().includes(q) ||
                c.statement.toLowerCase().includes(q) ||
                c.notes.some((p) => p.toLowerCase().includes(q))
            )
            .map((c) => c.id)
          o = { conceptIds: ids }
        }
        const p = await api.review.plan(o)
        setItems(p.items)
        setDue(p.due)
        setI(-1)
        setResults([])
        setEndedAt(null)
      } catch (e) {
        setError(remote(e))
        setItems([])
      }
    },
    [api, conceptIds, query]
  )
  useEffect(() => {
    // Deferred: the first plan sets state asynchronously, never during the effect itself.
    void Promise.resolve().then(() => load(undefined, false))
    void api.settings?.get().then((s) => setTypes(s.exerciseTypes))
  }, [api, load])

  const toggleType = (t: ExerciseType): void => {
    const next = types.includes(t) ? types.filter((x) => x !== t) : [...types, t]
    if (!next.length) return
    const before = types
    setTypes(next)
    setTypeError(null)
    api.settings
      .set({ exerciseTypes: next })
      .then(() => load())
      .catch((e) => {
        setTypes(before)
        setTypeError(`Scelta non salvata: ${remote(e)}`)
      })
  }

  const next = (): void => {
    if (items && i + 1 >= items.length) setEndedAt(Date.now())
    setI((k) => k + 1)
    setState({ answer: '', correct: null, ready: false })
    setConfidence(50)
    setVerdict(null)
    setTurns([])
    setIntervals(null)
  }

  async function check(dontKnow = false): Promise<void> {
    const item = items![i]
    setChecking(true)
    try {
      let v: Verdict
      if (item.exercise.type === 'explain' && (!dontKnow || turns.length)) {
        // Past the first turn "Non lo so" is an answer to the question, and the picky student concludes.
        const said: ExplainTurn[] = [
          ...turns,
          { by: 'andrea', text: dontKnow ? 'Non lo so.' : state.answer.trim() }
        ]
        const g = await api.review.explain({
          conceptId: item.conceptId,
          exercise: item.exercise,
          turns: said,
          confidence
        })
        if (g.kind === 'question') {
          setTurns([...said, { by: 'claude', text: g.question }])
          setState({ answer: '', correct: null, ready: false })
          return
        }
        setTurns(said)
        const wrongSure = g.verdict === 'wrong' && confidence >= 70
        v = {
          kind: wrongSure ? 'mis' : g.verdict,
          feedback: g.feedback,
          proposed: g.proposed,
          correct: g.verdict === 'ok',
          dontKnow: false
        }
      } else if (dontKnow)
        v = {
          kind: 'idk',
          feedback: 'Lo segno come vuoto, non come errore: torna presto, con un aiuto in più.',
          proposed: 1,
          correct: false,
          dontKnow: true
        }
      else if (item.exercise.type === 'open') {
        const g = await api.review.grade({
          conceptId: item.conceptId,
          exercise: item.exercise,
          answer: state.answer,
          confidence
        })
        const wrongSure = g.verdict === 'wrong' && confidence >= 70
        v = {
          kind: wrongSure ? 'mis' : g.verdict,
          feedback: g.feedback,
          proposed: g.proposed,
          correct: g.verdict === 'ok',
          dontKnow: false
        }
      } else {
        const ok = state.correct === true
        const kind = ok ? 'ok' : confidence >= 70 ? 'mis' : 'wrong'
        const feedback = ok
          ? confidence < 50
            ? 'Giusto, ma eri incerto: lo considero fragile e torna prima.'
            : 'Esatto.'
          : kind === 'mis'
            ? `Eri sicuro al ${confidence}%. È il segnale più importante: probabilmente c'è un'idea sbagliata da correggere, non solo un vuoto.`
            : 'Guarda la risposta di riferimento: torna presto, con una domanda diversa.'
        v = {
          kind,
          feedback,
          proposed: proposeGrade({ correct: ok, confidence }),
          correct: ok,
          dontKnow: false
        }
      }
      setVerdict(v)
      setGrade(v.proposed)
      setIntervals(await api.review.intervals(item.conceptId).catch(() => null))
    } finally {
      setChecking(false)
    }
  }

  async function advance(): Promise<void> {
    if (saving) return
    const item = items![i]
    const v = verdict!
    setSaving(true)
    try {
      const r = await api.review.record({
        conceptId: item.conceptId,
        at: Date.now(),
        grade,
        confidence: v.dontKnow ? undefined : confidence,
        correct: v.correct,
        dontKnow: v.dontKnow || undefined,
        variantId: item.variantId ?? undefined,
        type: item.exercise.type,
        misconception: v.kind === 'mis' || undefined
      })
      setResults((rs) => [
        ...rs,
        { item, grade, before: item.R, after: r.memory.R, misconception: v.kind === 'mis' }
      ])
    } catch (e) {
      setError(remote(e))
      return
    } finally {
      setSaving(false)
    }
    setError(null)
    next()
  }

  // Keyboard and VoiceOver users land where the next action is: "Prossima" after the check,
  // the question when a new item appears.
  useEffect(() => {
    if (verdict) nextRef.current?.focus()
  }, [verdict])
  useEffect(() => {
    if (i >= 0 && items && i < items.length) questionRef.current?.focus()
  }, [i, items])

  const top = (
    <GlassSurface render={<header />} radius={0} className="rv-top drag glass-bar glass-text">
      <button type="button" className="pill nodrag back-btn" onClick={onBack}>
        ← Home
      </button>
      <span className="rv-title">Ripasso</span>
      {items && items.length > 0 && i >= 0 && (
        <span
          className="rv-track"
          role="progressbar"
          aria-label="Avanzamento"
          aria-valuemin={0}
          aria-valuemax={items.length}
          aria-valuenow={Math.min(i + 1, items.length)}
        >
          {items.map((_it, k) => (
            <i key={k} className={k < i || (k === i && verdict) ? 'done' : k === i ? 'now' : ''} />
          ))}
          <small>
            {Math.min(i + 1, items.length)} / {items.length}
          </small>
        </span>
      )}
    </GlassSurface>
  )

  if (!items)
    return (
      <ViewScene className="rv">
        {top}
        <ScrollEdges target={page} size={72} edges={['top']} />
        <GlassContent layout="scroll" className="rv-scroll edge-fade" ref={page}>
          <main className="rv-main">
            <p className="rv-loading" role="status">
              Preparo le domande… (la prima volta Gemini scrive le varianti: può servire qualche
              minuto)
            </p>
          </main>
        </GlassContent>
      </ViewScene>
    )

  // Intro
  if (i < 0) {
    const today = new Date().toLocaleDateString('it-IT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    })
    const notes = new Set(items.map((x) => x.noteTitle)).size
    return (
      <ViewScene className="rv">
        {top}
        <ScrollEdges target={page} size={72} edges={['top']} />
        <GlassContent layout="scroll" className="rv-scroll edge-fade" ref={page}>
          <main className="rv-main">
            <section className="rv-intro">
              <div className="lab">{today}</div>
              {items.length === 0 ? (
                <>
                  <h1>Niente da ripassare oggi.</h1>
                  <p>
                    {error ??
                      'Tutto quello che hai studiato è ancora nitido. I concetti arrivano dalle note che apri e studi.'}
                  </p>
                  <div className="rv-acts">
                    <button
                      type="button"
                      className="pri"
                      onClick={() => void load({ weakest: true })}
                    >
                      Ripassa comunque i più deboli
                    </button>
                    <button type="button" className="ghost" onClick={onBack}>
                      Torna alla home
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h1>
                    {due > 0
                      ? `${items.length} ${items.length === 1 ? 'cosa sta' : 'cose stanno'} sbiadendo.`
                      : `${items.length} ${items.length === 1 ? 'concetto' : 'concetti'} da fissare.`}
                  </h1>
                  <p>
                    Le ho scelte perché stai per dimenticarle (la percentuale è la probabilità
                    stimata che te le ricordi oggi). Ogni domanda è nuova: non la stessa carta
                    dell&apos;ultima volta.
                  </p>
                  <div className="rv-plan">
                    <div>
                      <b>~{Math.max(1, Math.round(items.length * 1.5))} min</b>
                      <span>durata stimata</span>
                    </div>
                    <div>
                      <b>
                        {notes} {notes === 1 ? 'nota' : 'note'}
                      </b>
                      <span>mescolate apposta</span>
                    </div>
                  </div>
                  <ul className="rv-list" aria-label="Da ripassare">
                    {items.map((it) => (
                      <li key={it.conceptId}>
                        <span>
                          <span>{it.name}</span>
                          <small>
                            {it.noteTitle} · {MODE[it.exercise.type].toLowerCase()}
                          </small>
                        </span>
                        <span className="r">{pct(it.R)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="rv-types">
                    <div className="lab">Esercizi</div>
                    {typeError && (
                      <p role="alert" className="rv-err">
                        {typeError}
                      </p>
                    )}
                    <div className="rv-chips" role="group" aria-label="Esercizi">
                      {EXERCISE_TYPES.map((t) => (
                        <button
                          key={t}
                          type="button"
                          aria-pressed={types.includes(t)}
                          onClick={() => toggleType(t)}
                        >
                          {TYPE_LABEL[t]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rv-go">
                    <button type="button" className="pri" onClick={next}>
                      Inizia ripasso
                    </button>
                  </div>
                </>
              )}
            </section>
          </main>
        </GlassContent>
      </ViewScene>
    )
  }

  // Summary
  if (i >= items.length) {
    const misses = results.filter((r) => r.grade === 1)
    const mis = results.filter((r) => r.misconception)
    const minutes = Math.max(1, Math.round(((endedAt ?? startedAt) - startedAt) / 60_000))
    return (
      <ViewScene className="rv">
        {top}
        <ScrollEdges target={page} size={72} edges={['top']} />
        <GlassContent layout="scroll" className="rv-scroll edge-fade" ref={page}>
          <main className="rv-main">
            <section className="rv-sum">
              <div className="lab">Ripasso completato · {minutes} min</div>
              <h1>{misses.length ? 'Quasi tutto di nuovo nitido.' : 'Tutto di nuovo nitido.'}</h1>
              <p className="lede">
                Barra chiara: quanto lo ricordavi prima. Barra piena: subito dopo.
              </p>
              {mis.map((r) => (
                <div key={r.item.conceptId} className="rv-callout bad">
                  <div>
                    <b>Possibile misconcezione su {r.item.name}.</b> Eri molto sicuro ma hai
                    sbagliato: conviene ristudiarlo con il tutor, non solo ripassarlo.
                  </div>
                  <button type="button" className="ghost" onClick={() => onStudy(r.item.name)}>
                    Studia questo concetto
                  </button>
                </div>
              ))}
              {misses.length > 0 && (
                <div className="rv-callout">
                  <div>
                    <b>
                      {misses.length} {misses.length === 1 ? 'cosa torna' : 'cose tornano'} tra
                      pochi minuti
                    </b>{' '}
                    con una domanda diversa.
                  </div>
                </div>
              )}
              <div className="rv-rows">
                {results.map((r) => (
                  <div key={r.item.conceptId} className="rv-row">
                    <span>
                      {r.item.name}
                      <small>{r.item.noteTitle}</small>
                    </span>
                    <span
                      className="bars"
                      aria-label={`Prima ${pct(r.before)}, dopo ${pct(r.after)}`}
                    >
                      <i
                        className="before"
                        style={{ width: `${Math.round((r.before ?? 0) * 100)}%` }}
                      />
                      <i
                        className="after"
                        style={{ width: `${Math.round((r.after ?? 0) * 100)}%` }}
                      />
                    </span>
                  </div>
                ))}
              </div>
              <div className="rv-acts">
                <button type="button" className="pri" onClick={onBack}>
                  Torna alla home
                </button>
                {misses.length > 0 && (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => void load({ conceptIds: misses.map((r) => r.item.conceptId) })}
                  >
                    Rifai subito gli errori
                  </button>
                )}
              </div>
            </section>
          </main>
        </GlassContent>
      </ViewScene>
    )
  }

  // Item
  const item = items[i]
  const TITLE: Record<Verdict['kind'], string> = {
    ok: 'Corretto',
    partial: 'Quasi',
    wrong: 'Non ancora',
    mis: 'Sbagliato con sicurezza: possibile misconcezione',
    idk: 'Va bene non saperlo'
  }
  return (
    <ViewScene className="rv">
      {top}
      <ScrollEdges target={page} size={72} edges={['top']} />
      <GlassContent layout="scroll" className="rv-scroll edge-fade" ref={page}>
        <main className="rv-main">
          <article className="rv-item" aria-labelledby="rv-q">
            <div className="rv-head">
              <span className="chip">{item.noteTitle}</span>
              <span className="chip">{MODE[item.exercise.type]}</span>
              <span className="chip">{TYPE_LABEL[item.exercise.type]}</span>
            </div>
            <div id="rv-q" className="rv-q" ref={questionRef} tabIndex={-1}>
              <RichText md={item.exercise.prompt} />
            </div>
            {item.exercise.type === 'explain' && (
              <p className="rv-hint">
                Spiegalo come a un compagno pignolo, a voce o per iscritto: ti fermerà al primo
                passaggio che non torna, con al massimo un paio di domande.
              </p>
            )}
            {turns.length > 0 && (
              <ol className="rv-dialog" aria-label="Dialogo">
                {turns.map((t, k) => (
                  <li key={k} className={t.by}>
                    <span className="lab">{t.by === 'andrea' ? 'Tu' : 'Studente pignolo'}</span>
                    <RichText md={t.text} />
                  </li>
                ))}
              </ol>
            )}
            <div
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && state.ready && !verdict)
                  void check()
              }}
            >
              {!(verdict && item.exercise.type === 'explain') && (
                <ExerciseView
                  key={`${item.conceptId}-${i}-${turns.length}`}
                  exercise={item.exercise}
                  locked={!!verdict}
                  followUp={turns.length > 0}
                  onChange={setState}
                />
              )}
            </div>
            {!verdict && (
              <>
                {turns.length === 0 && (
                  <div className="rv-conf">
                    <span className="lab" id="rv-cf-l">
                      Quanto sei sicuro?
                    </span>
                    <GlassRange
                      ground="bg"
                      aria-labelledby="rv-cf-l"
                      min={0}
                      max={100}
                      step={10}
                      value={confidence}
                      onValueChange={(v) => setConfidence(v)}
                      thumbProps={{ getAriaValueText: (_text, v) => `${v}%` }}
                    />
                    <output aria-hidden="true">{confidence}%</output>
                  </div>
                )}
                <div className="rv-acts">
                  <button
                    type="button"
                    className="ghost"
                    disabled={checking}
                    onClick={() => void check(true)}
                  >
                    {turns.length ? 'Non saprei' : 'Non lo so'}
                  </button>
                  <button
                    type="button"
                    className="pri"
                    disabled={!state.ready || checking}
                    onClick={() => void check()}
                  >
                    {checking ? 'Correggo…' : turns.length ? 'Rispondi' : 'Verifica'}
                  </button>
                </div>
              </>
            )}
            {verdict && (
              <div className="rv-reveal">
                <div className={`rv-verdict ${verdict.kind}`} role="status">
                  <b>{TITLE[verdict.kind]}</b>
                  <RichText md={verdict.feedback} />
                </div>
                <div className="rv-model">
                  <span className="lab">Risposta di riferimento</span>
                  <RichText md={item.exercise.answer} />
                </div>
                <div className="lab" id="rv-gl">
                  Quanto ti è costato ricordarlo?
                </div>
                <div className="rv-grade" role="group" aria-labelledby="rv-gl">
                  {GRADES.map(([g, label]) => (
                    <button
                      key={g}
                      type="button"
                      aria-pressed={grade === g}
                      onClick={() => setGrade(g)}
                    >
                      {g === verdict.proposed && <span className="sug">proposta</span>}
                      {label}
                      <small>{intervals?.[g] ?? ''}</small>
                    </button>
                  ))}
                </div>
                {error && <p role="alert">{error}</p>}
                <div className="rv-foot">
                  <button type="button" className="link" onClick={() => onOpenNote(item.notePath)}>
                    Apri nella nota
                  </button>
                  <button
                    type="button"
                    className="pri"
                    ref={nextRef}
                    disabled={saving}
                    onClick={() => void advance()}
                  >
                    {i === items.length - 1 ? 'Vedi riepilogo' : 'Prossima'}
                  </button>
                </div>
              </div>
            )}
          </article>
        </main>
      </GlassContent>
    </ViewScene>
  )
}
