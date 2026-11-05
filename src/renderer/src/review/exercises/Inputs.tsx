import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { parseItalianNumber } from '../../../../shared/numbers'
import { useDictation } from '../../components/dictation'
import { DictationError, MicButton } from '../../components/MicButton'
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
            const v = parseItalianNumber(e.target.value)
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
  const field = useRef<HTMLTextAreaElement>(null)
  const textRef = useRef('')
  const busyRef = useRef(false)
  // While the answer is being dictated it is not ready: what is being said is still missing.
  const update = (t: string): void => {
    textRef.current = t
    setText(t)
    onChange({ answer: t, correct: null, ready: !busyRef.current && t.trim() !== '' })
  }
  const dictation = useDictation({ target: field, value: text, onChange: update, enabled: !locked })
  const busy = dictation.state !== 'idle'
  const onChangeRef = useRef(onChange)
  useLayoutEffect(() => {
    onChangeRef.current = onChange
  })
  useEffect(() => {
    if (busyRef.current === busy) return
    busyRef.current = busy
    const t = textRef.current
    onChangeRef.current({ answer: t, correct: null, ready: !busy && t.trim() !== '' })
  }, [busy])
  return (
    <div className="rv-open">
      <label className="lab" htmlFor="rv-open">
        La tua risposta, ragionando ad alta voce
      </label>
      <div className="mic-field">
        <textarea
          id="rv-open"
          ref={field}
          value={text}
          readOnly={locked || busy}
          placeholder="Scrivi come ti viene, anche disordinato. Conta il ragionamento."
          onChange={(e) => update(e.target.value)}
        />
        {!locked && <MicButton dictation={dictation} />}
      </div>
      <DictationError dictation={dictation} />
    </div>
  )
}
