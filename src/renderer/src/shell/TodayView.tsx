import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ChipAction,
  PracticeSummary,
  SessionSummary,
  Suggestions
} from '../../../shared/api'
import type { WeekPlan } from '../../../shared/plan-types'
import type { LaunchDestination } from '../../../shared/lesson-types'
import type { TutorCalendar } from '../../../shared/tutor-types'
import { useDictation } from '../components/dictation'
import { DictationError, MicButton } from '../components/MicButton'
import { InkModes, type Mode } from './InkModes'
import { IconArrowUp, IconArrowUpRight, IconSpark } from './icons'
import { useAppData } from './AppData'

type Props = {
  focusStudy: boolean
  onFocusDone: () => void
  onStudy: (text: string) => void
  onPractice: (text: string, initial?: { conceptIds: string[]; exam?: boolean }) => void
  onReview: (query?: string, conceptIds?: string[]) => void
  onLessons: () => void
  onPlan: (opts?: { addExam?: boolean }) => void
  onLaunched: (result: LaunchDestination) => void
  onSession: (id: string) => void
  onPracticeSession: (id: string) => void
}

export function TodayView(p: Props): React.JSX.Element {
  const { focusStudy, onFocusDone } = p
  const [tutor, setTutor] = useState<TutorCalendar | null>(null)
  const { index, due, lessons, aiStatus: status, refreshMemory } = useAppData()
  const api = window.sinapsi,
    [sessions, setSessions] = useState<SessionSummary[]>([]),
    [practices, setPractices] = useState<PracticeSummary[]>([]),
    [week, setWeek] = useState<WeekPlan | null>(null),
    [readiness, setReadiness] = useState<import('../../../shared/plan-types').Readiness[]>([]),
    [suggestions, setSuggestions] = useState<Suggestions | null>(null),
    [mode, setMode] = useState<Mode>('Studia'),
    [text, setText] = useState(''),
    [error] = useState<string | null>(null)

  const field = useRef<HTMLTextAreaElement>(null),
    dictation = useDictation({ target: field, value: text, onChange: setText })

  useEffect(() => {
    void api?.tutor
      ?.calendar?.()
      .then(setTutor)
      .catch(() => undefined)
    void api?.session?.list?.().then(setSessions).catch(() => undefined)
    void api?.practice
      ?.list?.()
      .then(setPractices)
      .catch(() => undefined)
    void api?.plan
      ?.week?.()
      .then((x) => {
        setWeek(x.plan)
        setReadiness(x.readiness)
      })
      .catch(() => undefined)

    const refresh = (): void => {
      void refreshMemory()
      void api?.suggest
        ?.get?.()
        .then(setSuggestions)
        .catch(() => undefined)
    }
    void api?.suggest
      ?.get?.()
      .then(setSuggestions)
      .catch(() => undefined)
    window.addEventListener('focus', refresh)
    const timer = setInterval(refresh, 600000)

    return () => {
      window.removeEventListener('focus', refresh)
      clearInterval(timer)
    }
  }, [api, refreshMemory])

  useEffect(() => {
    if (focusStudy) {
      const focus = setTimeout(() => {
        setMode('Studia')
        field.current?.focus()
        onFocusDone()
      }, 0)
      return () => clearTimeout(focus)
    }
    return undefined
  }, [focusStudy, onFocusDone])

  const todayBlocks =
    week?.days.find((d) => d.date === new Date().toISOString().slice(0, 10))?.blocks ?? []

  const submit = (): void => {
    const value = text.trim()
    if (dictation.state !== 'idle') return
    if (mode === 'Studia') {
      if (!value) return
      p.onStudy(value)
    } else if (mode === 'Esercitati') p.onPractice(value)
    else p.onReview(value || undefined)
    setText('')
  }

  const launch = async (block: NonNullable<typeof todayBlocks>[number]): Promise<void> => {
    if (block.kind === 'exam-sim') {
      p.onPractice('', { conceptIds: block.conceptIds, exam: true })
    } else if (block.lessonIds[0]) {
      const result = await api.lessons.launch(block.lessonIds[0])
      p.onLaunched(result)
    }
  }

  const pickSuggestion = (action: ChipAction): void => {
    if (action.kind === 'learn') p.onStudy(action.topic)
    else if (action.kind === 'resume') p.onSession(action.id)
    else if (action.kind === 'review') p.onReview(undefined, action.conceptIds)
    else p.onPractice('', { conceptIds: action.conceptIds, ...(action.exam ? { exam: true } : {}) })
  }

  const suggestionsForMode =
    suggestions?.[mode === 'Ripassa' ? 'review' : mode === 'Esercitati' ? 'practice' : 'learn'] ??
    []

  const recent = useMemo(
    () =>
      [
        ...sessions.map((x) => ({
          id: x.id,
          title: x.topic,
          kind: 'Sessione',
          at: x.updatedAt,
          open: () => p.onSession(x.id)
        })),
        ...practices.map((x) => ({
          id: x.id,
          title: x.topic,
          kind: 'Pratica',
          at: x.updatedAt,
          open: () => p.onPracticeSession(x.id)
        }))
      ]
        .sort((a, b) => b.at - a.at)
        .slice(0, 4),
    [sessions, practices, p]
  )

  const upcomingTutorExam = tutor?.exams[0]
  const tutorExamDays = upcomingTutorExam
    ? Math.max(
        0,
        Math.ceil(
          (new Date(`${upcomingTutorExam.date}T00:00:00`).getTime() -
            new Date(new Date().toDateString()).getTime()) /
            86400000
        )
      )
    : undefined
  const tutorReadiness =
    upcomingTutorExam && (readiness[0] == null || tutorExamDays! <= readiness[0].daysLeft)
      ? upcomingTutorExam
      : undefined
  const examScore = tutorReadiness ? null : readiness[0]?.score

  return (
    <div className="sh-today-scroll">
      <header className="sh-greeting">
        <div>
          <p className="sh-eyebrow">
            {new Date()
              .toLocaleDateString('it-IT', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })
              .toLocaleUpperCase('it-IT')}
          </p>
          <h1>Oggi</h1>
          {tutor?.nextLesson && (
            <p className="tc-next-lesson">
              Prossima lezione: {tutor.nextLesson.courseName},{' '}
              {new Date(`${tutor.nextLesson.date}T12:00:00`).toLocaleDateString('it-IT', {
                weekday: 'long'
              })}{' '}
              {tutor.nextLesson.time}
            </p>
          )}
        </div>
      </header>
      <section className="sh-composer sh-card" aria-label="Compositore di studio">
        <div className="sh-composer-top">
          <div>
            <p className="sh-eyebrow">IL TUO PROSSIMO PASSO</p>
            <h2>Cosa vuoi studiare?</h2>
          </div>
          <span className="sh-spark" aria-hidden="true">
            <IconSpark />
          </span>
        </div>
        <InkModes
          mode={mode}
          due={due}
          studyCount={suggestions ? suggestions.learn.length : null}
          practiceCount={suggestions ? suggestions.practice.length : null}
          onChange={setMode}
        />
        {!text && suggestionsForMode.length > 0 && (
          <div className="sh-suggestions" role="group" aria-label="Suggerimenti">
            {suggestionsForMode.map((chip, i) => (
              <button
                key={`${i}-${chip.label}`}
                type="button"
                title={`${chip.label} — ${chip.reason}`}
                onClick={() => pickSuggestion(chip.action)}
              >
                <span>{chip.label}</span>
                <small>{chip.reason}</small>
              </button>
            ))}
          </div>
        )}
        <div className="sh-prompt-row">
          <div className="mic-field mic-fill">
            <textarea
              ref={field}
              rows={1}
              aria-label="Cosa vuoi studiare?"
              placeholder="Per esempio: aiutami a capire come si trasmette un impulso nervoso…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
              }}
            />
            <MicButton dictation={dictation} />
          </div>
          <button
            type="button"
            className="sh-send"
            aria-label="Inizia studio"
            disabled={dictation.state !== 'idle' || (mode === 'Studia' && !text.trim())}
            onClick={submit}
          >
            <IconArrowUp />
          </button>
        </div>
        <div className="sh-composer-footer">
          <span className="sh-composer-hint">Una domanda, un dubbio o un argomento</span>
        </div>
        <DictationError dictation={dictation} />
      </section>
      <section className="sh-metrics" aria-label="Le tue metriche">
        <button
          type="button"
          className="sh-card sh-metric"
          onClick={() => p.onReview()}
          aria-label={`Ripassa i ${due} concetti dovuti`}
        >
          <span className="sh-label">Dovuti oggi</span>
          <div className="sh-metric-line">
            <strong>
              {due} <small>concetti</small>
            </strong>
          </div>
          <small className="sh-metric-note">
            {due ? 'Concetti pronti per il ripasso' : 'Nessun ripasso in scadenza'}
          </small>
        </button>
        <button
          type="button"
          className="sh-card sh-metric"
          onClick={p.onLessons}
          aria-label="Apri il registro delle lezioni"
        >
          <span className="sh-label">Lezioni da rielaborare</span>
          <div className="sh-metric-line">
            <strong>
              {lessons.filter((x) => x.pending != null).length} <small>lezioni</small>
            </strong>
          </div>
          <small className="sh-metric-note">
            {lessons.length ? 'Dal tuo registro' : 'Nessuna lezione registrata'}
          </small>
        </button>
        <article className="sh-card sh-metric">
          <span className="sh-label">Prontezza esame</span>
          <div className="sh-metric-line">
            <strong>
              {examScore == null ? '—' : examScore}
              {examScore != null && <small>%</small>}
            </strong>
          </div>
          {examScore == null ? (
            <div className="sh-exam-empty">
              <small
                className="sh-metric-note"
                title={
                  tutorReadiness
                    ? `${tutorReadiness.courseName} · ${tutorReadiness.date} · Tutor`
                    : (readiness[0]?.courseId ?? 'Nessun esame nel piano')
                }
              >
                {tutorReadiness
                  ? `${tutorReadiness.courseName} · ${tutorReadiness.date} · Tutor`
                  : (readiness[0]?.courseId ?? 'Nessun esame nel piano')}
              </small>
              <button type="button" className="sh-link" onClick={() => p.onPlan({ addExam: true })}>
                Aggiungi esame
              </button>
            </div>
          ) : (
            <small
              className="sh-metric-note"
              title={readiness[0]?.courseId ?? `${tutorReadiness?.courseName ?? ''} · Tutor`}
            >
              {readiness[0]?.courseId ?? `${tutorReadiness?.courseName ?? ''} · Tutor`}
            </small>
          )}
        </article>
      </section>
      <section className="sh-card sh-queue" aria-label="Coda di oggi">
        <div className="sh-card-heading">
          <div>
            <h2>Coda di oggi</h2>
            <p>Il prossimo passo, senza fretta</p>
          </div>
          <button type="button" className="sh-link" onClick={() => p.onPlan()}>
            <span>Piano della settimana</span>
            <IconArrowUpRight />
          </button>
        </div>
        {todayBlocks.length === 0 ? (
          <p className="sh-empty">Niente in programma oggi</p>
        ) : (
          todayBlocks.map((b, i) => (
            <button
              type="button"
              className="sh-queue-row"
              key={`${b.courseId}-${i}`}
              onClick={() => void launch(b)}
            >
              <i className="is-live" aria-hidden="true" />
              <span className="sh-queue-title">
                <span>{b.courseId}</span>
                <small>
                  {b.kind === 'exam-sim' ? 'SIMULAZIONE D’ESAME' : b.phase.toUpperCase()}
                </small>
              </span>
              <span className="sh-duration">{b.minutes} min</span>
              <span className="sh-queue-type">Avvia</span>
            </button>
          ))
        )}
        <button type="button" className="sh-link" onClick={p.onLessons}>
          <span>Tutto il registro</span>
          <IconArrowUpRight />
        </button>
      </section>
      {recent.length > 0 && (
        <section className="sh-card sh-activity" aria-label="Attività recente">
          <div className="sh-card-heading">
            <div>
              <h2>Attività recente</h2>
              <p>Ultime sessioni e pratiche</p>
            </div>
          </div>
          <div className="sh-recent-list">
            {recent.map((x) => (
              <button
                type="button"
                key={`${x.kind}-${x.id}`}
                className="sh-recent-row"
                onClick={x.open}
              >
                <span className="sh-recent-title">{x.title}</span>
                <small>
                  {x.kind} ·{' '}
                  {new Date(x.at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
                </small>
              </button>
            ))}
          </div>
        </section>
      )}
      {error && (
        <p role="alert" className="sh-error">
          {error}
        </p>
      )}
      {index && 'error' in index && (
        <p className="sh-empty">Vault Obsidian non disponibile · {index.path}</p>
      )}
      <span className="sr" aria-live="polite">
        {status ? `Stato motori aggiornato` : ''}
        {suggestions ? ' Suggerimenti caricati.' : ''}
      </span>
    </div>
  )
}
