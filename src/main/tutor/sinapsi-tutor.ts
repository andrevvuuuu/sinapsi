import { access, readFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { z } from 'zod'
import type { GraphData } from '../../shared/graph-types'
import type { Memory, ReviewLine } from '../../shared/memory-types'
import type { VaultIndex } from '../../shared/vault-types'
import {
  TUTOR_STATES,
  type SinapsiTutorReport,
  type TutorItem,
  type TutorItemState,
  type TutorLesson,
  type TutorLessonStats
} from '../../shared/tutor-types'
import { readTutorCalendar, type TutorCalendar } from './calendar'

/*
 * SinapsiTutorService: Sinapsi's own lesson tutor.
 *
 * From the Obsidian lesson tutor (.antigravity/tutor, read-only, never written) it takes only the
 * link to the lessons: which lessons happened and which concepts each introduced, with the vault
 * note each concept lives in. Its verdicts ("coperto"…) are ignored. Coverage and mastery are
 * Sinapsi's: a lesson concept maps to the Sinapsi concepts extracted from its note, and how well
 * it is internalised is FSRS recall rebuilt from the Ripasso and Pratica log.
 */

const Item = z
  .object({
    concept: z.string().default(''),
    title: z.string().optional(),
    kind: z.string().default('concetto'),
    note: z.string().nullish()
  })
  .passthrough()
const State = z
  .object({
    courses: z
      .array(
        z
          .object({
            id: z.string().optional(),
            nome: z.string().optional(),
            lessons: z
              .array(
                z
                  .object({
                    date: z.string().default(''),
                    items: z.array(z.unknown()).catch([]).default([])
                  })
                  .passthrough()
              )
              .catch([])
              .default([])
          })
          .passthrough()
      )
      .catch([])
      .default([])
  })
  .passthrough()

export type TutorLessonItems = Map<string, { label: string; kind: string; note: string | null }[]>

const lessonKey = (course: string, date: string): string => `${course}|${date}`
const noteKey = (s: string): string => s.trim().toLowerCase()
const titleOf = (path: string): string => noteKey(basename(path, extname(path)))

/** The concepts of each lesson, keyed "course|date" (both the course id and its name). */
export function parseLessonItems(stateText: string): TutorLessonItems {
  const out: TutorLessonItems = new Map()
  let state: z.infer<typeof State>
  try {
    state = State.parse(JSON.parse(stateText))
  } catch {
    return out
  }
  for (const course of state.courses) {
    for (const lesson of course.lessons) {
      const items = lesson.items.flatMap((raw) => {
        const r = Item.safeParse(raw)
        if (!r.success) return []
        const label = (r.data.title || r.data.concept).trim()
        return label ? [{ label, kind: r.data.kind, note: r.data.note?.trim() || null }] : []
      })
      for (const key of [course.id, course.nome])
        if (key) out.set(lessonKey(key, lesson.date), items)
    }
  }
  return out
}

const emptyByState = (): Record<TutorItemState, number> =>
  Object.fromEntries(TUTOR_STATES.map((s) => [s, 0])) as Record<TutorItemState, number>

export function stateForMastery(mastery: number): TutorItemState {
  return mastery >= 0.85 ? 'interiorizzato' : mastery >= 0.6 ? 'in corso' : 'fragile'
}

export function summarise(items: TutorItem[]): TutorLessonStats {
  const byState = emptyByState()
  for (const i of items) byState[i.state]++
  const linked = items.filter((i) => i.mastery !== null)
  return {
    total: items.length,
    linked: linked.length,
    covered: items.filter((i) => i.studied > 0).length,
    mastery: linked.length
      ? linked.reduce((s, i) => s + (i.mastery ?? 0), 0) / linked.length
      : null,
    byState
  }
}

/** Pure: the report from the lesson link, the Sinapsi graph and the Sinapsi memory. */
export function buildTutorReport(input: {
  calendar: TutorCalendar
  items: TutorLessonItems
  graph: GraphData
  memory: Map<string, Memory>
  /** Note title (lower case) → path in the vault. */
  notePaths?: Map<string, string>
  connected: boolean
  now: number
}): SinapsiTutorReport {
  // Note title → Sinapsi concepts appearing in that note.
  const byNote = new Map<string, string[]>()
  for (const c of input.graph.concepts)
    for (const path of c.notes) {
      const k = titleOf(path)
      const list = byNote.get(k) ?? []
      if (!list.includes(c.id)) list.push(c.id)
      byNote.set(k, list)
    }

  const itemOf = (raw: { label: string; kind: string; note: string | null }): TutorItem => {
    const conceptIds = raw.note ? (byNote.get(noteKey(raw.note)) ?? []) : []
    const notePath = raw.note ? (input.notePaths?.get(noteKey(raw.note)) ?? null) : null
    if (!conceptIds.length)
      return {
        ...raw,
        notePath,
        conceptIds,
        studied: 0,
        mastery: null,
        state: raw.note ? 'da estrarre' : 'scollegato',
        lastStudiedAt: null
      }
    const mems = conceptIds
      .map((id) => input.memory.get(id))
      .filter((m): m is Memory => !!m && m.R !== null)
    const mastery = mems.reduce((s, m) => s + (m.R ?? 0), 0) / conceptIds.length
    const last = mems.reduce<number | null>(
      (t, m) => (m.lastAt !== null && (t === null || m.lastAt > t) ? m.lastAt : t),
      null
    )
    return {
      ...raw,
      notePath,
      conceptIds,
      studied: mems.length,
      mastery,
      state: mems.length ? stateForMastery(mastery) : 'mai studiato',
      lastStudiedAt: last
    }
  }

  const lessons: TutorLesson[] = input.calendar.lessons.map((l) => {
    const items = (input.items.get(lessonKey(l.course, l.date)) ?? []).map(itemOf)
    return {
      course: l.course,
      courseName: l.courseName,
      date: l.date,
      ...(l.number === undefined ? {} : { number: l.number }),
      text: l.text,
      items,
      stats: summarise(items),
      lastStudiedAt: items.reduce<number | null>(
        (t, i) =>
          i.lastStudiedAt !== null && (t === null || i.lastStudiedAt > t) ? i.lastStudiedAt : t,
        null
      )
    }
  })

  const ids = [
    ...new Set([
      ...input.calendar.courses.map((c) => c.id || c.nome),
      ...lessons.map((l) => l.course)
    ])
  ]
  const courses = ids.map((id) => {
    const own = lessons.filter((l) => l.course === id)
    const name =
      input.calendar.courses.find((c) => (c.id || c.nome) === id)?.nome ?? own[0]?.courseName ?? id
    return { id, name, lessons: own.length, stats: summarise(own.flatMap((l) => l.items)) }
  })

  return { connected: input.connected, courses, lessons, generatedAt: input.now }
}

export type SinapsiTutorService = { report(): Promise<SinapsiTutorReport> }

export function createSinapsiTutorService(deps: {
  vaultPath: () => Promise<string>
  graph: () => Promise<GraphData>
  reviews: () => Promise<ReviewLine[]>
  memoryOf: (reviews: ReviewLine[], now: number) => Map<string, Memory>
  /** Sinapsi's vault index, to find each lesson note's path. */
  vault?: () => Promise<VaultIndex | null>
  now?: () => number
}): SinapsiTutorService {
  return {
    async report() {
      const now = deps.now?.() ?? Date.now()
      const vault = await deps.vaultPath()
      const dir = join(vault, '.antigravity', 'tutor')
      const connected = await access(dir).then(
        () => true,
        () => false
      )
      const [calendar, stateText, graph, reviews] = await Promise.all([
        readTutorCalendar(vault, new Date(now)),
        readFile(join(dir, 'state.json'), 'utf8').catch(() => ''),
        deps.graph(),
        deps.reviews()
      ])
      const index = await (deps.vault?.() ?? Promise.resolve(null)).catch(() => null)
      const notePaths = new Map<string, string>()
      for (const n of index?.notes ?? [])
        for (const t of [n.title, ...n.aliases])
          if (!notePaths.has(noteKey(t))) notePaths.set(noteKey(t), n.path)
      return buildTutorReport({
        calendar,
        items: parseLessonItems(stateText),
        graph,
        memory: deps.memoryOf(reviews, now),
        notePaths,
        connected,
        now
      })
    }
  }
}
