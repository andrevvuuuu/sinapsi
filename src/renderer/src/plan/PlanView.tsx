import { useEffect, useState } from 'react'
import type { LessonEntry, LaunchDestination } from '../../../shared/lesson-types'
import type { Readiness, WeekPlan } from '../../../shared/plan-types'
import type { Settings } from '../../../shared/settings-schema'
import { ReadinessPanel } from './ReadinessPanel'
import './plan.css'

type PlanData = { plan: WeekPlan; readiness: Readiness[] }
const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

export function PlanView({
  onBack,
  onOpenPracticeSetup,
  onLaunched
}: {
  onBack: () => void
  onOpenPracticeSetup: (conceptIds: string[], exam: boolean) => void
  onLaunched: (result: LaunchDestination) => void
}): React.JSX.Element {
  const [data, setData] = useState<PlanData | null>(null)
  const [lessons, setLessons] = useState<LessonEntry[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [error, setError] = useState('')

  async function reload(): Promise<void> {
    try {
      const [planData, currentSettings, entries] = await Promise.all([
        window.sinapsi.plan.week(),
        window.sinapsi.settings.get(),
        window.sinapsi.lessons.list()
      ])
      setData(planData)
      setSettings(currentSettings)
      setLessons(entries)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  async function saveAvailability(patch: Partial<Settings>): Promise<void> {
    if (!settings) return
    const updated = await window.sinapsi.settings.set(patch)
    setSettings(updated)
    const refreshed = await window.sinapsi.plan.week()
    setData(refreshed)
  }

  function launchLesson(lessonId: string | undefined): void {
    if (!lessonId) return
    void window.sinapsi.lessons.launch(lessonId).then(onLaunched)
  }

  return (
    <main className="week-plan">
      <header className="week-plan-header">
        <button type="button" onClick={onBack}>
          Indietro
        </button>
        <h1>Piano della settimana</h1>
      </header>
      {error && <p role="alert">{error}</p>}
      <section className="plan-availability">
        <h2>Disponibilità</h2>
        <div className="plan-hours">
          {WEEKDAYS.map((label, index) => (
            <label key={label} htmlFor={`study-hours-${index}`}>
              {label}
              <input
                id={`study-hours-${index}`}
                type="number"
                min="0"
                max="16"
                step="0.5"
                value={settings?.studyHours[index] ?? 0}
                onChange={(event) => {
                  if (!settings) return
                  const studyHours = [...settings.studyHours]
                  studyHours[index] = Number(event.target.value)
                  setSettings({ ...settings, studyHours })
                }}
                onBlur={() =>
                  settings && void saveAvailability({ studyHours: settings.studyHours })
                }
              />
              <small>ore</small>
            </label>
          ))}
        </div>
        <label htmlFor="plan-buffer">Margine non assegnabile</label>
        <div className="plan-buffer-control">
          <input
            id="plan-buffer"
            type="range"
            min="0.15"
            max="0.2"
            step="0.01"
            value={settings?.planBuffer ?? 0.15}
            onChange={(event) =>
              settings && setSettings({ ...settings, planBuffer: Number(event.target.value) })
            }
            onMouseUp={() => settings && void saveAvailability({ planBuffer: settings.planBuffer })}
            onPointerUp={() =>
              settings && void saveAvailability({ planBuffer: settings.planBuffer })
            }
            onKeyUp={() => settings && void saveAvailability({ planBuffer: settings.planBuffer })}
          />
          <span>{Math.round((settings?.planBuffer ?? 0.15) * 100)}%</span>
        </div>
      </section>
      <section className="plan-days" aria-label="Prossimi sette giorni">
        {data?.plan.days.map((day) => (
          <article className="plan-day" key={day.date}>
            <header>
              <h2>
                {new Date(`${day.date}T12:00:00`).toLocaleDateString('it-IT', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long'
                })}
              </h2>
              <span>
                {day.minutes / 60} ore · margine {day.bufferMinutes} min
              </span>
            </header>
            {day.blocks.length === 0 ? (
              <p>Nessun blocco assegnato.</p>
            ) : (
              day.blocks.map((block, index) => {
                const blockLessons = block.lessonIds
                  .map((id) => lessons.find((lesson) => lesson.id === id))
                  .filter((lesson): lesson is LessonEntry => !!lesson)
                return (
                  <div className="plan-block" key={`${block.courseId}-${index}`}>
                    <h3>
                      {block.courseId} · {block.minutes} min
                    </h3>
                    <p>
                      {block.phase} · {block.reason}
                    </p>
                    {block.kind === 'lesson' ? (
                      <>
                        {blockLessons.length > 0 && (
                          <ul>
                            {blockLessons.map((lesson) => (
                              <li key={lesson.id}>{lesson.topic}</li>
                            ))}
                          </ul>
                        )}
                        <button
                          type="button"
                          disabled={!block.lessonIds[0]}
                          onClick={() => launchLesson(block.lessonIds[0])}
                        >
                          Avvia lezione
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onOpenPracticeSetup(block.conceptIds, true)}
                      >
                        Avvia simulazione
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </article>
        ))}
      </section>
      <ReadinessPanel items={data?.readiness ?? []} />
    </main>
  )
}
