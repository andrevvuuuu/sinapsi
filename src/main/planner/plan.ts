import type { ExamEntry } from '../../shared/exam-types'
import type { LessonEntry } from '../../shared/lesson-types'
import type { Memory } from '../../shared/memory-types'
import type { DayPlan, PlanBlock, WeekPlan } from '../../shared/plan-types'
import { pendingDigest } from '../lessons/reduce'

type Input = {
  today: string
  exams: ExamEntry[]
  lessons: LessonEntry[]
  memories: Record<string, Memory>
  studyHours: number[]
  buffer: number
}
type CourseScore = { course: string; score: number }

function localDate(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function dateAtLocalNoon(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

function daysBetween(from: string, to: string): number {
  return Math.round((dateAtLocalNoon(to).getTime() - dateAtLocalNoon(from).getTime()) / 86400000)
}

function pendingAt(lesson: LessonEntry, date: string): boolean {
  return pendingDigest(lesson, dateAtLocalNoon(date).getTime()) !== null
}

function scoreCourse(
  course: string,
  date: string,
  exams: ExamEntry[],
  lessons: LessonEntry[]
): number {
  const exam = exams
    .filter((entry) => entry.courseId === course && entry.date >= date)
    .sort((a, b) => a.date.localeCompare(b.date))[0]
  const courseLessons = lessons.filter((lesson) => lesson.courseId === course)
  const pendingCount = courseLessons.filter((lesson) => pendingAt(lesson, date)).length
  const examScore = exam
    ? ((exam.weight ?? 0.5) * 30) / Math.max(1, daysBetween(date, exam.date))
    : 0
  const lessonScore = courseLessons.reduce((sum, lesson) => {
    const mastery =
      lesson.masteryLevel === 'unknown' ? 1 : lesson.masteryLevel === 'partial' ? 0.5 : 0
    return sum + (mastery * (lesson.examWeight ?? 0.5)) / 10
  }, 0)
  return examScore + 0.5 * pendingCount + lessonScore
}

function coursePhase(exam: ExamEntry | undefined, date: string): PlanBlock['phase'] {
  if (!exam) return 'fondamenta'
  const remaining = daysBetween(date, exam.date)
  if (remaining > 20) return 'fondamenta'
  if (remaining >= 10) return 'pratica'
  return 'simulazioni'
}

function lessonOrder(lessons: LessonEntry[], date: string): LessonEntry[] {
  return [...lessons].sort((a, b) => {
    const aPending = pendingAt(a, date) ? 1 : 0
    const bPending = pendingAt(b, date) ? 1 : 0
    if (aPending !== bPending) return bPending - aPending
    const aRank = a.masteryLevel === 'unknown' ? 2 : a.masteryLevel === 'partial' ? 1 : 0
    const bRank = b.masteryLevel === 'unknown' ? 2 : b.masteryLevel === 'partial' ? 1 : 0
    if (aRank !== bRank) return bRank - aRank
    if (a.masteryLevel === 'unknown' && b.masteryLevel === 'unknown') {
      return (b.examWeight ?? 0.5) - (a.examWeight ?? 0.5)
    }
    return 0
  })
}

function blockReason(
  exam: ExamEntry | undefined,
  lessons: LessonEntry[],
  pendingCount: number,
  date: string
): string {
  if (pendingCount) return `${pendingCount} digestioni in sospeso`
  if (exam)
    return `esame tra ${daysBetween(date, exam.date)} giorni · ${lessons.length} lezioni da consolidare`
  return `${lessons.length} lezioni da consolidare`
}

function makeBlock(
  course: string,
  date: string,
  minutes: number,
  exams: ExamEntry[],
  lessons: LessonEntry[]
): PlanBlock {
  const courseLessons = lessons.filter((lesson) => lesson.courseId === course)
  const exam = exams
    .filter((entry) => entry.courseId === course && entry.date >= date)
    .sort((a, b) => a.date.localeCompare(b.date))[0]
  const phase = coursePhase(exam, date)
  const pendingCount = courseLessons.filter((lesson) => pendingAt(lesson, date)).length
  const kind = phase === 'simulazioni' ? 'exam-sim' : 'lesson'
  return {
    courseId: course,
    minutes,
    kind,
    lessonIds:
      kind === 'lesson'
        ? lessonOrder(courseLessons, date)
            .slice(0, 3)
            .map((lesson) => lesson.id)
        : [],
    conceptIds:
      kind === 'exam-sim'
        ? [...new Set(courseLessons.flatMap((lesson) => lesson.conceptIds))].slice(0, 30)
        : [],
    reason: blockReason(exam, courseLessons, pendingCount, date),
    phase
  }
}

function makeDay(
  input: Input,
  date: string,
  index: number,
  candidates: string[],
  lastAssigned: Map<string, number>,
  assignmentCount: Map<string, number>
): DayPlan {
  const weekday = (dateAtLocalNoon(date).getDay() + 6) % 7
  const minutes = Math.round((input.studyHours[weekday] ?? 0) * 60)
  const bufferMinutes = Math.round(minutes * input.buffer)
  const usefulMinutes = Math.max(0, minutes - bufferMinutes)
  if (!minutes || usefulMinutes < 30) return { date, minutes, bufferMinutes, blocks: [] }

  const ranked: CourseScore[] = candidates
    .map((course) => {
      const base = scoreCourse(course, date, input.exams, input.lessons)
      const assignedYesterday = lastAssigned.get(course) === index - 1
      return { course, score: assignedYesterday ? base * 0.5 : base }
    })
    .sort((a, b) => {
      const scoreOrder = b.score - a.score
      if (scoreOrder !== 0) return scoreOrder
      const aAssignedYesterday = lastAssigned.get(a.course) === index - 1
      const bAssignedYesterday = lastAssigned.get(b.course) === index - 1
      const recentOrder = Number(aAssignedYesterday) - Number(bAssignedYesterday)
      if (recentOrder !== 0) return recentOrder
      return (assignmentCount.get(a.course) ?? 0) - (assignmentCount.get(b.course) ?? 0)
    })
  const count = ranked.length >= 2 && usefulMinutes >= 60 ? 2 : 1
  let selected = ranked.slice(0, count)
  const totalScore = selected.reduce((sum, item) => sum + item.score, 0)
  const share = (item: CourseScore): number =>
    totalScore > 0 ? item.score / totalScore : 1 / selected.length
  if (
    selected.length === 2 &&
    selected.some((item) => Math.round(usefulMinutes * share(item)) < 30)
  ) {
    selected = selected.slice(0, 1)
  }
  const assignedScore = selected.reduce((sum, item) => sum + item.score, 0)
  const assignedShare = (item: CourseScore): number =>
    assignedScore > 0 ? item.score / assignedScore : 1 / selected.length
  const blocks = selected
    .map((item, blockIndex) => {
      lastAssigned.set(item.course, index)
      assignmentCount.set(item.course, (assignmentCount.get(item.course) ?? 0) + 1)
      const blockMinutes =
        selected.length === 1
          ? usefulMinutes
          : blockIndex === selected.length - 1
            ? usefulMinutes - Math.round(usefulMinutes * assignedShare(item))
            : Math.round(usefulMinutes * assignedShare(item))
      return makeBlock(item.course, date, blockMinutes, input.exams, input.lessons)
    })
    .filter((block) => block.minutes >= 30)
  return { date, minutes, bufferMinutes, blocks }
}

export function buildWeekPlan(input: Input): WeekPlan {
  const start = dateAtLocalNoon(input.today)
  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start)
    date.setDate(date.getDate() + index)
    return localDate(date)
  })
  const candidatesFor = (date: string): string[] => [
    ...new Set([
      ...input.exams.filter((exam) => exam.date >= date).map((exam) => exam.courseId),
      ...input.lessons.filter((lesson) => pendingAt(lesson, date)).map((lesson) => lesson.courseId)
    ])
  ]
  const lastAssigned = new Map<string, number>()
  const assignmentCount = new Map<string, number>()
  return {
    days: dates.map((date, index) =>
      makeDay(input, date, index, candidatesFor(date), lastAssigned, assignmentCount)
    )
  }
}
