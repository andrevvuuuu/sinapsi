import './exams.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ExamEntry } from '../../../shared/exam-types'
import type { Readiness } from '../../../shared/plan-types'
import type { TutorCalendar } from '../../../shared/tutor-types'

export function ExamManager({
  autoFocusForm,
  onChanged,
  onOpenPlan,
  className
}: {
  autoFocusForm?: boolean
  onChanged?: () => void
  onOpenPlan?: () => void
  className?: string
}): React.JSX.Element {
  const [exams, setExams] = useState<ExamEntry[]>([])
  const [readiness, setReadiness] = useState<Readiness[]>([])
  const [tutor, setTutor] = useState<TutorCalendar | null>(null)
  const [examCourse, setExamCourse] = useState('')
  const [examTitle, setExamTitle] = useState('')
  const [examDate, setExamDate] = useState('')
  const [examWeight, setExamWeight] = useState('')
  const [editingExam, setEditingExam] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [lessonCourses, setLessonCourses] = useState<string[]>([])

  const courseInputRef = useRef<HTMLInputElement>(null)

  const reloadExams = (): void => {
    const listPromise = window.sinapsi?.exams?.list ? window.sinapsi.exams.list() : Promise.resolve([])
    const planPromise = window.sinapsi?.plan?.week ? window.sinapsi.plan.week() : Promise.resolve({ readiness: [] })
    void Promise.all([listPromise, planPromise])
      .then(([items, plan]) => {
        setExams(items ?? [])
        setReadiness(plan?.readiness ?? [])
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
  }

  useEffect(() => {
    reloadExams()
    void (window.sinapsi?.tutor?.calendar ? window.sinapsi.tutor.calendar() : Promise.resolve(null))
      .then(setTutor)
      .catch(() => setTutor(null))
    void (window.sinapsi?.lessons?.list ? window.sinapsi.lessons.list() : Promise.resolve([]))
      .then((items) => setLessonCourses([...new Set(items.map((item) => item.courseId))].sort()))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (autoFocusForm) {
      courseInputRef.current?.focus()
    }
  }, [autoFocusForm])

  const courses = useMemo(() => {
    const set = new Set<string>(lessonCourses)
    exams.forEach((exam) => set.add(exam.courseId))
    tutor?.courses.forEach((c) => set.add(c.nome))
    return [...set].filter(Boolean).sort()
  }, [lessonCourses, exams, tutor])

  const saveExam = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const payload = {
      courseId: examCourse,
      ...(examTitle || editingExam ? { title: examTitle } : {}),
      date: examDate,
      ...(examWeight !== '' ? { weight: Number(examWeight) } : {})
    }
    try {
      if (editingExam) await window.sinapsi.exams.update(editingExam, payload)
      else await window.sinapsi.exams.create(payload)
      setEditingExam(null)
      setExamCourse('')
      setExamTitle('')
      setExamDate('')
      setExamWeight('')
      reloadExams()
      onChanged?.()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const editExam = (exam: ExamEntry): void => {
    setEditingExam(exam.id)
    setExamCourse(exam.courseId)
    setExamTitle(exam.title ?? '')
    setExamDate(exam.date)
    setExamWeight(exam.weight === undefined ? '' : String(exam.weight))
    courseInputRef.current?.focus()
  }

  const archiveExam = async (id: string): Promise<void> => {
    try {
      await window.sinapsi.exams.archive(id)
      reloadExams()
      onChanged?.()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const importTutorExam = async (e: { course: string; courseName: string; date: string }): Promise<void> => {
    try {
      await window.sinapsi.exams.create({
        courseId: e.courseName || e.course,
        date: e.date
      })
      reloadExams()
      onChanged?.()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <section className={`lesson-exams ${className ?? ''}`.trim()} aria-label="Esami">
      <header className="lesson-exams-header">
        <h2>Esami</h2>
        {onOpenPlan && (
          <button className="btn" type="button" onClick={onOpenPlan}>
            Piano della settimana
          </button>
        )}
      </header>

      {tutor && tutor.exams.length > 0 && (
        <div className="tc-exams-box">
          <h3>Esami in arrivo</h3>
          <div className="tc-exams-list">
            {tutor.exams.map((e) => {
              const alreadyPresent = exams.some(
                (x) =>
                  x.courseId.trim().toLowerCase() === e.courseName.trim().toLowerCase() &&
                  x.date === e.date
              )
              return (
                <div className="tc-exam" key={`${e.course}-${e.date}-${e.name}`}>
                  <span className="tc-exam-main">
                    {e.courseName} · {e.name}
                  </span>
                  <div className="tc-exam-right">
                    <time className="tc-exam-date">{e.date}</time>
                    {!alreadyPresent && (
                      <button
                        type="button"
                        className="btn tc-exam-add"
                        onClick={() => void importTutorExam(e)}
                      >
                        Aggiungi
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

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
              </div>
              <div className="lesson-exam-sub-row">
                <time dateTime={exam.date}>{exam.date}</time>
                <span className="lesson-exam-countdown">tra {days} giorni</span>
              </div>
              <span className="lesson-exam-status">{ready?.status ?? 'da misurare'}</span>
              <div className="lesson-exam-btn-group">
                <button type="button" onClick={() => editExam(exam)}>
                  Modifica
                </button>
                <button
                  type="button"
                  onClick={() => void archiveExam(exam.id)}
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
              ref={courseInputRef}
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
            <button
              className="btn"
              type="button"
              onClick={() => {
                setEditingExam(null)
                setExamCourse('')
                setExamTitle('')
                setExamDate('')
                setExamWeight('')
              }}
            >
              Annulla
            </button>
          )}
        </div>
      </form>

      {error && (
        <p role="alert" className="lesson-error">
          {error}
        </p>
      )}
    </section>
  )
}
