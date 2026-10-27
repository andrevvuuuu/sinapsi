import { useMemo, useState } from 'react'
import type { Game } from '../../../../shared/teacher-protocol'
import { RichText } from '../RichText'
import { seededShuffle, type GameProps } from './shared'

type Order = Extract<Game, { type: 'order' }>

/** Ricomponi: put the steps of an argument back in order (↑/↓, no drag needed). */
export function Order({ id, game, onDone }: GameProps<Order>): React.JSX.Element {
  const start = useMemo(() => seededShuffle(game.steps, id), [game, id])
  const [list, setList] = useState(start)
  const [checked, setChecked] = useState(false)
  const move = (i: number, d: -1 | 1): void => {
    const next = [...list]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    setList(next)
  }
  const score = list.filter((s, i) => s === game.steps[i]).length
  return (
    <div className="g-order">
      <ol>
        {list.map((s, i) => (
          <li key={s} className={checked ? (s === game.steps[i] ? 'ok' : 'no') : ''}>
            <span className="gnum">{i + 1}</span>
            <span className="gtext">
              <RichText md={s} className="inline" />
            </span>
            {!checked && (
              <span className="gmove">
                {i > 0 && (
                  <button type="button" aria-label={`Sposta su: ${s}`} onClick={() => move(i, -1)}>
                    ↑
                  </button>
                )}
                {i < list.length - 1 && (
                  <button type="button" aria-label={`Sposta giù: ${s}`} onClick={() => move(i, 1)}>
                    ↓
                  </button>
                )}
              </span>
            )}
          </li>
        ))}
      </ol>
      {checked && score < list.length && (
        <div className="g-miss">
          Ordine giusto:{' '}
          {game.steps.map((s, i) => (
            <span key={i}>
              {i + 1}. <RichText md={s} className="inline" />{' '}
            </span>
          ))}
        </div>
      )}
      {!checked ? (
        <button type="button" className="pri" onClick={() => setChecked(true)}>
          Controlla
        </button>
      ) : (
        <div className="g-end">
          <p className="g-score">{`${score}/${list.length}`}</p>
          <button type="button" className="pri" onClick={() => onDone({ score, total: list.length, detail: `${score}/${list.length} passi al posto giusto; il mio ordine: ${list.map((s) => `«${s}»`).join(' → ')}` })}>
            Continua
          </button>
        </div>
      )}
    </div>
  )
}
