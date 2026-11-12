import './lessons.css'
import { useEffect, useMemo, useState } from 'react'
import type { LaunchDestination, LessonEntry } from '../../../shared/lesson-types'
import { LaunchButton } from './LaunchButton'
import type { ExamEntry } from '../../../shared/exam-types'
import type { Readiness } from '../../../shared/plan-types'

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
  const reloadExams = (): void => {
    void Promise.all([window.sinapsi.exams.list(), window.sinapsi.plan.week()])
      .then(([items, plan]) => {
        setExams(items)
        setReadiness(plan.readiness)
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
  }
  useEffect(() => {
    void window.sinapsi.lessons
      .list()
      .then(setLessons)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
    reloadExams()
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
      <section className="lesson-exams">
        <header>
          <h2>Esami</h2>
          <button className="btn" type="button" onClick={onOpenPlan}>Piano della settimana</button>
        </header>
        {exams.map((exam) => {
          const examDay = new Date(`${exam.date}T00:00:00`)
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          const days = Math.ceil((examDay.getTime() - today.getTime()) / 86400000)
          const ready = readiness.find((item) => item.examId === exam.id)
          return (
            <article className="lesson-exam-row" key={exam.id}>
              <span>
                <strong>{exam.courseId}</strong>
                {exam.title ? ` · ${exam.title}` : ''} · {exam.date} · tra {days} giorni
              </span>
              <span className="lesson-exam-status">{ready?.status ?? 'da misurare'}</span>
              <button type="button" onClick={() => editExam(exam)}>Modifica</button>
              <button type="button" onClick={() => void window.sinapsi.exams.archive(exam.id).then(reloadExams)}>Archivia</button>
            </article>
          )
        })}
        <form className="lesson-exam-form" onSubmit={(event) => void saveExam(event)}>
          <h3>{editingExam ? 'Modifica esame' : 'Aggiungi esame'}</h3>
          <label htmlFor="exam-course">Corso</label>
          <input id="exam-course" list="exam-courses" value={examCourse} onChange={(event) => setExamCourse(event.target.value)} required maxLength={200} />
          <datalist id="exam-courses">
            {courses.map((name) => <option key={name} value={name} />)}
          </datalist>
          <label htmlFor="exam-date">Data</label>
          <input id="exam-date" type="date" value={examDate} onChange={(event) => setExamDate(event.target.value)} required />
          <label htmlFor="exam-title">Titolo</label>
          <input id="exam-title" value={examTitle} onChange={(event) => setExamTitle(event.target.value)} maxLength={200} />
          <label htmlFor="exam-weight">Peso (0–1, facoltativo)</label>
          <input id="exam-weight" type="number" min="0" max="1" step="0.01" value={examWeight} onChange={(event) => setExamWeight(event.target.value)} />
          <button className="btn pri" type="submit">
            {editingExam ? 'Salva modifiche' : 'Aggiungi esame'}
          </button>
          {editingExam && <button className="btn" type="button" onClick={() => setEditingExam(null)}>Annulla</button>}
        </form>
      </section>
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
