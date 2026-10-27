import { useState } from 'react'
import type { Game } from '../../../../shared/teacher-protocol'
import { RichText } from '../RichText'
import type { GameProps } from './shared'

type Spot = Extract<Game, { type: 'spot' }>

/** Trova l'intruso: one line of the derivation is wrong — tap it and say why. */
export function Spot({ game, onDone }: GameProps<Spot>): React.JSX.Element {
  const [pick, setPick] = useState<number | null>(null)
  const [why, setWhy] = useState('')
  const [checked, setChecked] = useState(false)
  const right = pick === game.wrong
  return (
    <div className="g-spot">
      <div className="g-lines" role="group" aria-label="Righe">
        {game.lines.map((l, i) => (
          <button key={i} type="button" aria-pressed={pick === i} disabled={checked} className={checked && i === game.wrong ? 'no' : ''} onClick={() => setPick(i)}>
            <span className="gnum">{i + 1}</span>
            <RichText md={l} className="inline" />
          </button>
        ))}
      </div>
      {!checked && (
        <label className="g-why">
          Perché è sbagliata?
          <textarea rows={2} value={why} onChange={(e) => setWhy(e.target.value)} />
        </label>
      )}
      {!checked ? (
        <button type="button" className="pri" disabled={pick === null} onClick={() => setChecked(true)}>
          Controlla
        </button>
      ) : (
        <div className="g-end">
          <p className={'g-fb ' + (right ? 'ok' : 'no')}>{right ? 'Trovata.' : `Era la riga ${game.wrong + 1}.`}</p>
          <div className="g-miss">
            <RichText md={game.why} />
          </div>
          <button type="button" className="pri" onClick={() => onDone({ score: right ? 1 : 0, total: 1, detail: `riga ${(pick ?? 0) + 1}${why.trim() ? `, perché: ${why.trim()}` : ''}` })}>
            Continua
          </button>
        </div>
      )}
    </div>
  )
}
