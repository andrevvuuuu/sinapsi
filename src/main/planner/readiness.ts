import type { ExamEntry } from '../../shared/exam-types'
import type { LessonEntry } from '../../shared/lesson-types'
import type { Memory, ReviewLine } from '../../shared/memory-types'
import type { Readiness, Signal } from '../../shared/plan-types'

export function readinessFor(input: {
  exam: ExamEntry
  lessons: LessonEntry[]
  memories: Record<string, Memory>
  reviews: ReviewLine[]
  examResults: { conceptIds: string[]; total: number; at: number }[]
  now: number
}): Readiness {
  const { exam, lessons, memories, reviews, examResults, now } = input
  const concepts = [...new Set(lessons.flatMap((l) => l.conceptIds))]
  const relevant = reviews.filter((r) => concepts.includes(r.conceptId))
  const paper = examResults.filter(
    (r) => r.at >= now - 60 * 86400000 && r.conceptIds.some((id) => concepts.includes(id))
  )
  const mistaken = new Set(relevant.filter((r) => r.misconception).map((r) => r.conceptId))
  const explain = concepts.filter((id) =>
    relevant.some((r) => r.conceptId === id && r.type === 'explain')
  )
  const recentExplain = new Set(
    relevant
      .filter(
        (r) => r.type === 'explain' && r.at >= now - 30 * 86400000 && (r.correct ?? r.grade >= 3)
      )
      .map((r) => r.conceptId)
  )
  const qs = lessons.flatMap((l) => l.confusionQuestions)
  const signals: Signal[] = [
    {
      key: 'papers',
      label: 'Simulazioni senza aiuti',
      value: paper.length ? Math.min(1, Math.max(...paper.map((r) => r.total)) / 30) : null,
      detail: paper.length ? `${paper.length} simulazioni valutate` : 'Nessuna simulazione recente'
    },
    {
      key: 'errors',
      label: 'Errori chiariti',
      value: mistaken.size
        ? [...mistaken].filter((id) => !memories[id]?.misconception).length / mistaken.size
        : null,
      detail: mistaken.size
        ? `${[...mistaken].filter((id) => !memories[id]?.misconception).length} su ${mistaken.size} errori chiariti`
        : 'Nessun errore segnalato'
    },
    {
      key: 'network',
      label: 'Concetti consolidati',
      value: concepts.length
        ? concepts.filter((id) => memories[id]?.state === 'la sai').length / concepts.length
        : null,
      detail: concepts.length
        ? `${concepts.filter((id) => memories[id]?.state === 'la sai').length} su ${concepts.length} concetti`
        : 'Il corso non ha concetti collegati'
    },
    {
      key: 'teach',
      label: 'Spiegalo tu superato',
      value: explain.length
        ? explain.filter((id) => recentExplain.has(id)).length / explain.length
        : null,
      detail: explain.length
        ? `${explain.filter((id) => recentExplain.has(id)).length} su ${explain.length} concetti spiegati di recente`
        : 'Nessuna prova di spiegazione'
    },
    {
      key: 'doubts',
      label: 'Dubbi chiusi',
      value: qs.length
        ? qs.filter((q) => q.status === 'resolved').length / qs.length
        : lessons.length
          ? 1
          : null,
      detail: qs.length
        ? `${qs.filter((q) => q.status === 'resolved').length} su ${qs.length} dubbi chiusi`
        : 'Nessun dubbio aperto'
    }
  ]
  const values = signals.flatMap((s) => (s.value === null ? [] : [s.value])),
    score = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
  return {
    examId: exam.id,
    courseId: exam.courseId,
    daysLeft: Math.ceil((Date.parse(`${exam.date}T00:00:00`) - now) / 86400000),
    signals,
    score,
    status:
      score === null
        ? 'da misurare'
        : score >= 0.8
          ? 'pronto'
          : score >= 0.6
            ? 'quasi'
            : 'non ancora'
  }
}
