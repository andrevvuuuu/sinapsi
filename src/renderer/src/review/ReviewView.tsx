import { useCallback, useEffect, useRef, useState } from 'react'
import { NotePeek } from '../components/NotePeek'
import { StudyPacer } from '../components/StudyPacer'
import type { ExplainTurn, ReviewItem } from '../../../shared/review-types'
import { GUESS_CONFIDENCE, MISCONCEPTION_CONFIDENCE, proposeGrade, type ExerciseType, type Grade } from '../../../shared/memory-types'
import { EXERCISE_TYPES } from '../../../shared/memory-types'
import { GlassContent } from '@glass-sdk/liquid-glass'
import { ScrollEdges, Seg, ViewScene } from '../components/glass'
import { RichText } from '../session/RichText'
import { MODE, TYPE_LABEL } from './labels'
import { ExerciseView, type ExerciseState } from './ExerciseView'
import './review.css'
import { ConfidencePanel } from './ConfidencePanel'
import { CONFIDENCE_OPTIONS, type ConfKey } from '../components/confidence'
import { Skeleton } from '../components/Skeleton'
import { useWaitStage } from '../components/useWaitStage'

const GRADES: [Grade, string][] = [
  [1, 'Di nuovo'],
  [2, 'Difficile'],
  [3, 'Bene']
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
  interval?: string
}
const pct = (r: number | null): string => (r === null ? 'nuovo' : `${Math.round(r * 100)}%`)
const remote = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    ''
  )

function ToStudyBlock({
  items,
  onStudy
}: {
  items: { conceptId: string; name: string; noteTitle: string }[]
  onStudy: (name: string) => void
}): React.JSX.Element | null {
  if (items.length === 0) return null
  return (
    <section className="rv-study-block" aria-label="Da studiare">
      <div className="lab">Da studiare</div>
      <ul className="rv-list">
        {items.map((c) => (
          <li key={c.conceptId}>
            <span>
              <span>{c.name}</span>
              <small>{c.noteTitle}</small>
            </span>
            <button
              type="button"
              className="ghost"
              onClick={() => onStudy(c.name)}
            >
              Studia
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The Ripasso session: what is fading, asked in a new form each time (prototype ripasso-v1). */
export function ReviewView({
  query,
  conceptIds,
  examAt,
  order,
  onBack,
  onStudy,
  onPractice,
  onOpenNote,
  backLabel = '← Oggi'
}: {
  query?: string
  conceptIds?: string[]
  cascadeWeak?: string[]
  examAt?: number
  order?: 'due' | 'gain'
  onBack: () => void
  onStudy: (name: string) => void
  onPractice?: (conceptIds: string[]) => void
  onOpenNote: (path: string) => void
  backLabel?: string
}): React.JSX.Element {
  const api = window.sinapsi
  const [items, setItems] = useState<ReviewItem[] | null>(null)
  const [toStudy, setToStudy] = useState<{ conceptId: string; name: string; noteTitle: string }[]>([])
  const [due, setDue] = useState(0)
  const [clinicEmpty, setClinicEmpty] = useState(false)
  const [types, setTypes] = useState<ExerciseType[]>([...EXERCISE_TYPES])
  const [i, setI] = useState(-1)
  const [state, setState] = useState<ExerciseState>({ answer: '', correct: null, ready: false })
  const [confidence, setConfidence] = useState<number | null>(null)
  const [contested, setContested] = useState(false)
  const [contesting, setContesting] = useState(false)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  // "Spiegalo tu": the dialogue with the picky student, Andrea's turns and its questions.
  const [turns, setTurns] = useState<ExplainTurn[]>([])
  const [checking, setChecking] = useState(false)
  const [grade, setGrade] = useState<Grade>(3)
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
  const [peekItem, setPeekItem] = useState<ReviewItem | null>(null)
  const peekTriggerRef = useRef<HTMLButtonElement | null>(null)

  const load = useCallback(
    async (
      opts?: {
        conceptIds?: string[]
        weakest?: boolean
        misconceptions?: boolean
        examAt?: number
        order?: 'due' | 'gain'
      },
      reset = true
    ) => {
      if (reset) {
        setItems(null)
        setToStudy([])
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
        const planOpts = {
          ...(examAt !== undefined ? { examAt } : {}),
          ...(order !== undefined ? { order } : {}),
          ...o
        }
        const p = await api.review.plan(planOpts)
        setItems(p.items)
        setToStudy(p.toStudy ?? [])
        setClinicEmpty(!!opts?.misconceptions && p.items.length === 0)
        setDue(p.due)
        setI(-1)
        setResults([])
        setEndedAt(null)
      } catch (e) {
        setError(remote(e))
        setItems([])
        setToStudy([])
      }
    },
    [api, conceptIds, query, examAt, order]
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
    // The plan's questions depend on the chosen types, so it is rebuilt after the save, but in place (reset = false):
    // the list stays mounted and the scroll where it was.
    void api.settings
      .set({ exerciseTypes: next })
      .then(() => load(undefined, false))
      .catch((e) => {
        setTypes(before)
        setTypeError(`Scelta non salvata: ${remote(e)}`)
      })
  }

  const next = (): void => {
    if (items && i + 1 >= items.length) setEndedAt(Date.now())
    setI((k) => k + 1)
    setState({ answer: '', correct: null, ready: false })
    setConfidence(null)
    setVerdict(null)
    setTurns([])
    setContested(false)
    setContesting(false)
  }

  async function check(dontKnow = false): Promise<void> {
    if (!dontKnow && turns.length === 0 && confidence === null) return
    const item = items![i]
    setChecking(true)
    const conf = confidence ?? 50
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
          confidence: conf
        })
        if (g.kind === 'question') {
          setTurns([...said, { by: 'claude', text: g.question }])
          setState({ answer: '', correct: null, ready: false })
          return
        }
        setTurns(said)
        const wrongSure = g.verdict === 'wrong' && conf >= MISCONCEPTION_CONFIDENCE
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
          confidence: conf
        })
        const wrongSure = g.verdict === 'wrong' && conf >= MISCONCEPTION_CONFIDENCE
        v = {
          kind: wrongSure ? 'mis' : g.verdict,
          feedback: g.feedback,
          proposed: g.proposed,
          correct: g.verdict === 'ok',
          dontKnow: false
        }
      } else {
        const ok = state.correct === true
        const kind = ok ? 'ok' : conf >= MISCONCEPTION_CONFIDENCE ? 'mis' : 'wrong'
        const feedback = ok
          ? conf < GUESS_CONFIDENCE
            ? 'Giusto, ma eri incerto: lo considero fragile e torna prima.'
            : 'Esatto.'
          : kind === 'mis'
            ? `Eri sicuro al ${conf}%. È il segnale più importante: probabilmente c'è un'idea sbagliata da correggere, non solo un vuoto.`
            : 'Guarda la risposta di riferimento: torna presto, con una domanda diversa.'
        v = {
          kind,
          feedback,
          proposed: proposeGrade({ correct: ok, confidence: conf }),
          correct: ok,
          dontKnow: false
        }
      }
      setVerdict(v)
      setGrade(v.proposed)
    } finally {
      setChecking(false)
    }
  }

  async function handleContest(): Promise<void> {
    if (contesting || saving || contested || !verdict) return
    const item = items![i]
    setContesting(true)
    try {
      let answerText = state.answer.trim()
      if (item.exercise.type === 'explain') {
        const studentTurns = turns.filter((t) => t.by === 'andrea').map((t) => t.text)
        answerText = studentTurns.join('\n') || state.answer.trim()
      }
      const res = await api.review.contest({
        conceptId: item.conceptId,
        exercise: item.exercise,
        answer: answerText,
        confidence: confidence ?? 50
      })
      const wrongSure = res.verdict === 'wrong' && (confidence ?? 50) >= MISCONCEPTION_CONFIDENCE
      const newVerdict: Verdict = {
        kind: wrongSure ? 'mis' : res.verdict,
        feedback: res.feedback,
        proposed: res.proposed,
        correct: res.verdict === 'ok',
        dontKnow: false
      }
      setVerdict(newVerdict)
      setGrade(res.proposed)
      setContested(true)
    } catch (e) {
      setError(remote(e))
    } finally {
      setContesting(false)
    }
  }

  async function advance(): Promise<void> {
    if (saving) return
    const item = items![i]
    const v = verdict!
    setSaving(true)
    try {
      const isRepresented = Boolean(item.represented)
      let r: any = null
      if (!isRepresented) {
        r = await api.review.record({
          conceptId: item.conceptId,
          at: Date.now(),
          grade,
          confidence: v.dontKnow ? undefined : (confidence ?? undefined),
          correct: v.correct,
          dontKnow: v.dontKnow || undefined,
          variantId: item.variantId ?? undefined,
          type: item.exercise.type,
          misconception: v.kind === 'mis' || undefined,
          contested: contested || undefined
        })
        const interval = r?.intervals?.[grade]
        setResults((rs) => [
          ...rs,
          {
            item,
            grade,
            before: item.R,
            after: r ? r.memory.R : item.R,
            misconception: v.kind === 'mis',
            interval: interval ? `Torna tra ${interval}` : undefined
          }
        ])
      }
      const representedCount = item.representedCount ?? 0
      const shouldRepresent = grade === 1 && representedCount < 2
      const reItem: ReviewItem = {
        ...item,
        represented: true,
        representedCount: representedCount + 1
      }
      const budget = items ? Math.max(0, items.length - 1 - i) : 0
      let additions: ReviewItem[] = []
      if (!item.cascadeOf && grade <= 2 && budget > 0 && api.review?.prerequisites) {
        try {
          additions = (await api.review.prerequisites(item.conceptId, budget)) ?? []
        } catch {
          // Keep the original goal queue usable if prerequisites cannot be loaded.
        }
      }
      if (shouldRepresent || additions.length > 0) {
        setItems((current) => {
          if (!current) return current
          const head = current.slice(0, i + 1)
          const unstarted = current.slice(i + 1)
          const existing = new Set(head.map((x) => x.conceptId))
          const filteredAdditions = additions.filter((x) => !existing.has(x.conceptId))

          let availableSlots = unstarted.length
          let unstartedQueue = [...unstarted]

          if (shouldRepresent && availableSlots > 0) {
            const dropIdx = unstartedQueue.findLastIndex((it) => !it.represented)
            if (dropIdx >= 0) {
              unstartedQueue.splice(dropIdx, 1)
            } else {
              unstartedQueue.pop()
            }
            availableSlots--
          }

          if (filteredAdditions.length > 0 && availableSlots > 0) {
            const count = Math.min(filteredAdditions.length, availableSlots)
            const kept = unstartedQueue.slice(0, unstartedQueue.length - count)
            unstartedQueue = [...filteredAdditions.slice(0, count), ...kept]
          }

          if (shouldRepresent) {
            const insertIndex = Math.min(3, unstartedQueue.length)
            unstartedQueue.splice(insertIndex, 0, reItem)
          }

          return [...head, ...unstartedQueue]
        })
      }
    } catch (e) {
      setError(remote(e))
      return
    } finally {
      setSaving(false)
    }
    setError(null)
    next()
  }

  async function handleChainRecord(checked: boolean[], record: boolean): Promise<void> {
    if (saving) return
    const item = items![i]
    const ex = item.exercise
    const conclusionId = ex.type === 'chain' ? ex.conclusion.id : item.conceptId
    setSaving(true)
    try {
      const fraction = checked.length ? checked.filter(Boolean).length / checked.length : 0
      const calculatedGrade: Grade = fraction === 0 ? 1 : fraction < 0.5 ? 2 : 3
      let afterR = item.R
      const isRepresented = Boolean(item.represented)
      if (record && !isRepresented) {
        const r = await api.review.record({
          conceptId: conclusionId,
          at: Date.now(),
          type: 'chain',
          checked
        })
        if (r?.memory?.R !== undefined) afterR = r.memory.R
        setResults((rs) => [
          ...rs,
          { item, grade: calculatedGrade, before: item.R, after: afterR, misconception: false }
        ])
      } else if (!isRepresented) {
        await api.review.record({
          conceptId: conclusionId,
          at: Date.now(),
          type: 'chain',
          record: false
        })
      }
      const representedCount = item.representedCount ?? 0
      const shouldRepresent = record && calculatedGrade === 1 && representedCount < 2
      if (shouldRepresent) {
        const reItem: ReviewItem = {
          ...item,
          represented: true,
          representedCount: representedCount + 1
        }
        setItems((current) => {
          if (!current) return current
          const head = current.slice(0, i + 1)
          const unstarted = current.slice(i + 1)
          const unstartedQueue = [...unstarted]
          if (unstartedQueue.length > 0) {
            const dropIdx = unstartedQueue.findLastIndex((it) => !it.represented)
            if (dropIdx >= 0) unstartedQueue.splice(dropIdx, 1)
            else unstartedQueue.pop()
          }
          const insertIndex = Math.min(3, unstartedQueue.length)
          unstartedQueue.splice(insertIndex, 0, reItem)
          return [...head, ...unstartedQueue]
        })
      }
      setError(null)
      next()
    } catch (e) {
      setError(remote(e))
    } finally {
      setSaving(false)
    }
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
    <header className="rv-top drag">
      <button type="button" className="pill nodrag back-btn" onClick={onBack}>
        {backLabel}
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
    </header>
  )

  const waitStage = useWaitStage({
    engine: 'agy',
    active: !items,
    writing: false
  })

  if (!items)
    return (
      <ViewScene className="rv">
        {top}
        <ScrollEdges target={page} size={72} edges={['top']} />
        <GlassContent layout="scroll" className="rv-scroll edge-fade" ref={page}>
          <main className="rv-main">
            <div className="rv-loading" role="status">
              <div className="rv-skeleton-card" aria-hidden="true" style={{ marginBottom: 16 }}>
                <Skeleton width="30%" height={20} radius="sm" style={{ marginBottom: 12 }} />
                <Skeleton width="100%" height={48} radius="md" style={{ marginBottom: 16 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Skeleton width="100%" height={38} radius="md" />
                  <Skeleton width="100%" height={38} radius="md" />
                  <Skeleton width="100%" height={38} radius="md" />
                </div>
              </div>
              <p>
                Preparo le domande… ({waitStage.label} — la prima volta Gemini scrive le varianti: può servire qualche
                minuto)
              </p>
            </div>
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
                      (clinicEmpty
                        ? 'Non ci sono misconception attive da ripassare.'
                        : toStudy.length > 0
                          ? 'Nessun ripasso in scadenza: ci sono nuovi concetti da studiare dalle tue note.'
                          : 'Tutto quello che hai studiato è ancora nitido. I concetti arrivano dalle note che apri e studi.')}
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
                  <ConfidencePanel onClinic={() => void load({ misconceptions: true })} />
                  <ToStudyBlock items={toStudy} onStudy={onStudy} />
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
                  <ConfidencePanel onClinic={() => void load({ misconceptions: true })} />
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
                  <ToStudyBlock items={toStudy} onStudy={onStudy} />
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
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            toggleType(t)
                          }}
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
                      <small>
                        {r.item.noteTitle}
                        {r.interval ? ` · ${r.interval}` : ''}
                      </small>
                    </span>
                    <span
                      className="bars"
                      aria-label={`Prima ${pct(r.before)}, dopo ${pct(r.after)}`}
                    >
                      <i
                        className="before"
                        style={{ '--v': Math.max(0, Math.min(1, r.before ?? 0)) } as React.CSSProperties}
                      />
                      <i
                        className="after"
                        style={
                          {
                            '--v': Math.max(0, Math.min(1, r.after ?? 0)),
                            '--from': Math.max(0, Math.min(1, r.before ?? 0))
                          } as React.CSSProperties
                        }
                      />
                    </span>
                  </div>
                ))}
              </div>
              <ToStudyBlock items={toStudy} onStudy={onStudy} />
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
  const isLLM = item.exercise.type === 'open' || item.exercise.type === 'explain'
  const canContest = isLLM && verdict !== null && verdict.kind !== 'ok' && !verdict.dontKnow && !contested
  const isFallback = Boolean(verdict?.feedback.startsWith('Non sono riuscito a correggere'))
  const TITLE: Record<Verdict['kind'], string> = {
    ok: 'Corretto',
    partial: 'Quasi',
    wrong: 'Non ancora',
    mis: 'Sbagliato con sicurezza: possibile misconcezione',
    idk: 'Va bene non saperlo'
  }
  return (
    <ViewScene className="rv">
      <StudyPacer onEnd={onBack} />
      {top}
      <ScrollEdges target={page} size={72} edges={['top']} />
      <GlassContent layout="scroll" className="rv-scroll edge-fade" ref={page}>
        <main className="rv-main">
          <article className="rv-item" aria-labelledby="rv-q">
            <div className="rv-head">
              <span className="chip">{item.noteTitle}</span>
              <span className="chip">{MODE[item.exercise.type]}</span>
              <span className="chip">{TYPE_LABEL[item.exercise.type]}</span>
              {item.represented && <span className="chip">Ripresentato</span>}
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
                if (
                  e.key === 'Enter' &&
                  (e.metaKey || e.ctrlKey) &&
                  state.ready &&
                  !verdict &&
                  item.exercise.type !== 'chain'
                ) {
                  if (turns.length === 0 && confidence === null) return
                  void check()
                }
              }}
            >
              {!(verdict && item.exercise.type === 'explain') && (
                <ExerciseView
                  key={`${item.conceptId}-${i}-${turns.length}`}
                  exercise={item.exercise}
                  locked={!!verdict || saving}
                  followUp={turns.length > 0}
                  onChange={setState}
                  onRecordChain={(chk) => void handleChainRecord(chk, true)}
                  onSkipChain={() => void handleChainRecord([], false)}
                />
              )}
            </div>
            {!verdict && item.exercise.type !== 'chain' && (
              <>
                {turns.length === 0 && (
                  <div className="rv-conf" role="group" aria-labelledby="rv-cf-l">
                    <span className="lab" id="rv-cf-l">
                      Fiducia
                    </span>
                    <Seg<ConfKey>
                      label="Fiducia"
                      track="plain"
                      value={confidence !== null ? (String(confidence) as ConfKey) : null}
                      onChange={(v) => setConfidence(Number(v))}
                      options={CONFIDENCE_OPTIONS}
                    />
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
                    disabled={
                      !state.ready || checking || (turns.length === 0 && confidence === null)
                    }
                    onClick={() => void check()}
                  >
                    {checking ? 'Correggo…' : turns.length ? 'Rispondi' : 'Verifica'}
                  </button>
                </div>
              </>
            )}
            {verdict && item.exercise.type !== 'chain' && (
              <div className="rv-reveal">
                <div className={`rv-verdict ${verdict.kind}`} role="status">
                  <b>{TITLE[verdict.kind]}</b>
                  <RichText md={verdict.feedback} />
                  {onPractice && !verdict.correct && (
                    <div className="rv-practice-act">
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => onPractice([item.conceptId])}
                      >
                        Allenati su questo
                      </button>
                    </div>
                  )}
                  {canContest && (
                    <div className="rv-contest">
                      <button
                        type="button"
                        className="link"
                        disabled={contesting || saving}
                        onClick={() => void handleContest()}
                      >
                        {contesting ? 'Contesto…' : 'Contesta la correzione'}
                      </button>
                    </div>
                  )}
                </div>
                <div className="rv-model">
                  <span className="lab">Risposta di riferimento</span>
                  <RichText md={item.exercise.answer} />
                </div>
                <div className="lab" id="rv-gl">
                  Quanto ti è costato ricordarlo?
                </div>
                <div className="rv-grade" role="group" aria-labelledby="rv-gl">
                  {GRADES.map(([g, label]) => {
                    const isAboveProposed = g > verdict.proposed
                    const disabled = !isFallback && isAboveProposed
                    return (
                      <button
                        key={g}
                        type="button"
                        aria-pressed={grade === g}
                        disabled={disabled}
                        onClick={() => setGrade(g)}
                      >
                        {g === verdict.proposed && <span className="sug">proposta</span>}
                        {label}
                      </button>
                    )
                  })}
                </div>
                {error && <p role="alert">{error}</p>}
                <div className="rv-foot">
                  <button
                    type="button"
                    className="link"
                    ref={peekTriggerRef}
                    onClick={() => setPeekItem(item)}
                  >
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
      {peekItem && (
        <NotePeek
          concept={{
            id: peekItem.conceptId,
            name: peekItem.name,
            birth: peekItem.notePath,
            statement:
              'exercise' in peekItem && peekItem.exercise && 'prompt' in peekItem.exercise
                ? (peekItem.exercise.answer ?? peekItem.exercise.prompt)
                : undefined
          }}
          notePath={peekItem.notePath}
          noteTitle={peekItem.noteTitle}
          triggerRef={peekTriggerRef}
          onClose={() => setPeekItem(null)}
          onOpenNote={(path) => {
            setPeekItem(null)
            onOpenNote(path)
          }}
        />
      )}
    </ViewScene>
  )
}
