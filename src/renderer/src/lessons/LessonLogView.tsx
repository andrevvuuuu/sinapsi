import './lessons.css'
import { useEffect, useMemo, useState } from 'react'
import type { LaunchDestination, LessonEntry } from '../../../shared/lesson-types'
import { LaunchButton } from './LaunchButton'
import type { ExamEntry } from '../../../shared/exam-types'
import type { Readiness } from '../../../shared/plan-types'
import type { SinapsiTutorReport, TutorItemState } from '../../../shared/tutor-types'
import { TUTOR_STATES } from '../../../shared/tutor-types'

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
  const [exams, setExams] = useState<ExamEntry[]>([])
  const [readiness, setReadiness] = useState<Readiness[]>([])
  const [examCourse, setExamCourse] = useState('')
  const [examTitle, setExamTitle] = useState('')
  const [examDate, setExamDate] = useState('')
  const [examWeight, setExamWeight] = useState('')
  const [editingExam, setEditingExam] = useState<string | null>(null)
  const [tutor, setTutor] = useState<import('../../../main/tutor/calendar').TutorCalendar | null>(null)
  const [expandedTutorLessons, setExpandedTutorLessons] = useState<string[]>([])
  const [vaultPath, setVaultPath] = useState('')
  const reloadExams = (): void => {
    void Promise.all([window.sinapsi.exams.list(), window.sinapsi.plan.week()])
      .then(([items, plan]) => {
        setExams(items)
        setReadiness(plan.readiness)
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
  }
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
    reloadExams()
    void (window.sinapsi.tutor?.calendar() ?? Promise.resolve(null)).then(setTutor).catch(() => setTutor(null))
    reloadReport()
    void window.sinapsi.settings.get().then(s => setVaultPath(s.vaultPath)).catch(() => undefined)
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
  const saveExam = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const payload = {
      courseId: examCourse,
      ...(examTitle || editingExam ? { title: examTitle } : {}),
      date: examDate,
      ...(examWeight !== '' ? { weight: Number(examWeight) } : {})
    }
    if (editingExam) await window.sinapsi.exams.update(editingExam, payload)
    else await window.sinapsi.exams.create(payload)
    setEditingExam(null)
    setExamCourse('')
    setExamTitle('')
    setExamDate('')
    setExamWeight('')
    reloadExams()
  }
  const editExam = (exam: ExamEntry): void => {
    setEditingExam(exam.id)
    setExamCourse(exam.courseId)
    setExamTitle(exam.title ?? '')
    setExamDate(exam.date)
    setExamWeight(exam.weight === undefined ? '' : String(exam.weight))
  }
  return (
    <main className="lessons">
      <header className="lesson-page-header">
        <div className="lesson-page-title-group">
          <h1>Registro Lezioni</h1>
          <p className="lesson-page-subtitle">Diario delle lezioni, concetti chiave e padronanza</p>
        </div>
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

      <div className="lessons-overview-grid">
        {/* Padronanza delle lezioni (cuore della pagina, colonna sinistra) */}
        <section className="st-tutor" aria-label="Padronanza delle lezioni">
          <header className="st-tutor-head">
            <div>
              <h2>Padronanza delle lezioni</h2>
              <p>Misurata da Sinapsi sui tuoi ripassi e sulle tue pratiche, non dal tutor di Obsidian.</p>
            </div>
          </header>
          {!report?.connected ? (
            <p className="st-empty">Nessun registro delle lezioni in {vaultPath || '<vault>'}/.antigravity/tutor</p>
          ) : (
            <>
              <div className="st-courses">
                {report.courses.map((c) => (
                  <article className="st-course" key={c.id}>
                    <div className="st-course-top">
                      <h3 className="st-course-name">{c.name}</h3>
                      <div className="st-course-mastery">
                        <strong>{pct(c.stats.mastery)}</strong>
                        <small>padronanza</small>
                      </div>
                    </div>
                    <div
                      className="st-bar"
                      role="img"
                      aria-label={TUTOR_STATES.map((st) => `${STATE_IT[st]} ${c.stats.byState[st]}`).join(', ')}
                    >
                      {TUTOR_STATES.map((st) =>
                        c.stats.byState[st] ? (
                          <span
                            key={st}
                            className="st-bar-seg"
                            data-state={st}
                            style={{ flexGrow: c.stats.byState[st] }}
                          />
                        ) : null
                      )}
                    </div>
                    <p className="st-course-meta">
                      {c.stats.covered}/{c.stats.total} concetti studiati in Sinapsi · {c.lessons} lezioni
                    </p>
                  </article>
                ))}
              </div>
              <ul className="st-legend">
                {TUTOR_STATES.map((st) => (
                  <li key={st} data-state={st}>
                    <span className="st-legend-dot" data-state={st} />
                    {STATE_IT[st]}
                  </li>
                ))}
              </ul>
              <div className="st-lessons-list">
                {report.lessons
                  .filter((l) => !course || l.courseName === course || l.course === course)
                  .map((l) => {
                    const key = `${l.course}-${l.date}-${l.number ?? ''}`
                    const expanded = expandedTutorLessons.includes(key)
                    return (
                      <article className="st-lesson" key={key}>
                        <header className="st-lesson-head">
                          <div className="st-lesson-tags">
                            <span className="st-lesson-course">{l.courseName}</span>
                            {l.number !== undefined && <span className="st-lesson-num">Lezione {l.number}</span>}
                            <time dateTime={l.date}>
                              {new Date(`${l.date}T12:00:00`).toLocaleDateString('it-IT', {
                                weekday: 'short',
                                day: 'numeric',
                                month: 'short'
                              })}
                            </time>
                          </div>
                          <span
                            className="st-lesson-mastery"
                            data-state={l.stats.mastery === null ? 'scollegato' : undefined}
                          >
                            {pct(l.stats.mastery)}
                          </span>
                        </header>
                        <p className={expanded ? 'st-lesson-text' : 'st-lesson-text tc-truncated'}>{l.text}</p>
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
                              <li className="st-item" data-state={item.state} key={`${item.label}-${i}`}>
                                <span className="st-item-label">{item.label}</span>
                                <div className="st-item-right">
                                  <span className="st-item-state">
                                    {STATE_IT[item.state]}
                                    {item.mastery !== null && item.studied > 0 ? ` · ${pct(item.mastery)}` : ''}
                                  </span>
                                  {item.state === 'da estrarre' && item.notePath && (
                                    <button
                                      type="button"
                                      className="st-extract"
                                      disabled={extracting.includes(item.notePath)}
                                      onClick={() => extract(item.notePath!)}
                                    >
                                      {extracting.includes(item.notePath) ? 'Estraggo…' : 'Estrai i concetti'}
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
            </>
          )}
        </section>

        {/* Colonna secondaria: Calendario ed Esami */}
        <div className="lessons-side-col">
          <section className="tc-calendar" aria-label="Calendario">
            <header className="tc-calendar-head">
              <h2>Calendario</h2>
            </header>
            {!tutor || (!tutor.courses.length && !tutor.lessons.length && !tutor.exams.length) ? (
              <p className="tc-calendar-empty">
                Collega il tutor delle lezioni di Obsidian: {vaultPath || '<vault>'}/.antigravity/tutor
              </p>
            ) : (
              <div className="tc-calendar-body">
                {tutor.nextLesson && (
                  <div className="tc-next-lesson">
                    <span className="tc-next-badge">Prossima lezione</span>
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
                )}
                {tutor.exams.length > 0 && (
                  <div className="tc-exams-box">
                    <h3>Esami in arrivo</h3>
                    <div className="tc-exams-list">
                      {tutor.exams.map((e) => (
                        <p className="tc-exam" key={`${e.course}-${e.date}-${e.name}`}>
                          <span className="tc-exam-main">{e.courseName} · {e.name}</span>
                          <time className="tc-exam-date">{e.date}</time>
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="lesson-exams">
            <header className="lesson-exams-header">
              <h2>Esami</h2>
              <button className="btn" type="button" onClick={onOpenPlan}>
                Piano della settimana
              </button>
            </header>
            <div className="lesson-exams-list">
              {exams.map((exam) => {
                const examDay = new Date(`${exam.date}T00:00:00`)
                const today = new Date()
                today.setHours(0, 0, 0, 0)
                const days = Math.ceil((examDay.getTime() - today.getTime()) / 86400000)
                const ready = readiness.find((item) => item.examId === exam.id)
                return (
                  <article className="lesson-exam-row" key={exam.id}>
                    <div className="lesson-exam-main-col">
                      <div className="lesson-exam-title-row">
                        <strong>{exam.courseId}</strong>
                        {exam.title ? ` · ${exam.title}` : ''}
                      </div>
                      <div className="lesson-exam-sub-row">
                        <time dateTime={exam.date}>{exam.date}</time>
                        <span className="lesson-exam-countdown">tra {days} giorni</span>
                      </div>
                    </div>
                    <span className="lesson-exam-status">{ready?.status ?? 'da misurare'}</span>
                    <div className="lesson-exam-btn-group">
                      <button type="button" onClick={() => editExam(exam)}>
                        Modifica
                      </button>
                      <button
                        type="button"
                        onClick={() => void window.sinapsi.exams.archive(exam.id).then(reloadExams)}
                      >
                        Archivia
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
            <form className="lesson-exam-form" onSubmit={(event) => void saveExam(event)}>
              <h3>{editingExam ? 'Modifica esame' : 'Aggiungi esame'}</h3>
              <div className="exam-form-grid">
                <div className="exam-field exam-field-full">
                  <label htmlFor="exam-course">Corso</label>
                  <input
                    id="exam-course"
                    list="exam-courses"
                    value={examCourse}
                    onChange={(event) => setExamCourse(event.target.value)}
                    required
                    maxLength={200}
                    placeholder="es. Analisi 1"
                  />
                  <datalist id="exam-courses">
                    {courses.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </div>
                <div className="exam-field">
                  <label htmlFor="exam-date">Data</label>
                  <input
                    id="exam-date"
                    type="date"
                    value={examDate}
                    onChange={(event) => setExamDate(event.target.value)}
                    required
                  />
                </div>
                <div className="exam-field">
                  <label htmlFor="exam-title">Titolo</label>
                  <input
                    id="exam-title"
                    value={examTitle}
                    onChange={(event) => setExamTitle(event.target.value)}
                    maxLength={200}
                    placeholder="es. Scritto"
                  />
                </div>
                <div className="exam-field exam-field-full">
                  <label htmlFor="exam-weight">Peso (0–1, facoltativo)</label>
                  <input
                    id="exam-weight"
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={examWeight}
                    onChange={(event) => setExamWeight(event.target.value)}
                    placeholder="1.0"
                  />
                </div>
              </div>
              <div className="exam-form-actions">
                <button className="btn pri" type="submit">
                  {editingExam ? 'Salva modifiche' : 'Aggiungi esame'}
                </button>
                {editingExam && (
                  <button className="btn" type="button" onClick={() => setEditingExam(null)}>
                    Annulla
                  </button>
                )}
              </div>
            </form>
          </section>
        </div>
      </div>

      {error && (
        <p role="alert" className="lesson-error">
          {error}
        </p>
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
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
