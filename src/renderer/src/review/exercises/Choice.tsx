import { useState } from 'react'
import type { Exercise } from '../../../../shared/exercise-schema'
import { RichText } from '../../session/RichText'
import type { ExerciseState } from './shared'

const LETTERS = 'ABCDEF'
type Pick = Extract<Exercise, { type: 'mc' | 'counterexample' }>

export function Choice({ exercise, locked, onChange }: { exercise: Pick; locked: boolean; onChange: (s: ExerciseState) => void }): React.JSX.Element {
  const [pick, setPick] = useState<number | null>(null)
  return (
    <div className="rv-opts" role="group" aria-label="Opzioni">
      {exercise.options.map((o, k) => (
        <button
          key={k}
          type="button"
          className="opt"
          aria-pressed={pick === k}
          disabled={locked}
          data-state={locked ? (k === exercise.correct ? 'ok' : k === pick ? 'no' : undefined) : undefined}
          onClick={() => {
            setPick(k)
            onChange({ answer: o, correct: k === exercise.correct, ready: true })
          }}
        >
          <span className="k" aria-hidden="true">
            {LETTERS[k]}
          </span>
          <RichText md={o} className="inline" />
        </button>
      ))}
    </div>
  )
}

export function TrueFalse({ exercise, locked, onChange }: { exercise: Extract<Exercise, { type: 'truefalse' }>; locked: boolean; onChange: (s: ExerciseState) => void }): React.JSX.Element {
  const [value, setValue] = useState<boolean | null>(null)
  const [why, setWhy] = useState('')
  const report = (v: boolean | null, w: string): void => {
    if (v === null) return
    onChange({ answer: `${v ? 'Vero' : 'Falso'}${w.trim() ? ` — ${w.trim()}` : ''}`, correct: v === exercise.value, ready: true })
  }
  return (
    <div className="rv-tf">
      <blockquote>
        <RichText md={exercise.statement} />
      </blockquote>
      <div className="rv-seg" role="group" aria-label="Vero o falso">
        {[true, false].map((v) => (
          <button
            key={String(v)}
            type="button"
            aria-pressed={value === v}
            disabled={locked}
            data-state={locked ? (v === exercise.value ? 'ok' : v === value ? 'no' : undefined) : undefined}
            onClick={() => {
              setValue(v)
              report(v, why)
            }}
          >
            {v ? 'Vero' : 'Falso'}
          </button>
        ))}
      </div>
      <label className="lab" htmlFor="rv-why">
        Perché?
      </label>
      <textarea
        id="rv-why"
        value={why}
        readOnly={locked}
        placeholder="Il motivo, in una riga"
        onChange={(e) => {
          setWhy(e.target.value)
          report(value, e.target.value)
        }}
      />
    </div>
  )
}
