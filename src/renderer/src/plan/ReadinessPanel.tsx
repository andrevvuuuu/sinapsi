import type { Readiness, Signal } from '../../../shared/plan-types'

function SignalView({ signal }: { signal: Signal }): React.JSX.Element {
  const measured = signal.value !== null
  return (
    <div className="readiness-signal">
      <div className="readiness-signal-heading">
        <strong>{signal.label}</strong>
        <span>{measured ? `${Math.round(signal.value! * 100)}%` : 'da misurare'}</span>
      </div>
      <div className="readiness-track" aria-hidden="true">
        <span style={{ width: measured ? `${Math.round(signal.value! * 100)}%` : '0%' }} />
      </div>
      <small>{signal.detail}</small>
    </div>
  )
}

export function ReadinessPanel({ items }: { items: Readiness[] }): React.JSX.Element {
  return (
    <section className="readiness-list" aria-label="Indici di prontezza">
      <h2>Prontezza agli esami</h2>
      {items.length === 0 ? (
        <p>Nessun esame futuro registrato.</p>
      ) : (
        items.map((item) => (
          <article key={item.examId}>
            <header>
              <h3>{item.courseId}</h3>
              <span>{item.status}</span>
            </header>
            <p>
              {item.daysLeft} {item.daysLeft === 1 ? 'giorno' : 'giorni'} all’esame
              {item.score === null ? '' : ` · ${Math.round(item.score * 100)}%`}
            </p>
            {item.signals.map((signal) => (
              <SignalView key={signal.key} signal={signal} />
            ))}
          </article>
        ))
      )}
    </section>
  )
}
