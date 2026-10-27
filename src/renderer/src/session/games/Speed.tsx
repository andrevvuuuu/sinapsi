import { useEffect, useRef, useState } from 'react'
import type { Game } from '../../../../shared/teacher-protocol'
import { RichText } from '../RichText'
import type { GameProps } from './shared'

const SECONDS = 8
const FEEDBACK_MS = 1200
type Speed = Extract<Game, { type: 'speed' }>

/** Lampo: true or false against the clock, one statement at a time. */
export function Speed({ game, onDone }: GameProps<Speed>): React.JSX.Element {
  const [i, setI] = useState(0)
  const [answers, setAnswers] = useState<(boolean | null)[]>([])
  const [feedback, setFeedback] = useState<{ right: boolean; timeout: boolean } | null>(null)
  const done = i >= game.items.length
  const answered = useRef(-1)

  const answer = (value: boolean | null): void => {
    // One answer per statement, whatever the clicks or the timer do.
    if (answered.current === i || done) return
    answered.current = i
    const item = game.items[i]
    setAnswers((a) => [...a, value])
    setFeedback({ right: value === item.true, timeout: value === null })
  }
  useEffect(() => {
    if (done || feedback) return
    const t = setTimeout(() => answer(null), SECONDS * 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, feedback, done])
  useEffect(() => {
    if (!feedback) return
    const t = setTimeout(() => {
      setFeedback(null)
      setI((x) => x + 1)
    }, FEEDBACK_MS)
    return () => clearTimeout(t)
  }, [feedback])
  useEffect(() => {
    if (done || feedback) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'v' || e.key === 'ArrowLeft') answer(true)
      if (e.key === 'f' || e.key === 'ArrowRight') answer(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, feedback, done])

  const score = answers.filter((a, k) => a === game.items[k].true).length
  if (done) {
    const misses = game.items.map((it, k) => ({ it, a: answers[k] })).filter((x) => x.a !== x.it.true)
    return (
      <div className="g-end">
        <p className="g-score">{`${score}/${game.items.length}`}</p>
        {misses.map(({ it, a }, k) => (
          <div key={k} className="g-miss">
            <RichText md={it.statement} className="inline" /> — {it.true ? 'vero' : 'falso'}
            {a === null ? ' (tempo scaduto)' : ''}. <RichText md={it.why} className="inline" />
          </div>
        ))}
        <button
          type="button"
          className="pri"
          onClick={() =>
            onDone({ score, total: game.items.length, detail: misses.length ? `sbagliate: ${misses.map(({ it, a }) => `«${it.statement}»${a === null ? ' (tempo scaduto)' : ''}`).join('; ')}` : 'tutte giuste' })
          }
        >
          Continua
        </button>
      </div>
    )
  }
  const item = game.items[i]
  let streak = 0
  for (let k = answers.length - 1; k >= 0 && answers[k] === game.items[k].true; k--) streak++
  return (
    <div className="g-speed">
      <p className="g-status" role="status">
        {`Affermazione ${i + 1} / ${game.items.length}`}
        {streak > 1 ? ` · serie ${streak}` : ''}
      </p>
      <div className="g-timer" aria-hidden="true">
        <i key={i} className={feedback ? 'stop' : ''} style={{ animationDuration: `${SECONDS}s` }} />
      </div>
      <div className="g-statement">
        <RichText md={item.statement} />
      </div>
      {feedback ? (
        <p className={'g-fb ' + (feedback.right ? 'ok' : 'no')}>
          {feedback.timeout ? 'Tempo scaduto' : feedback.right ? 'Giusto' : 'Sbagliato'} — <RichText md={item.why} className="inline" />
        </p>
      ) : (
        <div className="g-tf">
          <button type="button" className="g-true" onClick={() => answer(true)}>
            Vero
          </button>
          <button type="button" className="g-false" onClick={() => answer(false)}>
            Falso
          </button>
        </div>
      )}
    </div>
  )
}
