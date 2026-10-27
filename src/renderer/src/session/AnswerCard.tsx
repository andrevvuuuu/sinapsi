import { GAME_IT, ROLE_IT, type LearnerAnswer, type Question } from '../../../shared/teacher-protocol'
import { RichText } from './RichText'

export function AnswerCard({ q, a }: { q: Question; a: LearnerAnswer }): React.JSX.Element {
  if (q.kind === 'game' && q.game && a.game) {
    const g = a.game
    return (
      <div className="card">
        <div className="row">
          <span className="lab">{`Gioco · ${GAME_IT[q.game.type]}`}</span>
          {g.total > 0 ? <span className={'chip ' + (g.score / g.total >= 0.7 ? 'ok' : 'no')}>{`${g.score}/${g.total}`}</span> : <span className="chip">saltato</span>}
        </div>
        {g.total > 0 && <div className="th">{g.detail}</div>}
      </div>
    )
  }
  const graded = q.kind === 'choice' && q.correct !== undefined
  const right = graded && a.choice === q.correct
  return (
    <div className="card">
      <div className="row">
        <span className="lab">{ROLE_IT[q.role]}</span>
        {a.dontKnow ? <span className="chip">Non lo so</span> : graded && <span className={'chip ' + (right ? 'ok' : 'no')}>{right ? 'Corretto' : 'Sbagliato'}</span>}
        {a.confidence !== undefined && <span className="lab">fiducia {a.confidence}%</span>}
      </div>
      <div className="ans">{a.dontKnow ? 'Non lo so' : q.kind === 'choice' && a.choice !== undefined ? <RichText md={q.options![a.choice]} className="inline" /> : a.text}</div>
      {q.kind === 'choice' && a.text && <div className="th">{a.text}</div>}
      {a.thoughts && <div className="th">Mentre leggevi: {a.thoughts}</div>}
      {graded && q.why && (
        <details>
          <summary>Perché</summary>
          {q.options!.map((o, i) => (
            <div key={i} className={'why' + (i === q.correct ? ' good' : '')}>
              <RichText md={`**${o}** — ${q.why![i]}`} />
            </div>
          ))}
        </details>
      )}
    </div>
  )
}
