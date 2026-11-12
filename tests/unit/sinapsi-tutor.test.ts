import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSinapsiTutorService, parseLessonItems } from '../../src/main/tutor/sinapsi-tutor'
import { memoryOf } from '../../src/main/memory/fsrs'
import type { GraphData } from '../../src/shared/graph-types'
import type { ReviewLine } from '../../src/shared/memory-types'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true })))
})

const NOW = Date.parse('2026-11-12T10:00:00')
const DAY = 86_400_000
const concept = (id: string, notes: string[]): GraphData['concepts'][number] => ({
  id, name: id, statement: id, aliases: [], birth: notes[0], notes, sections: {}, depth: 0
})

async function vault(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'sinapsi-tutor-native-'))
  roots.push(root)
  const dir = join(root, '.antigravity', 'tutor')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'courses.json'), JSON.stringify([{ id: 'alg', nome: 'Algebra', orario: [] }]))
  await writeFile(
    join(dir, 'lessons.jsonl'),
    JSON.stringify({ key: 'k', lesson: { course: 'alg', date: '2026-11-10', text: 'Gruppi e anelli', number: 3 } }) + '\n'
  )
  // The Obsidian tutor says everything is covered: Sinapsi must ignore that verdict.
  await writeFile(
    join(dir, 'state.json'),
    JSON.stringify({
      courses: [{ id: 'alg', nome: 'Algebra', lessons: [{ date: '2026-11-10', items: [
        { concept: 'Gruppo', kind: 'definizione', note: 'Gruppi', status: 'coperto' },
        { concept: 'Anello', kind: 'definizione', note: 'Anelli', status: 'coperto' },
        { concept: 'Ideale', kind: 'concetto', note: 'Ideali', status: 'coperto' },
        { concept: 'Campo', kind: 'concetto', status: 'coperto' }
      ] }] }]
    })
  )
  return root
}

describe('SinapsiTutorService', () => {
  it('measures coverage and mastery from Sinapsi reviews only, never from the Obsidian verdict', async () => {
    const root = await vault()
    const before = await readFile(join(root, '.antigravity', 'tutor', 'state.json'), 'utf8')
    const graph: GraphData = {
      concepts: [concept('g1', ['Algebra/Gruppi.md']), concept('g2', ['Algebra/Gruppi.md']), concept('a1', ['Algebra/Anelli.md'])],
      chains: [],
      extracted: {}
    }
    const reviews: ReviewLine[] = [
      { conceptId: 'g1', at: NOW - 2 * DAY, grade: 3 },
      { conceptId: 'g2', at: NOW - 2 * DAY, grade: 3 }
    ]
    const service = createSinapsiTutorService({
      vaultPath: async () => root,
      graph: async () => graph,
      reviews: async () => reviews,
      memoryOf,
      vault: async () => ({ root, scannedAt: 0, subjects: [], notes: [{ path: 'Algebra/Ideali.md', title: 'Ideali', aliases: [] }] }) as never,
      now: () => NOW
    })
    const report = await service.report()
    expect(report.connected).toBe(true)
    const lesson = report.lessons[0]
    expect(lesson).toMatchObject({ course: 'alg', courseName: 'Algebra', number: 3 })
    const [gruppo, anello, ideale, campo] = lesson.items
    expect(gruppo).toMatchObject({ note: 'Gruppi', conceptIds: ['g1', 'g2'], studied: 2, state: 'interiorizzato' })
    expect(gruppo.mastery).toBeGreaterThan(0.85)
    expect(anello).toMatchObject({ conceptIds: ['a1'], studied: 0, mastery: 0, state: 'mai studiato' })
    expect(ideale).toMatchObject({ conceptIds: [], mastery: null, state: 'da estrarre', notePath: 'Algebra/Ideali.md' })
    expect(campo).toMatchObject({ note: null, state: 'scollegato' })
    expect(lesson.stats).toMatchObject({ total: 4, linked: 2, covered: 1 })
    expect(lesson.stats.byState).toMatchObject({ interiorizzato: 1, 'mai studiato': 1, 'da estrarre': 1, scollegato: 1 })
    expect(report.courses).toEqual([expect.objectContaining({ id: 'alg', name: 'Algebra', lessons: 1 })])
    // Read-only: the Obsidian tutor's files are untouched.
    expect(await readFile(join(root, '.antigravity', 'tutor', 'state.json'), 'utf8')).toBe(before)
  })

  it('counts a half-studied note by all its concepts and reports a disconnected vault', async () => {
    const root = await vault()
    const graph: GraphData = { concepts: [concept('g1', ['Gruppi.md']), concept('g2', ['Gruppi.md'])], chains: [], extracted: {} }
    const report = await createSinapsiTutorService({
      vaultPath: async () => root,
      graph: async () => graph,
      reviews: async () => [{ conceptId: 'g1', at: NOW - DAY, grade: 3 }],
      memoryOf,
      now: () => NOW
    }).report()
    const gruppo = report.lessons[0].items[0]
    expect(gruppo.studied).toBe(1)
    expect(gruppo.mastery).toBeLessThan(0.6)
    expect(gruppo.state).toBe('fragile')

    const empty = await mkdtemp(join(tmpdir(), 'sinapsi-tutor-none-'))
    roots.push(empty)
    const none = await createSinapsiTutorService({
      vaultPath: async () => empty,
      graph: async () => graph,
      reviews: async () => [],
      memoryOf
    }).report()
    expect(none).toMatchObject({ connected: false, lessons: [], courses: [] })
  })

  it('tolerates a malformed state file', () => {
    expect(parseLessonItems('{nope').size).toBe(0)
    expect(parseLessonItems(JSON.stringify({ courses: [{ id: 'x', lessons: [{ date: 'd', items: [42, { concept: '' }] }] }] })).get('x|d')).toEqual([])
  })
})
