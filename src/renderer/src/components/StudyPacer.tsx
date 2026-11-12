import { useEffect, useRef, useState } from 'react'
import {
  MICRO_PAUSE_EVERY,
  MICRO_PAUSE_SECONDS,
  SESSION_BREAK_MINUTES,
  type Settings
} from '../../../shared/settings-schema'
import './study-pacer.css'

/*
 * The optional pacing of a study session (Impostazioni → Ritmo di studio):
 * - Micro-pause: every MICRO_PAUSE_EVERY minutes of study, MICRO_PAUSE_SECONDS seconds of rest.
 * - Limite di durata: when the session reaches the chosen length, a nudge to close it.
 * Both are off by default. Only time with the window visible counts as study. Nothing is ever
 * forced: the notice sits in a corner and the session keeps going under it.
 */

const MIN = 60_000
type Pace = Pick<Settings, 'microPauses' | 'sessionLimit' | 'sessionLimitMinutes'>
type Notice =
  { kind: 'pause' } | { kind: 'break'; until: number } | { kind: 'limit'; minutes: number }

export function StudyPacer({ onEnd }: { onEnd: () => void }): React.JSX.Element | null {
  const [pace, setPace] = useState<Pace | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [left, setLeft] = useState(0) // seconds left in a break
  const studied = useRef(0) // ms of visible study time
  const pauseAt = useRef(MICRO_PAUSE_EVERY * MIN)
  const limitAt = useRef<number | null>(null)
  const current = useRef<Notice | null>(null)
  const show = (n: Notice | null): void => {
    current.current = n
    setNotice(n)
  }

  useEffect(() => {
    let alive = true
    void window.sinapsi?.settings
      ?.get()
      .then((s) => {
        if (!alive) return
        setPace({
          microPauses: s.microPauses,
          sessionLimit: s.sessionLimit,
          sessionLimitMinutes: s.sessionLimitMinutes
        })
        limitAt.current = s.sessionLimitMinutes * MIN
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!pace || (!pace.microPauses && !pace.sessionLimit)) return
    let last = Date.now()
    const id = window.setInterval(() => {
      const now = Date.now()
      const dt = now - last
      last = now
      // A sleeping Mac or a hidden window is not study.
      if (document.visibilityState !== 'visible' || dt > 5 * MIN) return
      const n = current.current
      if (n?.kind === 'break') {
        if (now >= n.until) show(null)
        else setLeft(Math.ceil((n.until - now) / 1000))
        return
      }
      if (n) return
      studied.current += dt
      if (pace.sessionLimit && limitAt.current !== null && studied.current >= limitAt.current)
        show({ kind: 'limit', minutes: Math.round(studied.current / MIN) })
      else if (pace.microPauses && studied.current >= pauseAt.current) show({ kind: 'pause' })
    }, 1000)
    return () => window.clearInterval(id)
  }, [pace])

  if (!notice) return null
  const later = (minutes: number): void => {
    pauseAt.current = studied.current + minutes * MIN
    show(null)
  }

  if (notice.kind === 'break') {
    return (
      <aside className="pacer is-break" role="status" aria-live="polite">
        <span className="pacer-dot" aria-hidden="true" />
        <div className="pacer-text">
          <strong>Pausa in corso</strong>
          <span>
            Occhi chiusi o lontano dallo schermo, respira.{' '}
            <b className="pacer-clock">
              {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
            </b>
          </span>
        </div>
        <div className="pacer-actions">
          <button type="button" className="pacer-btn" onClick={() => later(MICRO_PAUSE_EVERY)}>
            Riprendo ora
          </button>
        </div>
      </aside>
    )
  }

  if (notice.kind === 'pause')
    return (
      <aside className="pacer" role="status" aria-live="polite">
        <span className="pacer-dot" aria-hidden="true" />
        <div className="pacer-text">
          <strong>Micro-pausa</strong>
          <span>
            {MICRO_PAUSE_EVERY} minuti di studio: {MICRO_PAUSE_SECONDS} secondi a occhi chiusi, lontano
            dallo schermo, lasciano al cervello il tempo di ripassare quello che hai appena fatto.
          </span>
        </div>
        <div className="pacer-actions">
          <button
            type="button"
            className="pacer-btn is-pri"
            onClick={() => {
              pauseAt.current = studied.current + MICRO_PAUSE_EVERY * MIN
              setLeft(MICRO_PAUSE_SECONDS)
              show({ kind: 'break', until: Date.now() + MICRO_PAUSE_SECONDS * 1000 })
            }}
          >
            Faccio la pausa
          </button>
          <button type="button" className="pacer-btn" onClick={() => later(5)}>
            Tra 5 minuti
          </button>
        </div>
      </aside>
    )

  return (
    <aside className="pacer is-limit" role="status" aria-live="polite">
      <span className="pacer-dot" aria-hidden="true" />
      <div className="pacer-text">
        <strong>Limite di durata raggiunto</strong>
        <span>
          {notice.minutes} minuti di sessione, il limite che ti sei dato. Chiudi qui e fai una pausa di{' '}
          {SESSION_BREAK_MINUTES} minuti: la memoria consolida meglio.
        </span>
      </div>
      <div className="pacer-actions">
        <button type="button" className="pacer-btn is-pri" onClick={onEnd}>
          Chiudi la sessione
        </button>
        <button
          type="button"
          className="pacer-btn"
          onClick={() => {
            limitAt.current = studied.current + 10 * MIN
            show(null)
          }}
        >
          Altri 10 minuti
        </button>
      </div>
    </aside>
  )
}
