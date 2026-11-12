// @vitest-environment jsdom
import { mkdir, mkdtemp, readdir, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBridge } from '../../src/main/ai/bridge'
import { memoryStore } from '../../src/main/memory/store'
import { createExamService } from '../../src/main/practice/exam'
import { cleanupPhotos, transcribePhoto } from '../../src/main/practice/photo'
import { createPracticeRunner } from '../../src/main/practice/runner'
import { PracticeSetup } from '../../src/renderer/src/practice/PracticeSetup'
import { PracticeView } from '../../src/renderer/src/practice/PracticeView'
import { DEFAULT_ENGINES } from '../../src/shared/settings-schema'

afterEach(cleanup)
Element.prototype.scrollIntoView = vi.fn()
const tmp = (): Promise<string> => mkdtemp(join(tmpdir(), 'sinapsi-f9p-'))

describe('free topic', () => {
  it('keeps the lines of a pasted exam problem', async () => {
    const create = vi.fn(async () => 'x')
    window.sinapsi = { practice: { catalog: vi.fn(async () => ({ subjects: [], sources: [], suggested: [] })), create, examStart: vi.fn() } } as never
    render(<PracticeSetup onBack={vi.fn()} onStarted={vi.fn()} />)
    const free = await screen.findByLabelText('Argomento libero')
    expect(free.tagName).toBe('TEXTAREA')
    fireEvent.change(free, { target: { value: 'Esercizio 2.\n(a) Calcola il limite.\n(b) Studia la serie.' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Inizia allenamento' })))
    expect(create).toHaveBeenCalledWith({ conceptIds: [], sourceIds: [], free: 'Esercizio 2.\n(a) Calcola il limite.\n(b) Studia la serie.' })
  })
})

describe('photo dialog', () => {
  it('closes with Esc and accepts the same file twice', async () => {
    const photo = vi.fn(async () => 'testo')
    const state = { id: 'p', mode: 'train', material: { conceptIds: [], sourceIds: [], free: 'x' }, topic: 'x', phase: 'warmup', items: [], problems: [{ id: 'p1', statement: 's', mode: 'recall', targets: [], status: 'active', phase: 'warmup', hints: 0, maxRung: null, attempts: 0 }], active: 'p1', paused: false, awaiting: 'learner', hasTutorTurn: true, createdAt: 1, updatedAt: 1 }
    window.sinapsi = { practice: { get: vi.fn(async () => state), onUpdate: () => () => undefined, photo, camera: vi.fn(async () => false), submit: vi.fn() } } as never
    render(<PracticeView id="p" onBack={vi.fn()} onStarted={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Foto del foglio' }))
    const input = screen.getByLabelText('Scegli un’immagine…') as HTMLInputElement
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'f.jpg', { type: 'image/jpeg' })
    await act(async () => fireEvent.change(input, { target: { files: [file] } }))
    await screen.findByLabelText('Letto dal foglio — controlla e correggi')
    expect(input.value).toBe('')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Foto del foglio' })).toBeNull()
  })
})

describe('photos', () => {
  it('older than 30 days are deleted', async () => {
    const dir = await tmp()
    await mkdir(join(dir, 's1'))
    await writeFile(join(dir, 's1', 'foglio-1.jpg'), 'x')
    await writeFile(join(dir, 's1', 'foglio-2.jpg'), 'x')
    await writeFile(join(dir, 's1.jsonl'), '')
    const old = new Date(Date.now() - 40 * 86_400_000)
    await utimes(join(dir, 's1', 'foglio-1.jpg'), old, old)
    await cleanupPhotos(dir, Date.now())
    expect(await readdir(join(dir, 's1'))).toEqual(['foglio-2.jpg'])
  })
  it('are always read by Claude, with the read-only lockdown, whatever engine "grade" uses', async () => {
    const spawn = vi.fn(async () => ({ stdout: JSON.stringify({ is_error: false, result: '{"readable":true,"text":"ok"}' }), stderr: '', code: 0, timedOut: false }))
    const dir = await tmp()
    const bridge = createBridge({ spawn, cacheDir: join(dir, 'c'), usageFile: join(dir, 'u'), engines: async () => ({ ...DEFAULT_ENGINES, grade: { engine: 'agy', model: 'gemini-3.8-flash-high' } }) })
    expect(await transcribePhoto({ bridge, dir, bytes: new Uint8Array([0xff, 0xd8, 0xff, 1]) })).toBe('ok')
    const [cmd, args] = spawn.mock.calls[0] as unknown as [string, string[]]
    expect(cmd).toBe('claude')
    expect(args).toEqual(expect.arrayContaining(['--tools', 'Read', '--allowedTools', 'Read']))
  })
})

describe('exam', () => {
  async function setup(replies: unknown[]) {
    const dir = await tmp()
    const mem = memoryStore(join(dir, 'm'))
    const ask = vi.fn(async (req: { schema: { parse(x: unknown): unknown } }) => ({ data: req.schema.parse(replies.shift()), fromCache: false, engine: 'claude' as const }))
    const deps = { bridge: { ask, converse: vi.fn() } as never, dir: join(dir, 'p'), material: async () => '', topic: async () => 't', memory: mem, onUpdate: vi.fn() }
    const runner = createPracticeRunner(deps)
    return { exam: createExamService({ ...deps, runner }), mem, runner, dir: join(dir, 'p') }
  }
  const sheet = { title: 'T', problems: [{ id: 'e1', statement: 'a', points: 30, targets: ['n_1'], modelSolution: 's' }] }
  it('drafts store only what changed', async () => {
    const { exam, runner } = await setup([sheet])
    const id = await exam.start({ conceptIds: ['n_1'], sourceIds: [], free: '' }, 30)
    await exam.retry(id)
    await exam.save(id, { e1: 'bozza' })
    await exam.save(id, { e1: 'bozza' })
    await exam.save(id, { e1: 'bozza 2' })
    const drafts = (await runner.events(id)).filter((e) => e.t === 'answers')
    expect(drafts).toHaveLength(2)
    expect((await exam.get(id)).exam!.answers).toEqual({ e1: 'bozza 2' })
  })
  it('grading writes memory once, even when it runs again after a crash', async () => {
    const { exam, mem } = await setup([sheet, { items: [{ id: 'e1', points: 30, comment: '' }], note: '' }, { items: [{ id: 'e1', points: 30, comment: '' }], note: '' }])
    const id = await exam.start({ conceptIds: ['n_1'], sourceIds: [], free: '' }, 30)
    await exam.retry(id)
    // A first grading wrote the memory, then the app died before "graded" was recorded.
    await mem.append({ conceptId: 'n_1', at: 1, grade: 3, correct: true, via: 'practice', ref: `exam:${id}:e1` })
    await exam.deliver(id, { e1: 'r' })
    expect((await mem.read()).filter((r) => r.ref === `exam:${id}:e1`)).toHaveLength(1)
  })
})
