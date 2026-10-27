import { useMemo, useState } from 'react'
import type { Exercise } from '../../../../shared/exercise-schema'
import { RichText } from '../../session/RichText'
import { plain, shuffled, type ExerciseState } from './shared'

export function Order({ exercise, locked, onChange }: { exercise: Extract<Exercise, { type: 'order' }>; locked: boolean; onChange: (s: ExerciseState) => void }): React.JSX.Element {
  const start = useMemo(() => shuffled(exercise.steps, exercise.prompt + exercise.steps.join('|')), [exercise])
  const [order, setOrder] = useState(start)
  const report = (o: number[]): void => onChange({ answer: o.map((i) => exercise.steps[i]).join(' → '), correct: o.every((v, i) => v === i), ready: true })
  const move = (pos: number, d: -1 | 1): void => {
    const o = [...order]
    const j = pos + d
    if (j < 0 || j >= o.length) return
    ;[o[pos], o[j]] = [o[j], o[pos]]
    setOrder(o)
    report(o)
  }
  return (
    <ol className="rv-order">
      {order.map((i, pos) => (
        <li key={i} data-state={locked ? (i === pos ? 'ok' : 'no') : undefined}>
          <span className="txt">{exercise.steps[i]}</span>
          <span className="mv">
            <button type="button" aria-label={`Sposta su: ${plain(exercise.steps[i])}`} disabled={locked || pos === 0} onClick={() => move(pos, -1)}>
              ↑
            </button>
            <button type="button" aria-label={`Sposta giù: ${plain(exercise.steps[i])}`} disabled={locked || pos === order.length - 1} onClick={() => move(pos, 1)}>
              ↓
            </button>
          </span>
        </li>
      ))}
    </ol>
  )
}

export function SpotError({ exercise, locked, onChange }: { exercise: Extract<Exercise, { type: 'spoterror' }>; locked: boolean; onChange: (s: ExerciseState) => void }): React.JSX.Element {
  const [pick, setPick] = useState<number | null>(null)
  return (
    <div className="rv-steps" role="group" aria-label="Passi">
      {exercise.steps.map((s, k) => (
        <button
          key={k}
          type="button"
          aria-pressed={pick === k}
          disabled={locked}
          data-state={locked ? (k === exercise.wrong ? 'ok' : k === pick ? 'no' : undefined) : undefined}
          onClick={() => {
            setPick(k)
            onChange({ answer: `Passo ${k + 1}: ${s}`, correct: k === exercise.wrong, ready: true })
          }}
        >
          <b>{k + 1}</b>
          <RichText md={s} className="inline" />
        </button>
      ))}
      {locked && <p className="rv-why">{exercise.why}</p>}
    </div>
  )
}
