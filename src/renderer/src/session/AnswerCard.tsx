import { useState } from 'react'
import {
  GAME_IT,
  ROLE_IT,
  type LearnerAnswer,
  type Question
} from '../../../shared/teacher-protocol'
import type { Evidence } from '../../../shared/session-types'
import { RichText } from './RichText'

export function AnswerCard({
  q,
  a,
  sessionId,
  evidence,
  onContest,
  onFlag
}: {
  q: Question
  a: LearnerAnswer
  sessionId?: string
  evidence?: Evidence
  onContest?: (questionId: string) => void
  onFlag?: (questionId: string) => void
}): React.JSX.Element {
  const [contested, setContested] = useState(false)
  const [flagged, setFlagged] = useState(false)
  // Excluded also covers peeked or never-graded answers: only a graded, unpeeked one was contested/flagged.
  const userExcluded = Boolean(evidence?.excluded && !evidence.peeked)
  const isContested = contested || (userExcluded && Boolean(evidence?.verdict))
  const isFlagged = flagged || (userExcluded && q.kind === 'choice')

  if (q.kind === 'game' && q.game && a.game) {
    const g = a.game
    return (
      <div className="card">
        <div className="row">
          <span className="lab">{`Gioco · ${GAME_IT[q.game.type]}`}</span>
          {g.total > 0 ? (
            <span className={'chip ' + (g.score / g.total >= 0.7 ? 'ok' : 'no')}>
              {`${g.score}/${g.total}`}
            </span>
          ) : (
            <span className="chip">{g.detail === 'saltato' ? 'saltato' : 'inviata'}</span>
          )}
        </div>
        {g.detail !== 'saltato' && <div className="th">{g.detail}</div>}
      </div>
    )
  }
  const graded = q.kind === 'choice' && q.correct !== undefined
  const right = graded && a.choice === q.correct
  return (
    <div className="card">
      <div className="row">
        <span className="lab">{ROLE_IT[q.role]}</span>
        {a.dontKnow ? (
          <span className="chip">Non lo so</span>
        ) : graded ? (
          <span className={'chip ' + (right ? 'ok' : 'no')}>
            {right ? 'Corretto' : 'Sbagliato'}
          </span>
        ) : evidence?.verdict ? (
          <span
            className={
              'chip ' +
              (evidence.verdict === 'correct'
                ? 'ok'
                : evidence.verdict === 'partial'
                  ? 'warn'
                  : 'no')
            }
          >
            {evidence.verdict === 'correct'
              ? 'corretta'
              : evidence.verdict === 'partial'
                ? 'parziale'
                : 'sbagliata'}
          </span>
        ) : null}
        {a.confidence !== undefined && <span className="lab">fiducia {a.confidence}%</span>}
        {q.kind !== 'choice' &&
          q.kind !== 'game' &&
          evidence?.verdict &&
          (isContested ? (
            <span className="chip contested">contestata</span>
          ) : (
            <button
              type="button"
              className="link-btn contest-btn"
              onClick={() => {
                setContested(true)
                if (onContest) onContest(q.id)
                else if (sessionId) void window.sinapsi?.session?.contest?.(sessionId, q.id)
              }}
            >
              Contesta
            </button>
          ))}
        {graded && (
          <button
            type="button"
            className="quiet-btn flag-btn"
            onClick={() => {
              setFlagged(true)
              if (onFlag) onFlag(q.id)
              else if (sessionId) void window.sinapsi?.session?.flag?.(sessionId, q.id)
            }}
          >
            {isFlagged ? 'segnalata' : 'Segnala risposta errata'}
          </button>
        )}
      </div>
      <div className="ans">
        {a.dontKnow ? (
          'Non lo so'
        ) : q.kind === 'choice' && a.choice !== undefined ? (
          <RichText md={q.options![a.choice]} className="inline" />
        ) : (
          a.text
        )}
      </div>
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
