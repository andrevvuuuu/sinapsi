import type { Dictation } from './dictation'
import './mic.css'

const P = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true
}
const IconMic = (): React.JSX.Element => (
  <svg viewBox="0 0 16 16" {...P}>
    <rect x="5.5" y="1.75" width="5" height="8" rx="2.5" />
    <path d="M3 7.5a5 5 0 0 0 10 0M8 12.5v1.75" />
  </svg>
)
const IconStop = (): React.JSX.Element => (
  <svg viewBox="0 0 16 16" {...P}>
    <rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor" />
  </svg>
)
const clock = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/** The microphone inside a text field (wrap field and button in `.mic-field`): click, speak, click again. */
export function MicButton({
  dictation: d,
  size = 'md'
}: {
  dictation: Dictation
  size?: 'md' | 'sm'
}): React.JSX.Element {
  const on = d.state === 'recording'
  const busy = d.state === 'transcribing'
  const download = busy && d.stage === 'download'
  const status = on
    ? 'Registro'
    : busy
      ? download
        ? 'Scarico il modello di trascrizione…'
        : 'Trascrivo…'
      : ''
  return (
    <>
      <button
        type="button"
        className={`mic${size === 'sm' ? ' mic-sm' : ''}`}
        aria-label={on ? 'Ferma la dettatura' : 'Detta'}
        aria-pressed={on}
        aria-disabled={busy || undefined}
        title={on ? 'Ferma la dettatura (⌥ Spazio)' : 'Detta (⌥ Spazio)'}
        onClick={d.toggle}
      >
        {on ? <IconStop /> : <IconMic />}
        {on && <span className="mic-time">{clock(d.seconds)}</span>}
        {/* What it is doing, beside the icon like the elapsed time; the live region below says it in full. */}
        {busy && (
          <span className="mic-status" aria-hidden="true">
            {download ? 'Scarico il modello…' : 'Trascrivo…'}
          </span>
        )}
      </button>
      <span className="sr" aria-live="polite">
        {status}
      </span>
    </>
  )
}

/** What went wrong with the dictation, under the field. */
export function DictationError({
  dictation: d
}: {
  dictation: Dictation
}): React.JSX.Element | null {
  return d.error ? (
    <p role="alert" className="mic-err">
      {d.error}
    </p>
  ) : null
}
