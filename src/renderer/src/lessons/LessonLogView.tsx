import './lessons.css'
import { useEffect, useMemo, useState } from 'react'
import type { LaunchDestination, LessonEntry } from '../../../shared/lesson-types'
import { LaunchButton } from './LaunchButton'

export function LessonLogView({
  onOpen,
  onNew,
  onLaunched
}: {
  onOpen: (id: string) => void
  onNew: () => void
  onLaunched: (result: LaunchDestination) => void
}): React.JSX.Element {
  const [lessons, setLessons] = useState<LessonEntry[]>([])
  const [course, setCourse] = useState('')
  const [pendingOnly, setPendingOnly] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    void window.sinapsi.lessons
      .list()
      .then(setLessons)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
  }, [])
  const courses = useMemo(
    () => [...new Set(lessons.map((lesson) => lesson.courseId))].sort(),
    [lessons]
  )
  const rows = lessons
    .filter(
      (lesson) =>
        (!course || lesson.courseId === course) && (!pendingOnly || lesson.pending !== null)
    )
    .sort((a, b) => b.date.localeCompare(a.date))
  return (
    <main className="lessons">
      <header className="lesson-page-header">
        <button className="btn" type="button" onClick={onNew}>
          Nuova lezione
        </button>
        <h1>Registro Lezioni</h1>
        <label htmlFor="lesson-course-filter">Corso</label>
        <select
          id="lesson-course-filter"
          value={course}
          onChange={(event) => setCourse(event.target.value)}
        >
          <option value="">Tutti i corsi</option>
          {courses.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <label className="lesson-check">
          <input
            type="checkbox"
            checked={pendingOnly}
            onChange={(event) => setPendingOnly(event.target.checked)}
          />{' '}
          Solo in sospeso
        </label>
      </header>
      {error && (
        <p role="alert" className="lesson-error">
          {error}
        </p>
      )}
      {rows.length === 0 ? (
        <section className="lesson-empty">
          <h2>Nessuna lezione registrata</h2>
          <p>
            Aggiungi la prima lezione per raccogliere il nucleo 80/20, i concetti e i prossimi
            ripassi.
          </p>
          <button className="btn pri" type="button" onClick={onNew}>
            Aggiungi la prima lezione
          </button>
        </section>
      ) : (
        rows.map((lesson) => (
          <article className="lesson-row" key={lesson.id}>
            <button className="lesson-title" type="button" onClick={() => onOpen(lesson.id)}>
              <strong>{lesson.topic}</strong>
              <span>{lesson.courseId}</span>
            </button>
            <time dateTime={lesson.date}>{lesson.date}</time>
            {lesson.pending && (
              <span className="lesson-badge">
                {lesson.pending === 'recall24h'
                  ? 'Richiamo 24 h'
                  : lesson.pending === 'weekly'
                    ? 'Ripasso settimanale'
                    : 'Digestione'}
              </span>
            )}
            <span className="lesson-mastery">
              {lesson.masteryLevel === 'known'
                ? 'Acquisita'
                : lesson.masteryLevel === 'partial'
                  ? 'Parziale'
                  : 'Da imparare'}
            </span>
            <LaunchButton lesson={lesson} onLaunched={onLaunched} />
          </article>
        ))
      )}
    </main>
  )
}
