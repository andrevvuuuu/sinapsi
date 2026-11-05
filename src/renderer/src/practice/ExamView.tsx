import { useEffect, useRef, useState } from 'react'
import type { PracticeState } from '../../../main/practice/events'
import { RichText } from '../session/RichText'
import { PhotoButton } from './PhotoButton'
import { AnswerBox, CalibrationPanel, PaperReview } from './PaperExam'
import { stopRecording } from '../components/dictation'
import { useDictating } from './use-dictating'
import { filled, fmtClock, fmtPoints, lastError } from './exam-format'

const SAVE_EVERY = 10_000
/** When time is up during a dictation: how long the delivery waits for the transcription to land. */
export const TIME_UP_WAIT = 5_000

export function ExamView({
  state,
  onBack,
  onStarted
}: {
  state: PracticeState
  onBack: () => void
  onStarted: (id: string) => void
}): React.JSX.Element {
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
  const dictating = useDictating()
  const paper = !!state.paper
  // On paper the clock runs until the pens are down; the answers are written after that.
  const running = !!exam && !exam.delivered && !(paper && exam.handed)
  const writing = !!exam && !exam.delivered && (!paper || !!exam.handed)

  const [alert, setAlert] = useState<string | null>(null)
  const deliver = (): void => {
    if (delivered.current) return
    delivered.current = true
    setAlert(null)
    api.examDeliver(state.id, filled(latest.current)).catch((e: unknown) => {
      delivered.current = false
      setAlert(
        `Consegna non riuscita: ${(e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`
      )
    })
  }

  const handed = useRef(false)
  const hand = (): void => {
    if (handed.current) return
    handed.current = true
    api.examHand(state.id).catch(() => (handed.current = false))
  }

  useEffect(() => {
    if (!running) return
    const tick = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(tick)
  }, [running])

  useEffect(() => {
    if (!writing) return
    const flush = (): void => {
      const json = JSON.stringify(filled(latest.current))
      if (json === saved.current || delivered.current) return
      void api.examSave(state.id, filled(latest.current)).then(
        () => (saved.current = json),
        () => undefined
      )
    }
    const save = setInterval(flush, SAVE_EVERY)
    window.addEventListener('beforeunload', flush)
    return () => {
      clearInterval(save)
      window.removeEventListener('beforeunload', flush)
      // Leaving the exam (← Home) keeps what was typed since the last save.
      flush()
    }
  }, [api, writing, state.id])

  // Never more than the chosen length (the clocks of window and app differ by a few ms).
  const left = exam ? Math.min(exam.endsAt - now, (state.durationMin ?? 0) * 60_000 || Infinity) : 0
  // Time up: on paper the pens go down; on screen a dictation in progress stops first, and the delivery waits
  // (at most TIME_UP_WAIT) for its words to land in the answer.
  useEffect(() => {
    if (!running || left > 0) return
    if (paper) return hand()
    stopRecording()
    if (!dictating.any) return deliver()
    const t = setTimeout(deliver, TIME_UP_WAIT)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, left <= 0, dictating.any])

  const header = (
    <header className="pr-top drag glass glass-bar glass-text">
      <button type="button" className="pill nodrag back-btn" onClick={onBack}>
        ← Home
      </button>
      <h1>{paper ? 'Simulazione su carta' : 'Simulazione d’esame'}</h1>
      <span className="lab">{state.topic}</span>
      <span className="sp" />
      {running && (
        <span
          className={'timer' + (left < 5 * 60_000 ? ' low' : '')}
          role="timer"
          aria-label="Tempo rimanente"
        >
          {fmtClock(left)}
        </span>
      )}
    </header>
  )

  if (!exam)
    return (
      <div className="pr">
        {header}
        <div className="pr-col scroll-edge">
          {state.awaiting === 'retry' ? (
            <div className="pr-err">
              <p>{lastError(state) ?? 'Il compito non è stato preparato.'}</p>
              <button type="button" className="ghost" onClick={() => void api.retry(state.id)}>
                Riprova
              </button>
            </div>
          ) : (
            <p className="pr-pending" role="status">
              Preparo il compito ({state.durationMin} min)… di solito ci vuole un minuto. Il tempo
              parte quando è pronto.
            </p>
          )}
        </div>
      </div>
    )

  if (exam.grade) {
    const g = exam.grade
    const missed = exam.sheet.problems
      .filter((p, i) => (g.items[i]?.points ?? 0) < p.points)
      .flatMap((p) => p.targets)
    return (
      <div className="pr">
        {header}
        <div className="pr-col scroll-edge">
          <section className="pr-grade" aria-label="Voto">
            <span className="lab">Voto</span>
            <p className="pr-mark">{g.lode ? '30 e lode' : `${g.total}/30`}</p>
            <p>{g.note}</p>
          </section>
          {paper && <CalibrationPanel state={state} />}
          {exam.sheet.problems.map((p, i) => {
            const it = g.items.find((x) => x.id === p.id)
            const pts = it?.points ?? 0
            return (
              <article key={p.id} className="card" aria-label={`Esercizio ${i + 1}`}>
                <div className="pr-cardhead">
                  <span className="lab">Esercizio {i + 1}</span>
                  <span className="pr-chips">
                    {it?.self !== undefined && (
                      <span className="chip">{`tu ${fmtPoints(it.self)}`}</span>
                    )}
                    <span
                      className={
                        'chip ' + (pts >= p.points ? 'ok' : pts >= p.points / 2 ? 'mid' : 'no')
                      }
                    >{`${fmtPoints(pts)} / ${fmtPoints(p.points)}`}</span>
                  </span>
                </div>
                <RichText md={p.statement} />
                {it?.comment && <p className="verdict">{it.comment}</p>}
                <div className="sol">
                  <div className="lab">La tua risposta</div>
                  {exam.answers[p.id]?.trim() ? (
                    <RichText md={exam.answers[p.id]} />
                  ) : (
                    <p className="mt-hint">(nessuna risposta)</p>
                  )}
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
                  void api
                    .create(
                      missed.length
                        ? { conceptIds: [...new Set(missed)], sourceIds: [], free: '' }
                        : state.material
                    )
                    .then(onStarted)
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
        <div className="pr-col scroll-edge">
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

  if (paper && exam.handed)
    return (
      <div className="pr">
        {header}
        <div className="pr-col scroll-edge">
          <PaperReview
            state={state}
            answers={answers}
            setAnswers={setAnswers}
            onDeliver={deliver}
            alert={alert}
          />
        </div>
      </div>
    )

  if (paper)
    return (
      <div className="pr">
        {header}
        <div className="pr-col pr-paper scroll-edge">
          <h2 className="pr-sheet-title">{exam.sheet.title}</h2>
          <p className="mt-hint">
            A macchina spenta: scrivi tutto su carta, senza appunti né aiuti. Allo scadere, o quando
            consegni, vedrai le soluzioni e ti darai un voto prima della correzione.
          </p>
          {exam.sheet.problems.map((p, i) => (
            <section key={p.id} className="card pr-ex" aria-label={`Esercizio ${i + 1}`}>
              <div className="pr-cardhead">
                <span className="lab">Esercizio {i + 1}</span>
                <span className="lab">{fmtPoints(p.points)} punti</span>
              </div>
              <RichText md={p.statement} />
            </section>
          ))}
          <div className="row">
            <span className="sp" />
            <button
              type="button"
              className="pri exam"
              onClick={() => {
                if (window.confirm('Consegnare? Il tempo si ferma e vedrai le soluzioni.')) hand()
              }}
            >
              Ho finito: consegno
            </button>
          </div>
        </div>
      </div>
    )

  return (
    <div className="pr">
      {header}
      <div className="pr-col scroll-edge">
        <h2 className="pr-sheet-title">{exam.sheet.title}</h2>
        <p className="mt-hint">
          Niente indizi e niente correzione durante: rispondi come all’esame. Le risposte si salvano
          da sole; allo scadere del tempo il compito si consegna da solo.
        </p>
        {exam.sheet.problems.map((p, i) => (
          <section key={p.id} className="card pr-ex" aria-label={`Esercizio ${i + 1}`}>
            <div className="pr-cardhead">
              <span className="lab">Esercizio {i + 1}</span>
              <span className="lab">{fmtPoints(p.points)} punti</span>
            </div>
            <RichText md={p.statement} />
            <AnswerBox
              id={p.id}
              index={i}
              value={answers[p.id] ?? ''}
              placeholder="Scrivi qui la soluzione (LaTeX con $…$) o fotografa il foglio."
              onChange={(v) => setAnswers((a) => ({ ...a, [p.id]: v }))}
              onBusy={dictating.report}
            />
            <div className="row">
              <PhotoButton
                sessionId={state.id}
                onText={(t) =>
                  setAnswers((a) => ({
                    ...a,
                    [p.id]: [a[p.id]?.trim(), t].filter(Boolean).join('\n\n').slice(0, MAX)
                  }))
                }
              />
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
            disabled={dictating.any}
            onClick={() => {
              if (window.confirm('Consegnare il compito? Dopo non potrai più modificarlo.'))
                deliver()
            }}
          >
            Consegna
          </button>
        </div>
      </div>
    </div>
  )
}
