import './lessons.css'
import { useEffect, useMemo, useState } from 'react'
import type { LaunchDestination, LessonEntry, MasteryLevel } from '../../../shared/lesson-types'
import type { Catalog } from '../../../shared/practice-types'
import { LaunchButton } from './LaunchButton'

export function LessonDetail({
  id,
  onBack,
  onEdit,
  onLaunched
}: {
  id: string
  onBack: () => void
  onEdit: () => void
  onLaunched: (result: LaunchDestination) => void
}): React.JSX.Element {
  const [lesson, setLesson] = useState<LessonEntry | null>(null)
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [question, setQuestion] = useState('')
  const [error, setError] = useState('')
  const reload = (): void => {
    void window.sinapsi.lessons
      .get(id)
      .then(setLesson)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
  }
  useEffect(() => {
    reload()
    void window.sinapsi.practice
      .catalog()
      .then(setCatalog)
      .catch(() => undefined)
  }, [id])
  const names = useMemo(
    () =>
      new Map(
        catalog?.subjects.flatMap((subject) =>
          subject.notes.flatMap((note) =>
            note.concepts.map((concept) => [concept.id, concept.name] as const)
          )
        ) ?? []
      ),
    [catalog]
  )
  if (!lesson)
    return (
      <main className="lessons">
        <p>{error || 'Caricamento lezione…'}</p>
      </main>
    )
  return (
    <main className="lessons lesson-detail">
      <header className="lesson-sticky">
        <button className="btn" type="button" onClick={onBack}>
          ← Registro
        </button>
        <div>
          <h1>{lesson.topic}</h1>
          <p>
            {lesson.courseId} · {lesson.date}
          </p>
        </div>
        <LaunchButton lesson={lesson} onLaunched={onLaunched} />
      </header>
      <section>
        <h2>Nucleo 80/20</h2>
        <ul>
          {lesson.core8020.map((point, index) => (
            <li key={index}>{point}</li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Concetti collegati</h2>
        {lesson.conceptIds.length ? (
          <ul>
            {lesson.conceptIds.map((conceptId) => (
              <li key={conceptId}>{names.get(conceptId) ?? 'Concetto non più disponibile'}</li>
            ))}
          </ul>
        ) : (
          <p>Nessun concetto collegato.</p>
        )}
      </section>
      <section>
        <h2>Dubbi aperti</h2>
        {lesson.confusionQuestions.map((item) => (
          <p key={item.id}>
            {item.text}
            {item.status === 'open' && (
              <button
                className="btn"
                type="button"
                onClick={() =>
                  void window.sinapsi.lessons.resolveConfusion(id, item.id).then(reload)
                }
              >
                Risolvi
              </button>
            )}
          </p>
        ))}
        <label htmlFor="lesson-question">Aggiungi un dubbio</label>
        <textarea
          id="lesson-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
        />
        <button
          className="btn"
          type="button"
          disabled={!question.trim()}
          onClick={() =>
            void window.sinapsi.lessons.addConfusion(id, question).then(() => {
              setQuestion('')
              reload()
            })
          }
        >
          Aggiungi dubbio
        </button>
      </section>
      <section>
        <h2>Padronanza</h2>
        <label htmlFor="lesson-mastery">Livello</label>
        <select
          id="lesson-mastery"
          value={lesson.masteryLevel}
          onChange={(event) =>
            void window.sinapsi.lessons
              .setMastery(id, event.target.value as MasteryLevel)
              .then(reload)
          }
        >
          <option value="known">Acquisita</option>
          <option value="partial">Parziale</option>
          <option value="unknown">Da imparare</option>
        </select>
      </section>
      <section>
        <h2>Cronologia digestione</h2>
        <ol>
          {(['digest', 'recall24h', 'weekly'] as const).map((step) => (
            <li key={step}>
              {step === 'digest'
                ? 'Digestione iniziale'
                : step === 'recall24h'
                  ? 'Richiamo 24 ore'
                  : 'Ripasso settimanale'}
              :{' '}
              {lesson.digest[step]
                ? new Date(lesson.digest[step]!).toLocaleString('it-IT')
                : 'Da fare'}
            </li>
          ))}
        </ol>
      </section>
      <button className="btn" type="button" onClick={onEdit}>
        Modifica
      </button>
    </main>
  )
}
