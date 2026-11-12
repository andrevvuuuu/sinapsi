import { useState } from 'react'
import type { LaunchDestination, LessonEntry } from '../../../shared/lesson-types'

export function LaunchButton({
  lesson,
  onLaunched
}: {
  lesson: LessonEntry
  onLaunched: (result: LaunchDestination) => void
}): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const disabled = lesson.nextMode === 'disabled'
  const launch = async (mode?: 'practice' | 'review'): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const result = await window.sinapsi.lessons.launch(lesson.id, mode)
      if ('kind' in result && result.kind === 'disabled') setError(result.reason)
      else onLaunched(result)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="lesson-launch">
      <button
        className="btn pri lesson-launch-main"
        type="button"
        disabled={busy || disabled}
        onClick={() => void launch()}
      >
        {busy ? 'Avvio…' : `Avvia sessione · ${lesson.nextMode === 'review' ? 'Ripasso' : 'Pratica'}`}
      </button>
      {disabled && lesson.launchReason && <p className="lesson-reason">{lesson.launchReason}</p>}
      <details>
        <summary>Altre modalità</summary>
        <button type="button" disabled={busy} onClick={() => void launch('review')}>
          Solo ripasso
        </button>
        <button type="button" disabled={busy} onClick={() => void launch('practice')}>
          Solo pratica
        </button>
      </details>
      {error && (
        <p role="alert" className="lesson-error">
          {error}
        </p>
      )}
    </div>
  )
}
