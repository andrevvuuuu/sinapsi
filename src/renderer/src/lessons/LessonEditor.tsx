import './lessons.css'
import { useEffect, useMemo, useState } from 'react'
import type { LessonEntry, PacerType, Ref } from '../../../shared/lesson-types'
import type { Catalog } from '../../../shared/practice-types'

const pacerLabels: Record<PacerType, string> = {
  P: 'Procedurale',
  A: 'Astratto',
  C: 'Concettuale',
  E: 'Esempi',
  R: 'Risoluzione problemi'
}
type ResourceDraft = { label: string; ref: string }

export function LessonEditor({
  id,
  onSaved,
  onBack
}: {
  id?: string
  onSaved: () => void
  onBack: () => void
}): React.JSX.Element {
  const [entry, setEntry] = useState<LessonEntry | null>(null)
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [course, setCourse] = useState('')
  const [topic, setTopic] = useState('')
  const [note, setNote] = useState('')
  const [core, setCore] = useState<string[]>([''])
  const [pacer, setPacer] = useState<PacerType>('C')
  const [conceptIds, setConceptIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [resources, setResources] = useState<ResourceDraft[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    void window.sinapsi.practice
      .catalog()
      .then(setCatalog)
      .catch(() => undefined)
    if (id)
      void window.sinapsi.lessons
        .get(id)
        .then((value) => {
          setEntry(value)
          setDate(value.date)
          setCourse(value.courseId)
          setTopic(value.topic)
          setNote(value.sourceNote ?? '')
          setCore(value.core8020.length ? value.core8020 : [''])
          setPacer(value.pacerType)
          setConceptIds(value.conceptIds)
          setResources(value.highYieldResources)
        })
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
  }, [id])
  const concepts = useMemo(
    () => catalog?.subjects.flatMap((subject) => subject.notes.flatMap((n) => n.concepts)) ?? [],
    [catalog]
  )
  const visible = concepts.filter((concept) =>
    `${concept.name} ${concept.id}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())
  )
  const save = async (): Promise<void> => {
    if (!date || !course.trim() || !topic.trim()) {
      setError('Inserisci data, corso e argomento.')
      return
    }
    if (core.some((line) => line.length > 1000)) {
      setError('Ogni punto del nucleo può contenere al massimo 1000 caratteri.')
      return
    }
    setError('')
    const payload = {
      date,
      courseId: course.trim(),
      topic: topic.trim(),
      sourceNote: note.trim() || undefined,
      prerequisites: (entry?.prerequisites ?? []) as Ref[],
      core8020: core.map((line) => line.trim()).filter(Boolean),
      pacerType: pacer,
      conceptIds,
      confusionQuestions: entry?.confusionQuestions ?? [],
      activeMisconceptions: entry?.activeMisconceptions ?? [],
      masteryLevel: entry?.masteryLevel ?? ('unknown' as const),
      highYieldResources: resources
        .filter((item) => item.label.trim() || item.ref.trim())
        .map((item) => ({ label: item.label.trim(), ref: item.ref.trim() }))
    }
    try {
      if (id) {
        await window.sinapsi.lessons.update(id, {
          date: payload.date,
          courseId: payload.courseId,
          topic: payload.topic,
          sourceNote: payload.sourceNote,
          prerequisites: payload.prerequisites,
          core8020: payload.core8020,
          pacerType: payload.pacerType,
          conceptIds: payload.conceptIds,
          highYieldResources: payload.highYieldResources
        })
      } else await window.sinapsi.lessons.create(payload)
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  return (
    <main className="lessons lesson-editor">
      <header className="lesson-page-header">
        <button className="btn" type="button" onClick={onBack}>
          ← Home
        </button>
        <h1>{id ? 'Modifica lezione' : 'Nuova lezione'}</h1>
      </header>
      <div className="lesson-fields">
        <label htmlFor="lesson-date">Data</label>
        <input
          id="lesson-date"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
        <label htmlFor="lesson-course">Corso</label>
        <input
          id="lesson-course"
          value={course}
          onChange={(event) => setCourse(event.target.value)}
        />
        <label htmlFor="lesson-topic">Argomento</label>
        <input id="lesson-topic" value={topic} onChange={(event) => setTopic(event.target.value)} />
        <label htmlFor="lesson-note">Nota sorgente (percorso nel vault)</label>
        <input
          id="lesson-note"
          placeholder="Cartella/nota.md"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <fieldset>
          <legend>Nucleo 80/20 · {core.length}/4 righe</legend>
          {core.map((value, index) => (
            <input
              key={index}
              aria-label={`Nucleo 80/20, riga ${index + 1}`}
              value={value}
              maxLength={1000}
              onChange={(event) =>
                setCore((current) =>
                  current.map((item, i) => (i === index ? event.target.value : item))
                )
              }
            />
          ))}
          {core.length < 4 && (
            <button
              className="btn"
              type="button"
              onClick={() => setCore((current) => [...current, ''])}
            >
              Aggiungi riga
            </button>
          )}
        </fieldset>
        <label htmlFor="lesson-pacer">Tipo PACER</label>
        <select
          id="lesson-pacer"
          value={pacer}
          onChange={(event) => setPacer(event.target.value as PacerType)}
        >
          {Object.entries(pacerLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <fieldset>
          <legend>Concetti collegati</legend>
          <label htmlFor="lesson-concept-search">Cerca nel catalogo</label>
          <input
            id="lesson-concept-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {visible.map((concept) => (
            <label className="lesson-check" key={concept.id}>
              <input
                type="checkbox"
                checked={conceptIds.includes(concept.id)}
                onChange={(event) =>
                  setConceptIds((current) =>
                    event.target.checked
                      ? [...current, concept.id]
                      : current.filter((value) => value !== concept.id)
                  )
                }
              />
              {concept.name}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Risorse</legend>
          {resources.map((resource, index) => (
            <div className="lesson-resource" key={index}>
              <label htmlFor={`lesson-resource-label-${index}`}>Titolo risorsa {index + 1}</label>
              <input
                id={`lesson-resource-label-${index}`}
                value={resource.label}
                onChange={(event) =>
                  setResources((current) =>
                    current.map((item, i) =>
                      i === index ? { ...item, label: event.target.value } : item
                    )
                  )
                }
              />
              <label htmlFor={`lesson-resource-ref-${index}`}>Riferimento</label>
              <input
                id={`lesson-resource-ref-${index}`}
                value={resource.ref}
                onChange={(event) =>
                  setResources((current) =>
                    current.map((item, i) =>
                      i === index ? { ...item, ref: event.target.value } : item
                    )
                  )
                }
              />
            </div>
          ))}
          <button
            className="btn"
            type="button"
            onClick={() => setResources((current) => [...current, { label: '', ref: '' }])}
          >
            Aggiungi risorsa
          </button>
        </fieldset>
        {error && (
          <p role="alert" className="lesson-error">
            {error}
          </p>
        )}
        <button className="btn pri" type="button" onClick={() => void save()}>
          Salva lezione
        </button>
      </div>
    </main>
  )
}
