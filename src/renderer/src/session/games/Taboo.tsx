import { useState } from 'react'
import type { Game } from '../../../../shared/teacher-protocol'
import { RichText } from '../RichText'
import { norm, type GameProps } from './shared'

type Taboo = Extract<Game, { type: 'taboo' }>

/** Tabù: explain the concept without the forbidden words; the tutor judges the explanation. */
export function Taboo({ game, onDone }: GameProps<Taboo>): React.JSX.Element {
  const [text, setText] = useState('')
  const words = norm(text).split(/[^a-z0-9]+/)
  // A forbidden word counts with any ending: "limite" catches "limiti".
  const used = game.forbidden.filter((f) => {
    const stem = norm(f).slice(0, Math.max(4, norm(f).length - 2))
    return words.some((w) => w.startsWith(stem))
  })
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
      <button type="button" className="pri" disabled={!text.trim() || used.length > 0} onClick={() => onDone({ score: 1, total: 1, detail: `spiegazione: ${text.trim()}` })}>
        Invia la spiegazione
      </button>
    </div>
  )
}
