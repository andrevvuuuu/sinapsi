import { existsSync } from 'node:fs'
import { mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeReviewHandlers } from '../../src/main/ipc-handlers'
import { buildExplainPrompt, explainReplySchema, MAX_QUESTIONS, type ExplainTurn } from '../../src/main/memory/explain'
import { createReviewService, type ReviewService } from '../../src/main/memory/review'
import { memoryStore, type MemoryStore } from '../../src/main/memory/store'
import { buildVariantsPrompt, parseVariants, variantsStore, type VariantsStore } from '../../src/main/memory/variants'
import { transcribeVoice } from '../../src/main/memory/voice'
import { fakeMedia } from '../../src/main/notebook/fake-media'
import { GRADING_RIGOR } from '../../src/main/ai/rigor'
import { VERIFY_MARK } from '../../src/main/session/prompt'
import { loadSettings } from '../../src/main/store/settings'
import type { Exercise } from '../../src/shared/exercise-schema'
import type { Concept, GraphData } from '../../src/shared/graph-types'
import type { ExerciseType } from '../../src/shared/memory-types'
import type { VaultIndex, VaultNote } from '../../src/shared/vault-types'

const T0 = new Date('2026-11-02T10:00:00Z').getTime()
const explain: Extract<Exercise, { type: 'explain' }> = { type: 'explain', prompt: 'A libro chiuso: ricostruisci la dimostrazione di Rolle.', answer: 'Weierstrass, poi Fermat nel punto interno.' }
const vnote = (title: string): VaultNote => ({ path: `/v/${title}.md`, title, folder: '', tags: [], aliases: [], links: [], headings: [], blockIds: [], subject: 'matematica', mtime: 1, size: 1, available: true })
const index: VaultIndex = { root: '/v', scannedAt: 1, subjects: [], notes: [vnote('A'), vnote('B')] }
const C = (id: string, note: string): Concept => ({ id, name: `nome ${id}`, statement: `enunciato ${id}`, aliases: [], birth: `/v/${note}.md`, notes: [`/v/${note}.md`], sections: {}, depth: 0 })
const graph: GraphData = { concepts: [C('a1', 'A'), C('a2', 'A'), C('a3', 'A'), C('b1', 'B')], chains: [], extracted: {} }
const turn = (by: ExplainTurn['by'], text: string): ExplainTurn => ({ by, text })

describe('the picky student prompt', () => {
  const base = { concept: { name: 'Rolle', statement: 'f continua…' }, exercise: explain, noteTitle: 'Rolle', confidence: 70 }
  it('compares with the note, flagged errors included, and with the reviewer rigour', () => {
    const p = buildExplainPrompt({ ...base, noteText: `testo della nota\n${VERIFY_MARK}`, turns: [turn('andrea', 'Per Weierstrass ha massimo e minimo.')] })
    expect(p).toContain('testo della nota')
    expect(p).toContain('Verifica di correttezza')
    expect(p).toContain(GRADING_RIGOR)
    expect(p).toContain('PRIMO passaggio mancante')
    expect(p).toContain('Andrea: Per Weierstrass ha massimo e minimo.')
    expect(p).toContain('"action": "ask"')
  })
  it('stops asking after the last allowed question', () => {
    const turns = [turn('andrea', 'spiegazione'), turn('claude', 'Perché interno?'), turn('andrea', 'Perché…'), turn('claude', 'E se è costante?'), turn('andrea', 'Allora…')]
    const p = buildExplainPrompt({ ...base, noteText: 'n', turns })
    expect(p).toContain(`Hai già fatto ${MAX_QUESTIONS} domande`)
    expect(p).toContain('Tu (domanda): E se è costante?')
    expect(p).not.toContain('"action": "ask"')
    expect(() => explainReplySchema(false).parse({ action: 'ask', question: 'Ancora?' })).toThrow()
    expect(explainReplySchema(true).parse({ action: 'ask', question: 'Perché?' })).toEqual({ action: 'ask', question: 'Perché?' })
  })
})

describe('variants for Spiegalo tu', () => {
  it('asks for it only for proofs and key definitions, once per concept', () => {
    const concepts = [C('a1', 'A')]
    expect(buildVariantsPrompt({ noteTitle: 'A', noteText: '', concepts, types: ['open', 'explain'] })).toContain('dimostrazione da ricostruire')
    expect(buildVariantsPrompt({ noteTitle: 'A', noteText: '', concepts, types: ['open', 'mc'] })).not.toContain('"explain"')
    const only = buildVariantsPrompt({ noteTitle: 'A', noteText: '', concepts, types: ['explain'] })
    expect(only).toContain('"exercises": []')
    expect(only).not.toContain('4 o 5 esercizi')
    const r = parseVariants({ concepts: [{ id: 'a1', exercises: [explain, { ...explain, prompt: 'Spiega di nuovo' }, { type: 'open', prompt: 'p', answer: 'a' }] }] }, new Set(['a1']), () => T0)
    expect(r.variants.map((v) => v.exercise.type)).toEqual(['explain', 'open'])
    expect(r.dropped).toBe(1)
  })
})

let dir: string
let mem: MemoryStore
let vars: VariantsStore
let types: ExerciseType[]
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sinapsi-explain-'))
  mem = memoryStore(dir)
  vars = variantsStore(dir)
  types = ['mc', 'explain']
})

/** Gemini writes one mc for every concept and, when asked, a Spiegalo tu; the grader replies with `grade`. */
function setup(grade: (prompt: string) => unknown = () => ({ action: 'grade', verdict: 'ok', feedback: 'Il punto fragile è Fermat.' })): { svc: ReviewService; ask: ReturnType<typeof vi.fn> } {
  const ask = vi.fn(async (req: { task: string; prompt: string; schema: { parse(x: unknown): unknown } }) => {
    if (req.task === 'grade') return { data: req.schema.parse(grade(req.prompt)), fromCache: false, engine: 'claude' as const }
    const ids = [...req.prompt.matchAll(/^(\w+) \| nome/gm)].map((m) => m[1])
    const only = req.prompt.includes('"exercises": []')
    const raw = { concepts: ids.map((id) => ({ id, exercises: [...(only ? [] : [{ type: 'mc', prompt: `mc ${id}`, options: ['sì', 'no'], correct: 0, answer: 'sì' }]), ...(req.prompt.includes('"explain"') ? [{ ...explain, prompt: `spiega ${id}` }] : [])] })) }
    return { data: req.schema.parse(raw), fromCache: false, engine: 'agy' as const }
  })
  const svc = createReviewService({
    bridge: { ask } as never,
    memory: mem,
    variants: vars,
    graph: async () => graph,
    vault: async () => index,
    readNote: async (p) => `nota di ${p}`,
    settings: async () => ({ reviewSessionSize: 12, exerciseTypes: types }),
    now: () => T0,
    workDir: join(dir, 'w')
  })
  return { svc, ask }
}

describe('plan with Spiegalo tu', () => {
  it('takes its turn in the rotation but never becomes the majority of a session', async () => {
    const { svc } = setup()
    const ids = graph.concepts.map((c) => c.id)
    const first = (await svc.plan({ conceptIds: ids })).items
    expect(first.map((i) => i.exercise.type)).toEqual(['mc', 'mc', 'mc', 'mc'])
    for (const i of first) await mem.append({ conceptId: i.conceptId, at: T0 - 1000, grade: 3, variantId: i.variantId!, type: 'mc' })
    const items = (await svc.plan({ conceptIds: ids })).items
    expect(items.filter((i) => i.exercise.type === 'explain')).toHaveLength(1)
    expect(items.filter((i) => i.exercise.type === 'mc')).toHaveLength(3)
  })
  it('checks concepts from before it existed once, then never asks again', async () => {
    await vars.append({ id: 'v_old', conceptId: 'a1', at: T0 - 1, exercise: { type: 'mc', prompt: 'vecchia', options: ['sì', 'no'], correct: 0, answer: 'sì' } })
    const { svc, ask } = setup()
    await svc.plan({ conceptIds: ['a1'] })
    const calls = ask.mock.calls.filter((c) => c[0].task === 'variants')
    expect(calls).toHaveLength(1)
    expect(calls[0][0].prompt).toContain('decidi solo')
    expect((await vars.read()).filter((v) => v.conceptId === 'a1').map((v) => v.exercise.type)).toEqual(['mc', 'explain'])
    expect(await vars.explainChecked()).toEqual(new Set(['a1']))
    const again = setup()
    await again.svc.plan({ conceptIds: ['a1'] })
    expect(again.ask).not.toHaveBeenCalled()
  })
  it('does not ask about it when Andrea turned it off', async () => {
    types = ['mc']
    const { svc, ask } = setup()
    await svc.plan()
    for (const c of ask.mock.calls) expect(c[0].prompt).not.toContain('"explain"')
  })
})

describe('explain', () => {
  it('asks the first missing step, reading the concept note', async () => {
    const { svc, ask } = setup(() => ({ action: 'ask', question: 'Perché il massimo è interno?' }))
    const r = await svc.explain({ conceptId: 'a1', exercise: explain, turns: [turn('andrea', 'Weierstrass e basta.')], confidence: 60 })
    expect(r).toEqual({ kind: 'question', question: 'Perché il massimo è interno?' })
    const call = ask.mock.calls.at(-1)![0]
    expect(call.task).toBe('grade')
    expect(call.prompt).toContain('nota di /v/A.md')
    expect(call.prompt).toContain('NOTA DI ANDREA «A»')
  })
  it('gives a verdict that proposes a grade like the other types', async () => {
    const { svc } = setup(() => ({ action: 'grade', verdict: 'partial', feedback: 'Manca Fermat.' }))
    expect(await svc.explain({ conceptId: 'a1', exercise: explain, turns: [turn('andrea', 'x')], confidence: 90 })).toEqual({ kind: 'verdict', verdict: 'partial', feedback: 'Manca Fermat.', proposed: 2 })
  })
  it('refuses a third question: the reply must be a verdict', async () => {
    const { svc } = setup(() => ({ action: 'ask', question: 'Ancora?' }))
    const turns = [turn('andrea', 'a'), turn('claude', 'q1'), turn('andrea', 'b'), turn('claude', 'q2'), turn('andrea', 'c')]
    const r = await svc.explain({ conceptId: 'a1', exercise: explain, turns, confidence: 50 })
    expect(r.kind).toBe('verdict')
    expect(r).toMatchObject({ verdict: 'partial', proposed: 2 })
  })
})

describe('voice', () => {
  const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3])
  it('transcribes a recording in Italian with mlx_whisper and deletes it', async () => {
    const run = vi.fn(fakeMedia())
    const text = await transcribeVoice({ run, dir, bytes: webm })
    expect(text).toBe('Benvenuti alla lezione sulle derivate. Il teorema di Lagrange segue da Rolle.')
    const args = run.mock.calls[0][1] as string[]
    expect(run.mock.calls[0][0]).toBe('mlx_whisper')
    expect(args[args.indexOf('--language') + 1]).toBe('it')
    expect(args.at(-1)).toMatch(/registrazione\.webm$/)
    expect(await readdir(dir)).toEqual([])
  })
  it('rejects anything that is not a recording', async () => {
    await expect(transcribeVoice({ run: fakeMedia(), dir, bytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]) })).rejects.toThrow('Registrazione non valida')
    expect(existsSync(join(dir, 'voce'))).toBe(false)
  })
})

describe('handlers', () => {
  const svc = { explain: vi.fn(async () => ({ kind: 'question' as const, question: 'q' })) } as unknown as ReviewService
  const voice = vi.fn(async () => 'detto')
  const h = makeReviewHandlers(svc, { voice, microphone: async () => true })
  it('validates the dialogue and the recording', async () => {
    await expect(h.explain({ conceptId: 'a1', exercise: explain, turns: [], confidence: 50 })).rejects.toThrow()
    await expect(h.explain({ conceptId: 'a1', exercise: explain, turns: [{ by: 'tutor', text: 'x' }], confidence: 50 })).rejects.toThrow()
    await expect(h.explain({ conceptId: 'a1', exercise: explain, turns: [turn('andrea', 'x')], confidence: 50 })).resolves.toEqual({ kind: 'question', question: 'q' })
    await expect(h.voice('non audio')).rejects.toThrow()
    await expect(h.voice(new Uint8Array([1]))).resolves.toBe('detto')
  })
})

describe('settings', () => {
  beforeEach(() => {
    process.env.SINAPSI_DATA = dir
  })
  it('adds Spiegalo tu to a type list saved before it existed, and respects a later choice', async () => {
    await writeFile(join(dir, 'settings.json'), JSON.stringify({ settingsVersion: 2, exerciseTypes: ['open', 'mc'] }))
    expect((await loadSettings()).exerciseTypes).toEqual(['open', 'mc', 'explain'])
    await writeFile(join(dir, 'settings.json'), JSON.stringify({ settingsVersion: 3, exerciseTypes: ['open', 'mc'] }))
    expect((await loadSettings()).exerciseTypes).toEqual(['open', 'mc'])
  })
})
