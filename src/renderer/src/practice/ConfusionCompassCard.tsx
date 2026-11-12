import { useState } from 'react'
import type { Submission } from '../../../shared/practice-protocol'

export function ConfusionCompassCard({
  disabled,
  onSend
}: {
  disabled: boolean
  onSend: (s: Submission) => Promise<unknown>
}): React.JSX.Element {
  const [known, setKnown] = useState('')
  const [stuck, setStuck] = useState('')
  const [question, setQuestion] = useState('')
  const ready = !!stuck.trim() && !!question.trim()
  return (
    <div className="compass-card" aria-label="Bussola della confusione">
      <label htmlFor="pr-compass-known">Cosa so già</label>
      <textarea
        id="pr-compass-known"
        value={known}
        onChange={(e) => setKnown(e.target.value)}
        maxLength={2000}
      />
      <label htmlFor="pr-compass-stuck">Dove mi blocco</label>
      <textarea
        id="pr-compass-stuck"
        value={stuck}
        onChange={(e) => setStuck(e.target.value)}
        maxLength={2000}
      />
      <label htmlFor="pr-compass-question">La mia domanda precisa</label>
      <textarea
        id="pr-compass-question"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        maxLength={1000}
      />
      <button
        type="button"
        className="ghost warn"
        disabled={disabled || !ready}
        onClick={() =>
          void onSend({
            kind: 'compass',
            compass: { known, stuck: stuck.trim(), question: question.trim() }
          })
        }
      >
        Chiedi l'indizio
      </button>
    </div>
  )
}
