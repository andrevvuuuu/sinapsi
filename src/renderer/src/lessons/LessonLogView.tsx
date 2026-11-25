import './lessons.css'
import { useEffect, useMemo, useState } from 'react'
import type { LaunchDestination, LessonEntry } from '../../../shared/lesson-types'
import { LaunchButton } from './LaunchButton'
import { ExamManager } from '../plan/ExamManager'
import type { SinapsiTutorReport, TutorCalendar, TutorItemState } from '../../../shared/tutor-types'

const STATE_IT: Record<TutorItemState, string> = {
  interiorizzato: 'Interiorizzato',
  'in corso': 'In corso',
  fragile: 'Fragile',
  'mai studiato': 'Mai studiato',
  'da estrarre': 'Da estrarre',
  scollegato: 'Senza nota'
}
const pct = (x: number | null): string => (x === null ? '—' : `${Math.round(x * 100)}%`)

export function LessonLogView({
  onOpen,
  onNew,
  onLaunched,
  onOpenPlan
}: {
  onOpen: (id: string) => void
  onNew: () => void
  onLaunched: (result: LaunchDestination) => void
  onOpenPlan?: () => void
}): React.JSX.Element {
  const [lessons, setLessons] = useState<LessonEntry[]>([])
  const [course, setCourse] = useState('')
  const [pendingOnly, setPendingOnly] = useState(false)
  const [error, setError] = useState('')
  const [tutor, setTutor] = useState<TutorCalendar | null>(null)
  const [expandedTutorLessons, setExpandedTutorLessons] = useState<string[]>([])
  const [vaultPath, setVaultPath] = useState('')
  const [report, setReport] = useState<SinapsiTutorReport | null>(null)
  const [extracting, setExtracting] = useState<string[]>([])
  const reloadReport = (): void => {
    void (window.sinapsi.tutor?.report?.() ?? Promise.resolve(null))
      .then(setReport)
      .catch(() => setReport(null))
  }
  const extract = (path: string): void => {
    setExtracting((xs) => [...xs, path])
    void window.sinapsi.graph.extract(path, 'manual').catch((cause: unknown) => {
      setExtracting((xs) => xs.filter((x) => x !== path))
      setError(cause instanceof Error ? cause.message : String(cause))
    })
  }
  // Extraction runs in the background: the list of pending notes and the report follow the graph.
  useEffect(
    () =>
      window.sinapsi.graph?.onChange?.(({ status, graph }) => {
        setExtracting([...(status.running ? [status.running] : []), ...status.queued])
        if (graph) reloadReport()
      }),
    []
  )
  useEffect(() => {
    void window.sinapsi.lessons
      .list()
      .then(setLessons)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
    void (window.sinapsi.tutor?.calendar() ?? Promise.resolve(null)).then(setTutor).catch(() => setTutor(null))
    reloadReport()
    void window.sinapsi.settings.get().then((s) => setVaultPath(s.vaultPath)).catch(() => undefined)
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
        <h1 className="sr-only">Registro Lezioni</h1>
        <div className="lesson-page-controls">
          <div className="lesson-filter-select-group">
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
          </div>
          <label className="lesson-check">
            <input
              type="checkbox"
              checked={pendingOnly}
              onChange={(event) => setPendingOnly(event.target.checked)}
            />{' '}
            Solo in sospeso
          </label>
          <button className="btn pri" type="button" onClick={onNew}>
            Nuova lezione
          </button>
        </div>
      </header>

      {/* 1. In cima: Padronanza delle lezioni come tile metriche */}
      <section className="st-mastery-section" aria-label="Padronanza delle lezioni">
        <h2 className="sr-only">Padronanza delle lezioni</h2>
        {!report?.connected ? (
          <p className="st-empty">
            Nessun registro delle lezioni in {vaultPath || '<vault>'}/.antigravity/tutor
          </p>
        ) : (
          <div className="st-courses">
            {report.courses.map((c) => (
              <article className="st-course" key={c.id}>
                <div className="st-course-top">
                  <h3 className="st-course-name">{c.name}</h3>
                  <div className="st-course-mastery-row">
                    <div className="st-course-mastery">
                      <strong>{pct(c.stats.mastery)}</strong>
                    </div>
                    <div
                      className="st-bar"
                      role="progressbar"
                      aria-label={`Padronanza ${c.name}`}
                      aria-valuenow={c.stats.mastery !== null ? Math.round(c.stats.mastery * 100) : 0}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <span
                        className="st-bar-fill"
                        style={{
                          width: c.stats.mastery !== null ? `${Math.round(c.stats.mastery * 100)}%` : '0%'
                        }}
                      />
                    </div>
                  </div>
                </div>
                <p className="st-course-meta">
                  {c.stats.covered}/{c.stats.total} concetti
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* 2. Al centro: Calendario ed Esami come card Services / Agents */}
      <div className="lessons-services-grid">
        <section className="tc-calendar" aria-label="Calendario">
          <header className="tc-calendar-head">
            <h2>Calendario</h2>
          </header>
          {!tutor || (!tutor.courses.length && !tutor.lessons.length) ? (
            <p className="tc-calendar-empty">
              Collega il tutor delle lezioni di Obsidian: {vaultPath || '<vault>'}/.antigravity/tutor
            </p>
          ) : (
            <div className="tc-calendar-body">
              {tutor.nextLesson && (
                <div className="tc-next-lesson">
                  <span className="tc-next-badge">Prossima lezione</span>
                  <div className="tc-next-row">
                    <p className="tc-next-course">
                      <strong>{tutor.nextLesson.courseName}</strong>
                    </p>
                    <p className="tc-next-datetime">
                      {new Date(`${tutor.nextLesson.date}T12:00:00`).toLocaleDateString('it-IT', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long'
                      })}{' '}
                      {tutor.nextLesson.time}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <ExamManager onOpenPlan={onOpenPlan} />
      </div>

      {error && (
        <p role="alert" className="lesson-error">
          {error}
        </p>
      )}

      {/* 3. In basso: Lezioni come card Logs */}
      <div className="lessons-logs-section">
        {report?.connected && report.lessons.length > 0 && (
          <div className="st-lessons-list">
            {report.lessons
              .filter((l) => !course || l.courseName === course || l.course === course)
              .map((l) => {
                const key = `${l.course}-${l.date}-${l.number ?? ''}`
                const expanded = expandedTutorLessons.includes(key)
                return (
                  <article className="st-lesson" key={key}>
                    <header className="st-lesson-head">
                      <time dateTime={l.date}>
                        {new Date(`${l.date}T12:00:00`).toLocaleDateString('it-IT', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short'
                        })}
                      </time>
                      <div className="st-lesson-tags">
                        <span className="st-lesson-course">{l.courseName}</span>
                        {l.number !== undefined && (
                          <span className="st-lesson-num">Lezione {l.number}</span>
                        )}
                      </div>
                      <span
                        className="st-lesson-mastery"
                        data-state={l.stats.mastery === null ? 'scollegato' : undefined}
                      >
                        {pct(l.stats.mastery)}
                      </span>
                    </header>
                    <p className={expanded ? 'st-lesson-text' : 'st-lesson-text tc-truncated'}>
                      {l.text}
                    </p>
                    <div className="st-lesson-action-bar">
                      <button
                        type="button"
                        className="st-more"
                        aria-expanded={expanded}
                        onClick={() =>
                          setExpandedTutorLessons((current) =>
                            expanded ? current.filter((x) => x !== key) : [...current, key]
                          )
                        }
                      >
                        {expanded ? 'Riduci' : 'Mostra tutto'}
                      </button>
                      <p className="st-lesson-meta">
                        {l.stats.covered}/{l.stats.total} concetti studiati in Sinapsi
                      </p>
                    </div>
                    {l.items.length > 0 && (
                      <ul className="st-items">
                        {l.items.map((item, i) => (
                          <li
                            className="st-item"
                            data-state={item.state}
                            key={`${item.label}-${i}`}
                          >
                            <span className="st-item-label">{item.label}</span>
                            <div className="st-item-right">
                              <span className="st-item-state">
                                {STATE_IT[item.state]}
                                {item.mastery !== null && item.studied > 0
                                  ? ` · ${pct(item.mastery)}`
                                  : ''}
                              </span>
                              {item.state === 'da estrarre' && item.notePath && (
                                <button
                                  type="button"
                                  className="st-extract"
                                  disabled={extracting.includes(item.notePath)}
                                  onClick={() => extract(item.notePath!)}
                                >
                                  {extracting.includes(item.notePath)
                                    ? 'Estraggo…'
                                    : 'Estrai i concetti'}
                                </button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                )
              })}
          </div>
        )}

        <section className="lessons-registry-section">
          <div className="lessons-registry-head">
            <h2>Lezioni registrate</h2>
            <span className="lessons-count-pill">
              {rows.length} {rows.length === 1 ? 'lezione' : 'lezioni'}
            </span>
          </div>
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
            <div className="lessons-rows-container">
              {rows.map((lesson) => (
                <article className="lesson-row" key={lesson.id}>
                  <time dateTime={lesson.date}>{lesson.date}</time>
                  <button className="lesson-title" type="button" onClick={() => onOpen(lesson.id)}>
                    <strong>{lesson.topic}</strong>
                    <span>{lesson.courseId}</span>
                  </button>
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
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
