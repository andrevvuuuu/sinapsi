import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readTutorCalendar } from '../../src/main/tutor/calendar'

const roots: string[] = []
async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'sinapsi-tutor-')); roots.push(root)
  const dir = join(root, '.antigravity', 'tutor'); await mkdir(dir, { recursive: true })
  for (const [name, content] of Object.entries(files)) await writeFile(join(dir, name), content)
  return root
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

describe('readTutorCalendar', () => {
  it('returns an empty calendar for missing and malformed files', async () => {
    const root = await fixture({ 'courses.json': '{broken', 'lessons.jsonl': '{oops}\n', 'state.json': '[]' })
    expect(await readTutorCalendar(root, new Date('2026-11-12T09:00:00'))).toEqual({ courses: [], lessons: [], nextLesson: null, exams: [] })
    const missing = await fixture({})
    expect(await readTutorCalendar(missing)).toMatchObject({ courses: [], lessons: [], nextLesson: null, exams: [] })
  })

  it('skips a lesson time that has passed today and selects the next scheduled class', async () => {
    const root = await fixture({
      'courses.json': JSON.stringify([{ id: 'mat', nome: 'Matematica', orario: [{ giorno: 'gio', ora: '08:30' }, { giorno: 'gio', ora: '11:00' }], esami: [{ nome: 'Parziale', data: '2026-11-20' }] }]),
      'lessons.jsonl': JSON.stringify({ key: 'x', lesson: { course: 'mat', date: '2026-11-10', text: 'Integrali', number: 2 } }),
      'state.json': JSON.stringify({ courses: [{ id: 'mat', lessons: [{ date: '2026-11-10', items: [{ concept: 'Integrale', status: 'coperto' }, { concept: 'Sostituzione', status: 'mancante' }] }] }] })
    })
    const result = await readTutorCalendar(root, new Date('2026-11-12T09:00:00'))
    expect(result.nextLesson).toEqual({ course: 'mat', courseName: 'Matematica', date: '2026-11-12', time: '11:00' })
    expect(result.lessons[0]).toMatchObject({ number: 2, coverage: { total: 2, covered: 1, missing: ['Sostituzione'] } })
    expect(result.exams).toEqual([{ course: 'mat', courseName: 'Matematica', name: 'Parziale', date: '2026-11-20' }])
  })

  it('handles an empty timetable and moves to next week after the final class today', async () => {
    const empty = await fixture({ 'courses.json': JSON.stringify([{ id: 'a', nome: 'A', orario: [] }]) })
    expect((await readTutorCalendar(empty, new Date('2026-11-12T09:00:00'))).nextLesson).toBeNull()
    const timed = await fixture({ 'courses.json': JSON.stringify([{ id: 'a', nome: 'A', orario: [{ giorno: 'gio', ora: '08:00' }] }]) })
    expect((await readTutorCalendar(timed, new Date('2026-11-12T09:00:00'))).nextLesson?.date).toBe('2026-11-19')
  })

  it('reads the shapes the real tutor writes: an object as course source, null lesson numbers, other record kinds', async () => {
    const root = await fixture({
      'courses.json': JSON.stringify([
        { id: 'alg', nome: 'Algebra', moc: 'x.md', start_year: 2026, fonte: { tipo: 'site', url: 'https://e.x' }, orario: [], esami: [{ nome: 'Prova', data: '2026-11-19' }] },
        { id: 'bad', nome: 42 }
      ]),
      'lessons.jsonl': [
        JSON.stringify({ analyzed: 'alg|2026-10-01|x' }),
        JSON.stringify({ key: 'k', lesson: { course: 'alg', date: '2026-10-01', text: 'Gruppi', source: 'gmail_forum', number: null } })
      ].join('\n')
    })
    const result = await readTutorCalendar(root, new Date('2026-11-12T09:00:00'))
    expect(result.courses.map((c) => c.nome)).toEqual(['Algebra'])
    expect(result.lessons).toHaveLength(1)
    expect(result.lessons[0]).toMatchObject({ courseName: 'Algebra', text: 'Gruppi' })
    expect(result.lessons[0].number).toBeUndefined()
    expect(result.exams).toEqual([{ course: 'alg', courseName: 'Algebra', name: 'Prova', date: '2026-11-19' }])
  })
})
