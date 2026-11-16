import { useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { GAME_IT, type LearnerAnswer, type Question } from '../../../../shared/teacher-protocol'
import { RichText } from '../RichText'
import { Match } from './Match'
import { Order } from './Order'
import { Speed } from './Speed'
import { Spot } from './Spot'
import { Taboo } from './Taboo'
import './games.css'

/** A mini-game in place of a check: its result goes to the tutor as the answer. */
export function GameDock({ question: q, onAnswer }: { question: Question; onAnswer: (a: LearnerAnswer) => void }): React.JSX.Element | null {
  const g = q.game
  const panel = useRef<HTMLDivElement>(null)
  const done = useCallback((game: NonNullable<LearnerAnswer['game']>): void => onAnswer({ questionId: q.id, game }), [onAnswer, q.id])
  const skip = useCallback((): void => done({ score: 0, total: 0, detail: 'saltato' }), [done])
  useEffect(() => {
    if (!g) return undefined
    panel.current?.focus()
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        skip()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [g, skip])
  if (!g) return null
  return (
    <>
      <section className="g-dock-status" aria-label={`Gioco «${GAME_IT[g.type]}»`}>Gioco in corso</section>
      {createPortal(
        <div className="gv" role="presentation">
          <section className="gp" role="dialog" aria-modal="true" aria-labelledby="gp-title" tabIndex={-1} ref={panel}>
            <div className="gp-timer" aria-hidden="true" />
            <header className="gp-head">
              <h2 className="gp-title" id="gp-title">Gioco · {GAME_IT[g.type]}</h2>
              <button type="button" className="gp-skip" onClick={skip}>Salta il gioco</button>
            </header>
            <div className="gp-prompt"><RichText md={q.prompt} /></div>
            <div className="gp-body">
              {g.type === 'speed' && <Speed id={q.id} game={g} onDone={done} />}
              {g.type === 'match' && <Match id={q.id} game={g} onDone={done} />}
              {g.type === 'order' && <Order id={q.id} game={g} onDone={done} />}
              {g.type === 'spot' && <Spot id={q.id} game={g} onDone={done} />}
              {g.type === 'taboo' && <Taboo id={q.id} game={g} onDone={done} />}
            </div>
          </section>
        </div>,
        document.body
      )}
    </>
  )
}
