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
  if (!g) return null
  const done = (game: NonNullable<LearnerAnswer['game']>): void => onAnswer({ questionId: q.id, game })
  return (
    <section className="shell g-dock" aria-label={`Gioco «${GAME_IT[g.type]}»`}>
      <div className="inner">
        <div className="g-head">
          <span className="lab">{`Gioco · ${GAME_IT[g.type]}`}</span>
          <button type="button" className="ghost" onClick={() => done({ score: 0, total: 0, detail: 'saltato' })}>
            Salta il gioco
          </button>
        </div>
        <RichText md={q.prompt} className="q" />
        {g.type === 'speed' && <Speed id={q.id} game={g} onDone={done} />}
        {g.type === 'match' && <Match id={q.id} game={g} onDone={done} />}
        {g.type === 'order' && <Order id={q.id} game={g} onDone={done} />}
        {g.type === 'spot' && <Spot id={q.id} game={g} onDone={done} />}
        {g.type === 'taboo' && <Taboo id={q.id} game={g} onDone={done} />}
      </div>
    </section>
  )
}
