/**
 * Sinapsi's own tutor. The lessons and the concepts each one introduced come from the Obsidian
 * lesson tutor (read-only); coverage and mastery come only from what Andrea did in Sinapsi.
 */

/** How well Sinapsi thinks one lesson concept is internalised. */
export type TutorItemState =
  /** The lesson tutor found no vault note for the concept. */
  | 'scollegato'
  /** It has a note, but Sinapsi has not extracted that note's concepts yet. */
  | 'da estrarre'
  /** Sinapsi knows its concepts but Andrea has never practised them here. */
  | 'mai studiato'
  /** Average recall below 60%. */
  | 'fragile'
  /** Average recall between 60% and 85%. */
  | 'in corso'
  /** Average recall at least 85%. */
  | 'interiorizzato'

export type TutorItem = {
  /** The concept as the lesson tutor names it. */
  label: string
  kind: string
  /** The vault note it belongs to (title, no extension), when the lesson tutor found one. */
  note: string | null
  /** The note's path in the vault, when Sinapsi's vault index finds it (to extract or open it). */
  notePath: string | null
  /** The Sinapsi concepts extracted from that note. */
  conceptIds: string[]
  /** How many of them were practised at least once in Sinapsi. */
  studied: number
  /** Mean recall over all of them (never-practised count as 0), 0–1; null when scollegato or da estrarre. */
  mastery: number | null
  state: TutorItemState
  lastStudiedAt: number | null
}

export type TutorLessonStats = {
  /** Lesson concepts. */
  total: number
  /** Lesson concepts linked to Sinapsi concepts. */
  linked: number
  /** Lesson concepts practised in Sinapsi at least once. */
  covered: number
  /** Mean mastery over linked concepts, 0–1; null when none is linked. */
  mastery: number | null
  byState: Record<TutorItemState, number>
}

export type TutorLesson = {
  course: string
  courseName: string
  date: string
  number?: number
  text: string
  items: TutorItem[]
  stats: TutorLessonStats
  lastStudiedAt: number | null
}

export type TutorCourse = { id: string; name: string; stats: TutorLessonStats; lessons: number }

export type SinapsiTutorReport = {
  /** False when the vault has no lesson tutor folder to read. */
  connected: boolean
  courses: TutorCourse[]
  /** Newest first. */
  lessons: TutorLesson[]
  generatedAt: number
}

export const TUTOR_STATES: TutorItemState[] = [
  'interiorizzato',
  'in corso',
  'fragile',
  'mai studiato',
  'da estrarre',
  'scollegato'
]
