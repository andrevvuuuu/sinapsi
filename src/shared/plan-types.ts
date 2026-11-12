export type PlanBlock = {
  courseId: string
  minutes: number
  kind: 'lesson' | 'exam-sim'
  lessonIds: string[]
  conceptIds: string[]
  reason: string
  phase: 'fondamenta' | 'pratica' | 'simulazioni'
}
export type DayPlan = { date: string; minutes: number; bufferMinutes: number; blocks: PlanBlock[] }
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
