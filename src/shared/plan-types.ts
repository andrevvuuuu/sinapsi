export type PlanBlock = {
  courseId: string
  minutes: number
  kind: 'lesson' | 'exam-sim'
  lessonIds: string[]
  conceptIds: string[]
  reason: string
  phase: 'fondamenta' | 'pratica' | 'simulazioni'
}
export type DayPlan = {
  date: string
  minutes: number
  bufferMinutes: number
  blocks: PlanBlock[]
  /** FSRS reviews falling due that day (overdue ones on the first day): estimated time, taken before the lessons. */
  reviewMinutes: number
  reviewConceptIds: string[]
}
export type WeekPlan = { days: DayPlan[] }
export type Signal = {
  key: 'papers' | 'errors' | 'network' | 'teach' | 'doubts'
  label: string
  value: number | null
  detail: string
}
export type Readiness = {
  examId: string
  courseId: string
  daysLeft: number
  signals: Signal[]
  score: number | null
  status: 'pronto' | 'quasi' | 'non ancora' | 'da misurare'
}
