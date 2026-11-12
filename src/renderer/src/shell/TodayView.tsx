import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ChipAction,
  EngineStatus as Status,
  PracticeSummary,
  SessionSummary,
  Suggestions,
  VaultResult
} from '../../../shared/api'
import type { LessonEntry } from '../../../shared/lesson-types'
import type { Engine } from '../../../shared/settings-schema'
import type { WeekPlan } from '../../../shared/plan-types'
import type { LaunchDestination } from '../../../shared/lesson-types'
import { useDictation } from '../components/dictation'
import { DictationError, MicButton } from '../components/MicButton'
import { InkModes, type Mode } from './InkModes'
import { IconArrowUp, IconArrowUpRight, IconSpark } from './icons'

type Props = {
  focusStudy: boolean
  onFocusDone: () => void
  onStudy: (text: string) => void
  onPractice: (text: string, initial?: { conceptIds: string[]; exam?: boolean }) => void
  onReview: (query?: string, conceptIds?: string[]) => void
  onLessons: () => void
  onPlan: () => void
  onLaunched: (result: LaunchDestination) => void
  onSession: (id: string) => void
  onPracticeSession: (id: string) => void
}

export function TodayView(p: Props): React.JSX.Element {
  const { focusStudy, onFocusDone } = p
  const [tutor, setTutor] = useState<import('../../../main/tutor/calendar').TutorCalendar | null>(
    null
  )
  const api = window.sinapsi,
    [index, setIndex] = useState<VaultResult | null>(null),
    [status, setStatus] = useState<Record<Engine, Status> | null>(null),
    [sessions, setSessions] = useState<SessionSummary[]>([]),
    [practices, setPractices] = useState<PracticeSummary[]>([]),
    [due, setDue] = useState(0),
    [lessons, setLessons] = useState<LessonEntry[]>([]),
    [week, setWeek] = useState<WeekPlan | null>(null),
    [readiness, setReadiness] = useState<import('../../../shared/plan-types').Readiness[]>([]),
    [suggestions, setSuggestions] = useState<Suggestions | null>(null),
    [mode, setMode] = useState<Mode>('Studia'),
    [text, setText] = useState(''),
    [error, setError] = useState<string | null>(null)

  const field = useRef<HTMLTextAreaElement>(null),
    dictation = useDictation({ target: field, value: text, onChange: setText })

  const reload = useCallback(async () => {
    try {
      const [s, i] = await Promise.all([api.settings.get(), api.vault.index()])
      setIndex(i)
      ;(await import('./theme')).applyTheme(s.theme, true)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [api])

  useEffect(() => {
    void api.tutor
      ?.calendar()
      .then(setTutor)
      .catch(() => undefined)
    const load = setTimeout(() => void reload(), 0)
    void api.ai.status().then(setStatus)
    void api.session?.list().then(setSessions)
    void api.practice
      ?.list()
      .then(setPractices)
      .catch(() => undefined)
    void api.lessons
      ?.list()
      .then(setLessons)
      .catch(() => undefined)
    void api.plan
      ?.week()
      .then((x) => {
        setWeek(x.plan)
        setReadiness(x.readiness)
      })
      .catch(() => undefined)
    const refresh = (): void => {
      void api.review
        ?.memory()
        .then((m) =>
          setDue(Object.values(m).filter((x) => x.due !== null && x.due <= Date.now()).length)
        )
        .catch(() => undefined)
      void api.suggest
        ?.get()
        .then(setSuggestions)
        .catch(() => undefined)
    }
    refresh()
    window.addEventListener('focus', refresh)
    const timer = setInterval(refresh, 600000)
    const offVault = api.vault.onChange(setIndex),
      offAi = api.ai.onStatus(setStatus)
    return () => {
      window.removeEventListener('focus', refresh)
      clearInterval(timer)
      clearTimeout(load)
      offVault()
      offAi()
    }
  }, [api, reload])

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
        <article className="sh-card sh-metric">
          <span className="sh-label">Dovuti oggi</span>
          <div className="sh-metric-line">
            <strong>
              {due} <small>concetti</small>
            </strong>
            <div className="sh-spark-bars" aria-hidden="true">
              <i style={{ height: '35%' }} />
              <i style={{ height: '55%' }} />
              <i style={{ height: '40%' }} />
              <i style={{ height: '75%' }} />
              <i style={{ height: '100%' }} />
            </div>
          </div>
          <small className="sh-metric-note">
            {due ? 'Concetti pronti per il ripasso' : 'Nessun ripasso in scadenza'}
          </small>
        </article>
        <article className="sh-card sh-metric">
          <span className="sh-label">Lezioni da rielaborare</span>
          <div className="sh-metric-line">
            <strong>
              {lessons.filter((x) => x.pending != null).length} <small>lezioni</small>
            </strong>
            <div className="sh-streak" aria-hidden="true">
              <i />
            </div>
          </div>
          <small className="sh-metric-note">
            {lessons.length ? 'Dal tuo registro' : 'Nessuna lezione registrata'}
          </small>
        </article>
        <article className="sh-card sh-metric">
          <span className="sh-label">Prontezza esame</span>
          <div className="sh-metric-line">
            <strong>
              {examScore == null ? '—' : examScore}
              {examScore != null && <small>%</small>}
            </strong>
            {examScore != null && (
              <div
                className="sh-ring"
                aria-hidden="true"
                style={{
                  background: `conic-gradient(var(--sh-amber) 0 ${examScore}%, color-mix(in srgb, var(--muted) 20%, transparent) ${examScore}% 100%)`
                }}
              >
                <i>{examScore}%</i>
              </div>
            )}
          </div>
          {examScore == null ? (
            <div className="sh-exam-empty">
              <small className="sh-metric-note">
                {tutorReadiness
                  ? `${tutorReadiness.courseName} · ${tutorReadiness.date} · Tutor`
                  : (readiness[0]?.courseId ?? 'Nessun esame nel piano')}
              </small>
              <button type="button" className="sh-link" onClick={p.onPlan}>
                Aggiungi esame
              </button>
            </div>
          ) : (
            <small className="sh-metric-note">
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
          <button type="button" className="sh-link" onClick={p.onPlan}>
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
