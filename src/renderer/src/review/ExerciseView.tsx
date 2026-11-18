import { useState } from 'react'
import type { ChainExercise, Exercise } from '../../../shared/exercise-schema'
import { RichText } from '../session/RichText'
import { Choice, TrueFalse } from './exercises/Choice'
import { Explain } from './exercises/Explain'
import { GraphExercise } from './exercises/GraphExercise'
import { Estimate, Fill, Match, Open } from './exercises/Inputs'
import type { ExerciseState } from './exercises/shared'
import { Order, SpotError } from './exercises/Steps'

export type { ExerciseState }

/** One exercise: it reports its state; the review card decides when to check it. */
export function ExerciseView({
  exercise,
  locked,
  followUp = false,
  onChange,
  onRecordChain,
  onSkipChain
}: {
  exercise: Exercise
  locked: boolean
  /** "Spiegalo tu" only: answering a question of the picky student. */
  followUp?: boolean
  onChange: (s: ExerciseState) => void
  onRecordChain?: (checked: boolean[]) => void
  onSkipChain?: () => void
}): React.JSX.Element {
  switch (exercise.type) {
    case 'mc':
    case 'counterexample':
      return <Choice exercise={exercise} locked={locked} onChange={onChange} />
    case 'truefalse':
      return <TrueFalse exercise={exercise} locked={locked} onChange={onChange} />
    case 'order':
      return <Order exercise={exercise} locked={locked} onChange={onChange} />
    case 'spoterror':
      return <SpotError exercise={exercise} locked={locked} onChange={onChange} />
    case 'fill':
      return <Fill exercise={exercise} locked={locked} onChange={onChange} />
    case 'match':
      return <Match exercise={exercise} locked={locked} onChange={onChange} />
    case 'estimate':
      return <Estimate exercise={exercise} locked={locked} onChange={onChange} />
    case 'graph':
      return <GraphExercise exercise={exercise} onChange={onChange} />
    case 'open':
      return <Open locked={locked} onChange={onChange} />
    case 'explain':
      return <Explain locked={locked} followUp={followUp} onChange={onChange} />
    case 'chain':
      return (
        <ChainExerciseView
          exercise={exercise}
          locked={locked}
          onRecord={onRecordChain}
          onSkip={onSkipChain}
        />
      )
  }
}

function ChainExerciseView({
  exercise,
  locked,
  onRecord,
  onSkip
}: {
  exercise: ChainExercise
  locked: boolean
  onRecord?: (checked: boolean[]) => void
  onSkip?: () => void
}): React.JSX.Element {
  const [answer, setAnswer] = useState('')
  const [committed, setCommitted] = useState(false)
  const [checked, setChecked] = useState<boolean[]>(() => exercise.ideaUnits.map(() => false))

  const toggleCheck = (idx: number): void => {
    if (locked) return
    setChecked((prev) => {
      const next = [...prev]
      next[idx] = !next[idx]
      return next
    })
  }

  const fraction = exercise.ideaUnits.length
    ? checked.filter(Boolean).length / exercise.ideaUnits.length
    : 0
  const estimatedGrade = fraction === 0 ? 1 : fraction < 0.5 ? 2 : 3

  return (
    <div className="rv-chain">
      <div className="rv-chain-flow">
        <div className="rv-chain-premises">
          <span className="lab">Premesse</span>
          {exercise.premises.map((p) => (
            <div key={p.id} className="rv-chain-step">
              <strong>
                <RichText md={p.name} inline />
              </strong>
              <RichText md={p.statement} />
            </div>
          ))}
        </div>
        <div className="rv-chain-arrow" aria-hidden="true">
          ⇒
        </div>
        <div className="rv-chain-conclusion">
          <span className="lab">Conclusione</span>
          <div className="rv-chain-step conclusion">
            <strong>
              <RichText md={exercise.conclusion.name} inline />
            </strong>
            <RichText md={exercise.conclusion.statement} />
          </div>
        </div>
      </div>

      {!committed ? (
        <div className="rv-chain-input">
          <label className="lab" htmlFor="rv-chain-answer">
            La tua spiegazione prima di vedere i passaggi chiave
          </label>
          <div className="mic-field">
            <textarea
              id="rv-chain-answer"
              value={answer}
              placeholder="Perché le premesse implicano la conclusione? Scrivi qui la tua risposta prima di rivelare..."
              onChange={(e) => setAnswer(e.target.value)}
              disabled={locked}
            />
          </div>
          <div className="rv-acts">
            <button
              type="button"
              className="pri"
              disabled={locked || !answer.trim()}
              onClick={() => setCommitted(true)}
            >
              Conferma risposta
            </button>
          </div>
        </div>
      ) : (
        <div className="rv-chain-committed">
          <div className="rv-chain-my-answer">
            <span className="lab">La tua risposta confermata</span>
            <p>{answer}</p>
          </div>

          <div className="rv-chain-checklist">
            <div className="rv-chain-check-head">
              <span className="lab">Punti chiave da verificare</span>
              <span className="rv-chain-badge">Voto massimo: 3 (Bene) · Proposto: {estimatedGrade}</span>
            </div>
            <ul className="rv-chain-units" aria-label="Punti chiave">
              {exercise.ideaUnits.map((unit, idx) => (
                <li key={idx} className="rv-chain-unit">
                  <label>
                    <input
                      type="checkbox"
                      checked={checked[idx]}
                      onChange={() => toggleCheck(idx)}
                      disabled={locked}
                    />
                    <span>
                      <RichText md={unit} inline />
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          {!locked && (
            <div className="rv-acts">
              <button
                type="button"
                className="ghost"
                onClick={onSkip}
              >
                Salta senza registrare
              </button>
              <button
                type="button"
                className="pri"
                onClick={() => onRecord?.(checked)}
              >
                Registra
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
