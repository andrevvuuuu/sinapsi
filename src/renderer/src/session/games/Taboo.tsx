import { useId, useRef, useState } from 'react'
import type { Game } from '../../../../shared/teacher-protocol'
import { useDictation } from '../../components/dictation'
import { DictationError, MicButton } from '../../components/MicButton'
import { RichText } from '../RichText'
import { clip, type GameProps } from './shared'
import { tabooUsed } from './taboo-words'

type Taboo = Extract<Game, { type: 'taboo' }>

/** Tabù: explain the concept without the forbidden words; the tutor judges the explanation. */
export function Taboo({ game, onDone }: GameProps<Taboo>): React.JSX.Element {
  const [text, setText] = useState('')
  const used = tabooUsed(game.forbidden, text)
  const uid = useId()
  const field = useRef<HTMLTextAreaElement>(null)
  const dictation = useDictation({ target: field, value: text, onChange: setText })
  const busy = dictation.state !== 'idle'
  return (
    <div className="g-taboo">
      <p className="g-concept">
        Spiega <b>{game.concept}</b> senza dire:
      </p>
      <div className="g-forbidden">
        {game.forbidden.map((f) => (
          <span key={f} className={'chip' + (used.includes(f) ? ' no' : '')}>
            <RichText md={f} className="inline" />
          </span>
        ))}
      </div>
      <div className="g-why">
        <label htmlFor={`${uid}-text`}>La tua spiegazione</label>
        <div className="mic-field">
          <textarea
            id={`${uid}-text`}
            ref={field}
            readOnly={busy}
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <MicButton dictation={dictation} />
        </div>
      </div>
      <DictationError dictation={dictation} />
      {used.length > 0 && (
        <p className="g-fb no" role="alert">
          Hai usato: {used.join(', ')}
        </p>
      )}
      <button
        type="button"
        className="pri"
        disabled={busy || !text.trim() || used.length > 0}
        onClick={() => onDone({ score: 0, total: 0, detail: clip(`spiegazione: ${text.trim()}`) })}
      >
        Invia la spiegazione
      </button>
    </div>
  )
}
