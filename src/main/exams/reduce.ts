import type { ExamEntry, ExamEvent } from '../../shared/exam-types'
export function reduceExams(events: ExamEvent[]): ExamEntry[] {
  const map = new Map<string, ExamEntry>(),
    archived = new Set<string>()
  for (const e of events) {
    if (e.t === 'exam-created') map.set(e.entry.id, e.entry)
    else if (e.t === 'exam-archived') archived.add(e.id)
    else {
      const old = map.get(e.id)
      if (old) map.set(e.id, { ...old, ...e.patch })
    }
  }
  return [...map.values()].filter((e) => !archived.has(e.id))
}
