import { useMemo, useState } from 'react'
import { MathSelect } from '../../components/MathSelect'
import { blanks, type Exercise, blankParts } from '../../../../shared/exercise-schema'
import { RichText } from '../../session/RichText'
import { plain, shuffled, type ExerciseState } from './shared'

export function Fill({
  exercise,
  locked,
  onChange
}: {
  exercise: Extract<Exercise, { type: 'fill' }>
  locked: boolean
  onChange: (s: ExerciseState) => void
}): React.JSX.Element {
  const groups = useMemo(() => blanks(exercise.text), [exercise.text])
  const parts = blankParts(exercise.text)
  const [picked, setPicked] = useState<(number | null)[]>(groups.map(() => null))
  const choose = (g: number, v: number): void => {
    const p = [...picked]
    p[g] = v
    setPicked(p)
    onChange({
      answer: p.map((x, i) => (x === null ? '…' : groups[i].options[x])).join(' / '),
      correct: p.every((x, i) => x === groups[i].correct),
      ready: p.every((x) => x !== null)
    })
  }
  return (
    <p className="rv-fill">
      {parts.map((t, i) => (
        <span key={i}>
          <RichText md={t} className="inline" />
          {i < groups.length && (
            <MathSelect
              label={`Spazio ${i + 1}`}
              options={groups[i].options}
              value={picked[i] ?? null}
              disabled={locked}
              state={locked ? (picked[i] === groups[i].correct ? 'ok' : 'no') : undefined}
              onChange={(k) => choose(i, k)}
            />
          )}
        </span>
      ))}
    </p>
  )
}

export function Match({
  exercise,
  locked,
  onChange
}: {
  exercise: Extract<Exercise, { type: 'match' }>
  locked: boolean
  onChange: (s: ExerciseState) => void
}): React.JSX.Element {
  const rights = useMemo(
    () => shuffled(exercise.pairs, exercise.prompt).map((i) => exercise.pairs[i][1]),
    [exercise]
  )
  const [picked, setPicked] = useState<Record<number, string>>({})
  const choose = (i: number, v: string): void => {
    const p = { ...picked, [i]: v }
    setPicked(p)
    onChange({
      answer: exercise.pairs.map(([l], k) => `${l} → ${p[k] ?? '…'}`).join('; '),
      correct: exercise.pairs.every(([, r], k) => p[k] === r),
      ready: exercise.pairs.every((_, k) => p[k] !== undefined)
    })
  }
  return (
    <div className="rv-match">
      {exercise.pairs.map(([left, right], i) => (
        <div key={i} className="rv-pair">
          <span>{plain(left)}</span>
          <MathSelect
            label={plain(left)}
            options={rights}
            value={picked[i] === undefined ? null : rights.indexOf(picked[i])}
            disabled={locked}
            state={locked ? (picked[i] === right ? 'ok' : 'no') : undefined}
            onChange={(k) => choose(i, rights[k])}
          />
        </div>
      ))}
    </div>
  )
}

export function Estimate({
  exercise,
  locked,
  onChange
}: {
  exercise: Extract<Exercise, { type: 'estimate' }>
  locked: boolean
  onChange: (s: ExerciseState) => void
}): React.JSX.Element {
  const [text, setText] = useState('')
  return (
    <div className="rv-est">
      <label className="lab" htmlFor="rv-est">
        Il tuo valore
      </label>
      <span>
        <input
          id="rv-est"
          inputMode="decimal"
          value={text}
          readOnly={locked}
          onChange={(e) => {
            setText(e.target.value)
            const v = Number(e.target.value.trim().replace(/\s/g, '').replace(',', '.'))
            onChange({
              answer: e.target.value,
              correct: Number.isFinite(v) && Math.abs(v - exercise.value) <= exercise.tolerance,
              ready: e.target.value.trim() !== '' && Number.isFinite(v)
            })
          }}
        />
        {exercise.unit && <RichText md={exercise.unit} className="inline" />}
      </span>
    </div>
  )
}

export function Open({
  locked,
  onChange
}: {
  locked: boolean
  onChange: (s: ExerciseState) => void
}): React.JSX.Element {
  const [text, setText] = useState('')
  return (
    <div className="rv-open">
      <label className="lab" htmlFor="rv-open">
        La tua risposta, ragionando ad alta voce
      </label>
      <textarea
        id="rv-open"
        value={text}
        readOnly={locked}
        placeholder="Scrivi come ti viene, anche disordinato. Conta il ragionamento."
        onChange={(e) => {
          setText(e.target.value)
          onChange({ answer: e.target.value, correct: null, ready: e.target.value.trim() !== '' })
        }}
      />
    </div>
  )
}
