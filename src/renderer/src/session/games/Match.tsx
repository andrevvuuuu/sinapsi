import { useMemo, useState } from 'react'
import type { Game } from '../../../../shared/teacher-protocol'
import { RichText } from '../RichText'
import { clip, matchLayout, type GameProps } from './shared'

type Match = Extract<Game, { type: 'match' }>

/** Coppie: tap an item, then what it goes with. Wrong pairs flash and count as mistakes. */
export function Match({ id, game, onDone }: GameProps<Match>): React.JSX.Element {
  const { left, right } = useMemo(() => matchLayout(game.pairs.length, id), [game, id])
  const [pick, setPick] = useState<number | null>(null)
  const [matched, setMatched] = useState<Set<number>>(new Set())
  const [mistakes, setMistakes] = useState<[number, number][]>([])
  const [flash, setFlash] = useState<number | null>(null)
  const done = matched.size === game.pairs.length

  const choose = (r: number): void => {
    if (pick === null || matched.has(r)) return
    if (r === pick) setMatched(new Set(matched).add(r))
    else {
      setMistakes((m) => [...m, [pick, r]])
      setFlash(r)
      setTimeout(() => setFlash(null), 600)
    }
    setPick(null)
  }
  const score = Math.max(0, game.pairs.length - mistakes.length)
  return (
    <div className="g-match">
      <div className="g-cols">
        <div role="group" aria-label="Voci" className="g-col">
          {left.map((i) => (
            <button key={i} type="button" aria-pressed={pick === i} disabled={matched.has(i)} className={matched.has(i) ? 'ok' : ''} onClick={() => setPick(i)}>
              <RichText md={game.pairs[i][0]} className="inline" />
            </button>
          ))}
        </div>
        <div role="group" aria-label="Corrispondenti" className="g-col">
          {right.map((i) => (
            <button key={i} type="button" disabled={matched.has(i) || pick === null} className={(matched.has(i) ? 'ok' : '') + (flash === i ? ' no' : '')} onClick={() => choose(i)}>
              <RichText md={game.pairs[i][1]} className="inline" />
            </button>
          ))}
        </div>
      </div>
      {done && (
        <div className="g-end">
          <p className="g-score">{`${score}/${game.pairs.length}`}</p>
          <button
            type="button"
            className="pri"
            onClick={() =>
              onDone({
                score,
                total: game.pairs.length,
                detail: clip(mistakes.length ? `${mistakes.length} ${mistakes.length === 1 ? 'errore' : 'errori'}: ${mistakes.map(([l, r]) => `«${game.pairs[l][0]}» con «${game.pairs[r][1]}»`).join('; ')}` : 'tutte giuste al primo colpo')
              })
            }
          >
            Continua
          </button>
        </div>
      )}
    </div>
  )
}
