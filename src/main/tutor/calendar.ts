import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'

const Schedule = z.array(z.object({ giorno: z.string().default(''), ora: z.string().default('') }).passthrough()).catch([])
const Exam = z.array(z.object({ nome: z.string().default('Esame'), data: z.string().default('') }).passthrough()).catch([])
const Course = z.object({ id: z.string().default(''), nome: z.string().default('Corso'), moc: z.string().default(''), start_year: z.number().optional(), fonte: z.unknown().optional(), orario: Schedule.default([]), esami: Exam.default([]) }).passthrough()
// One malformed course must not hide the others.
const Courses = z.array(z.unknown()).catch([]).transform((xs) => xs.flatMap((x) => { const r = Course.safeParse(x); return r.success ? [r.data] : [] }))
const weekday: Record<string, number> = { lun: 1, mar: 2, mer: 3, gio: 4, ven: 5, sab: 6, dom: 0 }
const localDate = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export type TutorCalendar = {
  courses: { id: string; nome: string; orario: { giorno: string; ora: string }[]; esami: { nome: string; data: string }[] }[]
  lessons: { course: string; courseName: string; date: string; number?: number; text: string; coverage: { total: number; covered: number; missing: string[] } }[]
  nextLesson: { course: string; courseName: string; date: string; time: string } | null
  exams: { course: string; courseName: string; name: string; date: string }[]
}

function validFile<T>(value: string, schema: z.ZodType<T>, fallback: T): T {
  try { return schema.parse(JSON.parse(value)) } catch { return fallback }
}

export async function readTutorCalendar(vaultPath: string, now = new Date()): Promise<TutorCalendar> {
  const dir = join(vaultPath, '.antigravity', 'tutor')
  const read = async (name: string): Promise<string> => { try { return await readFile(join(dir, name), 'utf8') } catch { return '' } }
  const [coursesText, lessonsText, stateText] = await Promise.all([read('courses.json'), read('lessons.jsonl'), read('state.json')])
  const rawCourses = validFile(coursesText, Courses, [])
  const courses = rawCourses.map(c => ({ id: c.id, nome: c.nome, orario: c.orario.map(x => ({ giorno: x.giorno, ora: x.ora })), esami: c.esami.map(x => ({ nome: x.nome, data: x.data })) }))
  const names = new Map(rawCourses.flatMap(c => [[c.id, c.nome], [c.nome, c.nome]]))
  const stateSchema = z.object({ courses: z.array(z.object({ id: z.string().optional(), nome: z.string().optional(), lessons: z.array(z.object({ date: z.string().default(''), items: z.array(z.object({ concept: z.string().default(''), status: z.string().default(''), title: z.string().optional() }).passthrough()).default([]) }).passthrough()).default([]) }).passthrough()).default([]) }).passthrough()
  const state = validFile(stateText, stateSchema, { courses: [] })
  const stateLessons = new Map<string, Map<string, { total: number; covered: number; missing: string[] }>>()
  for (const c of state.courses) {
    const key = c.id ?? c.nome ?? ''
    const dates = new Map<string, { total: number; covered: number; missing: string[] }>()
    for (const lesson of c.lessons) {
      const missing = lesson.items.filter(i => i.status !== 'coperto').map(i => i.title || i.concept).filter(Boolean)
      dates.set(lesson.date, { total: lesson.items.length, covered: lesson.items.length - missing.length, missing })
    }
    stateLessons.set(key, dates)
    if (c.id && c.nome) stateLessons.set(c.nome, dates)
  }
  const lessons: TutorCalendar['lessons'] = []
  for (const line of lessonsText.split(/\r?\n/).filter(Boolean)) {
    try {
      const entry = z.object({ lesson: z.object({ course: z.string().default(''), date: z.string().default(''), text: z.string().default(''), number: z.number().nullish().catch(undefined) }).passthrough() }).passthrough().parse(JSON.parse(line)).lesson
      const coverage = stateLessons.get(entry.course)?.get(entry.date) ?? { total: 0, covered: 0, missing: [] }
      lessons.push({ course: entry.course, courseName: names.get(entry.course) ?? entry.course, date: entry.date, ...(entry.number == null ? {} : { number: entry.number }), text: entry.text, coverage })
    } catch { /* tolerate malformed lines */ }
  }
  lessons.sort((a, b) => b.date.localeCompare(a.date))
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const candidates = rawCourses.flatMap(c => c.orario.flatMap(s => {
    const day = weekday[s.giorno.slice(0, 3).toLowerCase()]
    if (day === undefined || !/^\d\d:\d\d$/.test(s.ora)) return []
    const delta = (day - today.getDay() + 7) % 7
    const date = new Date(today); date.setDate(date.getDate() + delta)
    if (delta === 0 && s.ora <= `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`) date.setDate(date.getDate() + 7)
    return [{ course: c.id || c.nome, courseName: c.nome, date: localDate(date), time: s.ora }]
  }))
  candidates.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
  const todayString = localDate(today)
  const exams = courses.flatMap(c => c.esami.filter(e => /^\d{4}-\d\d-\d\d$/.test(e.data) && e.data >= todayString).map(e => ({ course: c.id, courseName: c.nome, name: e.nome, date: e.data }))).sort((a, b) => a.date.localeCompare(b.date))
  return { courses, lessons, nextLesson: candidates[0] ?? null, exams }
}
