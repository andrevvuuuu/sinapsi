import { useState } from 'react'
import type { Game } from '../../../../shared/teacher-protocol'
import { RichText } from '../RichText'
import { clip, type GameProps } from './shared'
import { tabooUsed } from './taboo-words'

type Taboo = Extract<Game, { type: 'taboo' }>

/** Tabù: explain the concept without the forbidden words; the tutor judges the explanation. */
export function Taboo({ game, onDone }: GameProps<Taboo>): React.JSX.Element {
  const [text, setText] = useState('')
  const used = tabooUsed(game.forbidden, text)
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
      <label className="g-why">
        La tua spiegazione
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {used.length > 0 && (
        <p className="g-fb no" role="alert">
          Hai usato: {used.join(', ')}
        </p>
      )}
      <button type="button" className="pri" disabled={!text.trim() || used.length > 0} onClick={() => onDone({ score: 0, total: 0, detail: clip(`spiegazione: ${text.trim()}`) })}>
        Invia la spiegazione
      </button>
    </div>
  )
}
