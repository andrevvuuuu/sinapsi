import { useEffect, useRef, useState } from 'react'
import type { PracticeState } from '../../../main/practice/events'
import { RichText } from '../session/RichText'
import { PhotoButton } from './PhotoButton'
import { filled, fmtClock, fmtPoints, lastError } from './exam-format'

const SAVE_EVERY = 10_000

export function ExamView({ state, onBack, onStarted }: { state: PracticeState; onBack: () => void; onStarted: (id: string) => void }): React.JSX.Element {
  const api = window.sinapsi.practice
  const exam = state.exam
  const [answers, setAnswers] = useState<Record<string, string>>(() => exam?.answers ?? {})
  const [now, setNow] = useState(() => Date.now())
  const saved = useRef(JSON.stringify(filled(exam?.answers ?? {})))
  const delivered = useRef(false)
  const latest = useRef(answers)
  useEffect(() => {
    latest.current = answers
  }, [answers])
  const MAX = 20_000
  const running = !!exam && !exam.delivered

  const [alert, setAlert] = useState<string | null>(null)
  const deliver = (): void => {
    if (delivered.current) return
    delivered.current = true
    setAlert(null)
    api.examDeliver(state.id, filled(latest.current)).catch((e: unknown) => {
      delivered.current = false
      setAlert(`Consegna non riuscita: ${(e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`)
    })
  }

  useEffect(() => {
    if (!running) return
    const tick = setInterval(() => setNow(Date.now()), 500)
    const flush = (): void => {
      const json = JSON.stringify(filled(latest.current))
      if (json === saved.current || delivered.current) return
      void api.examSave(state.id, filled(latest.current)).then(() => (saved.current = json), () => undefined)
    }
    const save = setInterval(flush, SAVE_EVERY)
    window.addEventListener('beforeunload', flush)
    return () => {
      clearInterval(tick)
      clearInterval(save)
      window.removeEventListener('beforeunload', flush)
      // Leaving the exam (← Home) keeps what was typed since the last save.
      flush()
    }
  }, [api, running, state.id])

  // Never more than the chosen length (the clocks of window and app differ by a few ms).
  const left = exam ? Math.min(exam.endsAt - now, (state.durationMin ?? 0) * 60_000 || Infinity) : 0
  useEffect(() => {
    if (running && left <= 0) deliver()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, left <= 0])

  const header = (
    <header className="pr-top drag">
      <button type="button" className="pill nodrag back-btn" onClick={onBack}>
        ← Home
      </button>
      <h1>Simulazione d’esame</h1>
      <span className="lab">{state.topic}</span>
      <span className="sp" />
      {running && (
        <span className={'timer' + (left < 5 * 60_000 ? ' low' : '')} role="timer" aria-label="Tempo rimanente">
          {fmtClock(left)}
        </span>
      )}
    </header>
  )

  if (!exam)
    return (
      <div className="pr">
        {header}
        <div className="pr-col">
          {state.awaiting === 'retry' ? (
            <div className="pr-err">
              <p>{lastError(state) ?? 'Il compito non è stato preparato.'}</p>
              <button type="button" className="ghost" onClick={() => void api.retry(state.id)}>
                Riprova
              </button>
            </div>
          ) : (
            <p className="pr-pending" role="status">
              Preparo il compito ({state.durationMin} min)… di solito ci vuole un minuto. Il tempo parte quando è pronto.
            </p>
          )}
        </div>
      </div>
    )

  if (exam.grade) {
    const g = exam.grade
    const missed = exam.sheet.problems.filter((p, i) => (g.items[i]?.points ?? 0) < p.points).flatMap((p) => p.targets)
    return (
      <div className="pr">
        {header}
        <div className="pr-col">
          <section className="pr-grade" aria-label="Voto">
            <span className="lab">Voto</span>
            <p className="pr-mark">{g.lode ? '30 e lode' : `${g.total}/30`}</p>
            <p>{g.note}</p>
          </section>
          {exam.sheet.problems.map((p, i) => {
            const it = g.items.find((x) => x.id === p.id)
            const pts = it?.points ?? 0
            return (
              <article key={p.id} className="card" aria-label={`Esercizio ${i + 1}`}>
                <div className="pr-cardhead">
                  <span className="lab">Esercizio {i + 1}</span>
                  <span className={'chip ' + (pts >= p.points ? 'ok' : pts >= p.points / 2 ? 'mid' : 'no')}>{`${fmtPoints(pts)} / ${fmtPoints(p.points)}`}</span>
                </div>
                <RichText md={p.statement} />
                {it?.comment && <p className="verdict">{it.comment}</p>}
                <div className="sol">
                  <div className="lab">La tua risposta</div>
                  {exam.answers[p.id]?.trim() ? <RichText md={exam.answers[p.id]} /> : <p className="mt-hint">(nessuna risposta)</p>}
                </div>
                {p.modelSolution && (
                  <div className="sol">
                    <div className="lab">Soluzione di riferimento</div>
                    <RichText md={p.modelSolution} />
                  </div>
                )}
              </article>
            )
          })}
          <div className="row">
            <button type="button" className="ghost" onClick={onBack}>
              Torna alla home
            </button>
            <span className="sp" />
            {g.total < 30 && (
              <button
                type="button"
                className="pri"
                onClick={() =>
                  void api.create(missed.length ? { conceptIds: [...new Set(missed)], sourceIds: [], free: '' } : state.material).then(onStarted)
                }
              >
                Ritesta gli errori in allenamento
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (exam.delivered)
    return (
      <div className="pr">
        {header}
        <div className="pr-col">
          {state.awaiting === 'retry' ? (
            <div className="pr-err">
              <p>La correzione non è riuscita. Le tue risposte sono salve.</p>
              <button type="button" className="ghost" onClick={() => void api.retry(state.id)}>
                Riprova
              </button>
            </div>
          ) : (
            <p className="pr-pending" role="status">
              Consegnato. Correggo il compito…
            </p>
          )}
        </div>
      </div>
    )

  return (
    <div className="pr">
      {header}
      <div className="pr-col">
        <h2 className="pr-sheet-title">{exam.sheet.title}</h2>
        <p className="mt-hint">Niente indizi e niente correzione durante: rispondi come all’esame. Le risposte si salvano da sole; allo scadere del tempo il compito si consegna da solo.</p>
        {exam.sheet.problems.map((p, i) => (
          <section key={p.id} className="card pr-ex" aria-label={`Esercizio ${i + 1}`}>
            <div className="pr-cardhead">
              <span className="lab">Esercizio {i + 1}</span>
              <span className="lab">{fmtPoints(p.points)} punti</span>
            </div>
            <RichText md={p.statement} />
            <div className="work">
              <textarea
                aria-label={`Risposta all’esercizio ${i + 1}`}
                maxLength={MAX}
                placeholder="Scrivi qui la soluzione (LaTeX con $…$) o fotografa il foglio."
                value={answers[p.id] ?? ''}
                onChange={(e) => setAnswers((a) => ({ ...a, [p.id]: e.target.value }))}
              />
            </div>
            <div className="row">
              <PhotoButton sessionId={state.id} onText={(t) => setAnswers((a) => ({ ...a, [p.id]: [a[p.id]?.trim(), t].filter(Boolean).join('\n\n').slice(0, MAX) }))} />
            </div>
          </section>
        ))}
        {alert && (
          <p className="pr-alert" role="alert">
            {alert}
          </p>
        )}
        <div className="row">
          <span className="sp" />
          <button
            type="button"
            className="pri exam"
            onClick={() => {
              if (window.confirm('Consegnare il compito? Dopo non potrai più modificarlo.')) deliver()
            }}
          >
            Consegna
          </button>
        </div>
      </div>
    </div>
  )
}
