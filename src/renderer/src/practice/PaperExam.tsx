import { useEffect, useState } from 'react'
import type { PracticeState } from '../../../main/practice/events'
import { calibrationLine, calibrationOf, calibrationTrend, type CalibrationExam } from '../../../shared/calibration'
import { RichText } from '../session/RichText'
import { PhotoButton } from './PhotoButton'
import { fmtPoints } from './exam-format'

const MAX = 20_000

/** The points Andrea gives a problem, on the grader's scale, before writing out the answer. Once given they stay. */
function SelfGrade({ index, max, given, onGive }: { index: number; max: number; given?: number; onGive: (points: number) => Promise<void> }): React.JSX.Element {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const n = Number(value.replace(',', '.'))
  const valid = value.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= max && Number.isInteger(n * 2)
  if (given !== undefined)
    return (
      <p className="pr-self given">
        <span className="lab">Il tuo voto</span> <b>{`${fmtPoints(given)} / ${fmtPoints(max)}`}</b>
      </p>
    )
  return (
    <div className="pr-self">
      <label className="lab" htmlFor={`self-${index}`}>
        Il tuo voto, prima della correzione
      </label>
      <div className="row">
        <input
          id={`self-${index}`}
          type="text"
          inputMode="decimal"
          placeholder="0"
          aria-label={`Il tuo voto all’esercizio ${index + 1}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <span className="mt-hint">{`/ ${fmtPoints(max)} punti, anche mezzi`}</span>
        <span className="sp" />
        <button
          type="button"
          className="ghost"
          disabled={!valid || busy}
          onClick={() => {
            setBusy(true)
            void onGive(n).finally(() => setBusy(false))
          }}
        >
          Conferma il mio voto
        </button>
      </div>
    </div>
  )
}

/** After the pens are down: solution, self-grade, then the answer copied from the sheet. */
export function PaperReview({
  state,
  answers,
  setAnswers,
  onDeliver,
  alert
}: {
  state: PracticeState
  answers: Record<string, string>
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, string>>>
  onDeliver: () => void
  alert: string | null
}): React.JSX.Element {
  const api = window.sinapsi.practice
  const exam = state.exam!
  const self = exam.self ?? {}
  const missing = exam.sheet.problems.filter((p) => !(p.id in self)).length
  const append = (id: string, t: string): void => setAnswers((a) => ({ ...a, [id]: [a[id]?.trim(), t].filter(Boolean).join('\n\n').slice(0, MAX) }))
  return (
    <>
      <h2 className="pr-sheet-title">Penne giù</h2>
      <p className="mt-hint">
        Per ogni esercizio confronta il tuo foglio con la soluzione e datti un voto, onesto, prima di vedere la correzione. Poi ricopia o fotografa la tua risposta: la correzione arriva quando tutti gli esercizi hanno il tuo voto.
      </p>
      {exam.sheet.problems.map((p, i) => (
        <section key={p.id} className="card pr-ex" aria-label={`Esercizio ${i + 1}`}>
          <div className="pr-cardhead">
            <span className="lab">Esercizio {i + 1}</span>
            <span className="lab">{fmtPoints(p.points)} punti</span>
          </div>
          <RichText md={p.statement} />
          {p.modelSolution && (
            <div className="sol">
              <div className="lab">Soluzione modello</div>
              <RichText md={p.modelSolution} />
            </div>
          )}
          <div className="sol">
            <SelfGrade index={i} max={p.points} given={self[p.id]} onGive={(points) => api.examSelf(state.id, p.id, points)} />
          </div>
          {p.id in self && (
            <>
              <div className="work">
                <textarea
                  aria-label={`Risposta all’esercizio ${i + 1}`}
                  maxLength={MAX}
                  placeholder="Ricopia qui la soluzione scritta sul foglio (LaTeX con $…$) o fotografala."
                  value={answers[p.id] ?? ''}
                  onChange={(e) => setAnswers((a) => ({ ...a, [p.id]: e.target.value }))}
                />
              </div>
              <div className="row">
                <PhotoButton sessionId={state.id} onText={(t) => append(p.id, t)} />
              </div>
            </>
          )}
        </section>
      ))}
      {alert && (
        <p className="pr-alert" role="alert">
          {alert}
        </p>
      )}
      <div className="row">
        {missing > 0 && <span className="mt-hint">{missing === 1 ? 'Manca il tuo voto su 1 esercizio.' : `Manca il tuo voto su ${missing} esercizi.`}</span>}
        <span className="sp" />
        <button
          type="button"
          className="pri exam"
          disabled={missing > 0}
          onClick={() => {
            const empty = exam.sheet.problems.filter((p) => !answers[p.id]?.trim()).length
            const ask = empty ? `${empty === 1 ? 'Un esercizio è' : `${empty} esercizi sono`} senza risposta e varranno 0. Mandare alla correzione?` : 'Mandare alla correzione? Dopo non potrai più modificare le risposte.'
            if (window.confirm(ask)) onDeliver()
          }}
        >
          Correggi
        </button>
      </div>
    </>
  )
}

const fmtDate = (at: number): string => new Date(at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
const signed = (n: number): string => (n > 0 ? '+' : n < 0 ? '−' : '') + fmtPoints(Math.abs(n))

/** Self-grade against the grader's, for this exam and for every paper exam so far. */
export function CalibrationPanel({ state }: { state: PracticeState }): React.JSX.Element | null {
  const [history, setHistory] = useState<CalibrationExam[] | null>(null)
  const g = state.exam?.grade
  useEffect(() => {
    let live = true
    void window.sinapsi.practice.calibration().then((h) => live && setHistory(h), () => live && setHistory([]))
    return () => {
      live = false
    }
  }, [state.id])
  if (!g || !state.exam) return null
  const items = g.items.flatMap((it, i) => (it.self === undefined ? [] : [{ id: it.id, max: state.exam!.sheet.problems[i]?.points ?? 0, self: it.self, ai: it.points }]))
  const c = calibrationOf(items)
  const past = history ?? []
  const trend = calibrationTrend(past)
  return (
    <section className="card pr-calib" aria-label="Calibrazione">
      <span className="lab">Calibrazione</span>
      <p className="pr-calib-totals">
        Il tuo voto <b>{c.selfTotal}/30</b> · correzione <b>{g.total}/30</b>
      </p>
      <p>{calibrationLine(c)}</p>
      {past.length > 1 && (
        <>
          <div className="lab">Nel tempo</div>
          <ol className="pr-calib-list">
            {past.slice(-8).map((e) => {
              const x = calibrationOf(e.items)
              return (
                <li key={e.id} aria-current={e.id === state.id ? 'true' : undefined}>
                  <span>{fmtDate(e.at)}</span>
                  <span className="pr-calib-topic">{e.topic}</span>
                  <span>{`${x.selfTotal} → ${x.aiTotal}`}</span>
                  <span className={'chip ' + (Math.abs(x.bias) < 0.5 ? 'ok' : x.bias > 0 ? 'no' : 'mid')}>{signed(x.bias)}</span>
                </li>
              )
            })}
          </ol>
          <p className="mt-hint">{`Su ${past.length} simulazioni a carta — ${calibrationLine(trend)}`}</p>
        </>
      )}
    </section>
  )
}
