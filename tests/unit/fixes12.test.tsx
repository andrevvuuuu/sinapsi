// @vitest-environment jsdom
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSessionRunner } from '../../src/main/session/runner'
import { suggest, type SuggestInput } from '../../src/main/suggest/suggest'
import { buildModel } from '../../src/renderer/src/graph/model'
import { Composer } from '../../src/renderer/src/home/Composer'
import Home from '../../src/renderer/src/home/Home'
import { PracticeSetup } from '../../src/renderer/src/practice/PracticeSetup'
import type { Memory } from '../../src/shared/memory-types'
import { settingsSchema } from '../../src/shared/settings-schema'
import type { VaultNote } from '../../src/shared/vault-types'

afterEach(cleanup)
beforeEach(() => {
  const data = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k), clear: () => data.clear() })
})

const note = (title: string, links: string[] = [], over: Partial<VaultNote> = {}): VaultNote => ({
  path: `/v/${title}.md`,
  title,
  folder: '',
  tags: [],
  aliases: [],
  links: links.map((t) => ({ target: t, path: `/v/${t}.md`, resolved: true })),
  headings: [],
  blockIds: [],
  subject: null,
  mtime: 1,
  size: 1,
  available: true,
  ...over
})
const input = (notes: VaultNote[], over: Partial<SuggestInput> = {}): SuggestInput => ({ index: { root: '/v', scannedAt: 1, subjects: [], notes }, notes: [], sessions: [], practiced: new Set(), memory: {}, graph: { concepts: [], chains: [], extracted: {} }, now: 1e9, ...over })
const ready = (...t: string[]) => t.map((x) => ({ sourcePath: `/v/${x}.md`, status: 'ready' as const }))
const concept = (id: string, birth: string) => ({ id, name: id, statement: 's', aliases: [], birth: `/v/${birth}.md`, notes: [`/v/${birth}.md`], sections: {}, depth: 0 })
const mem = (id: string, R: number): Memory => ({ conceptId: id, state: 'incerto', R, due: null, reps: 1, lapses: 0, lastAt: 1, misconception: false })

describe('the exam chip', () => {
  const titles = ['Insiemi', 'Funzione', 'Limite']
  const notes = [note('Analisi 1 MOC', titles, { type: 'MOC' }), ...titles.map((t) => note(t, [], { subject: 'analisi_1' }))]
  // 3 notes × 6 concepts = 18 concepts.
  const graph = { concepts: titles.flatMap((t, i) => Array.from({ length: 6 }, (_, j) => concept(`c${i}${j}`, t))), chains: [], extracted: {} }
  it('is named after the course of the MOC, not the tag, and counts notes without a subject', () => {
    const plain = [note('Analisi 1 MOC', titles, { type: 'MOC' }), ...titles.map((t) => note(t))]
    const chip = suggest(input(plain, { graph, notes: ready(...titles), practiced: new Set(graph.concepts.map((c) => c.id)) })).practice.find((c) => c.action.kind === 'practice' && c.action.exam)
    expect(chip?.label).toBe('Simulazione d’esame · Analisi 1')
  })
  it('picks at most 12 concepts, the never practised and the weakest first', () => {
    const memory = { c00: mem('c00', 0.2), c10: mem('c10', 0.95) }
    const practiced = new Set(graph.concepts.map((c) => c.id).filter((id) => id !== 'c25'))
    const chip = suggest(input(notes, { graph, memory, notes: ready(...titles), practiced })).practice.find((c) => c.action.kind === 'practice' && c.action.exam)!
    const ids = (chip.action as { conceptIds: string[] }).conceptIds
    expect(ids).toHaveLength(12)
    expect(ids.slice(0, 2)).toEqual(['c25', 'c00'])
    expect(ids).not.toContain('c10')
    expect(chip.reason).toBe('3 note studiate')
  })
})

describe('MOCs', () => {
  it('a note tagged #moc is a MOC, for the suggestions and for the graph', () => {
    const notes = [note('Corso di Fisica', ['Cinematica', 'Dinamica'], { tags: ['moc'] }), note('Cinematica'), note('Dinamica')]
    expect(suggest(input(notes)).learn[0]).toMatchObject({ label: 'Cinematica', reason: 'primo passo di Corso di Fisica' })
    const model = buildModel({ concepts: [], chains: [], extracted: {} }, { root: '/v', scannedAt: 1, subjects: [], notes } as never)
    expect(JSON.stringify(model)).toContain('"moc":true')
  })
})

describe('the reason of a prerequisite', () => {
  it('is short, so the title it names stays readable', () => {
    const notes = [note('Analisi 1 MOC', ['A', 'B'], { type: 'MOC' }), note('A'), note('B', ['Extra']), note('Extra')]
    expect(suggest(input(notes, { notes: ready('A') })).learn[0].reason).toBe('serve per «B»')
  })
})

describe('Pratica opened from a chip', () => {
  it('says the material comes from the suggestion', async () => {
    window.sinapsi = { practice: { catalog: vi.fn(async () => ({ subjects: [], sources: [], suggested: [] })), create: vi.fn(), examStart: vi.fn() } } as never
    render(<PracticeSetup initial={{ conceptIds: [], exam: true }} onBack={vi.fn()} onStarted={vi.fn()} />)
    expect(await screen.findByText(/Ho preparato il materiale del consiglio/)).toBeTruthy()
    expect(screen.queryByText(/due concetti più urgenti/)).toBeNull()
  })
})

describe('chips with the same name', () => {
  it('render without duplicate keys', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const same = { label: 'Induzione', reason: 'a', action: { kind: 'practice' as const, conceptIds: ['x'] } }
    render(<Composer onSubmit={vi.fn()} suggestions={{ learn: [same, { ...same, reason: 'b' }], review: [], practice: [] }} onPick={vi.fn()} />)
    expect(err.mock.calls.some((c) => String(c[0]).includes('same key'))).toBe(false)
    err.mockRestore()
  })
})

describe('starting a session twice in a row', () => {
  it('a double click gives one session', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-f12-'))
    let n = 0
    const runner = createSessionRunner({
      dir,
      bridge: { converse: vi.fn() } as never,
      vault: async () => ({ root: '/v', scannedAt: 1, subjects: [], notes: [] }),
      readNote: async () => '',
      onUpdate: () => undefined,
      uuid: () => `11111111-1111-4111-8111-11111111111${n++}`
    })
    const [a, b] = await Promise.all([runner.create('Induzione'), runner.create('Induzione')])
    expect(a).toBe(b)
    expect(await runner.list()).toHaveLength(1)
    expect(await runner.create('Limiti')).not.toBe(a)
  })
})

describe('suggestions arriving out of order', () => {
  it('the newest answer wins', async () => {
    const settings = settingsSchema('/x').parse({})
    const resolvers: ((v: unknown) => void)[] = []
    const chip = (label: string) => ({ learn: [{ label, reason: 'r', action: { kind: 'learn', topic: label } }], review: [], practice: [] })
    window.sinapsi = {
      settings: { get: vi.fn(async () => settings), set: vi.fn(), chooseVault: vi.fn() },
      vault: { index: vi.fn(async () => ({ root: '/v', scannedAt: 0, subjects: [], notes: [] })), onChange: () => () => undefined },
      ai: { status: vi.fn(async () => ({ agy: 'idle', claude: 'idle' })), onStatus: () => () => undefined },
      app: { openExternal: vi.fn() },
      suggest: { get: vi.fn(() => new Promise((r) => resolvers.push(r))) }
    } as never
    render(<Home />)
    await act(async () => void window.dispatchEvent(new Event('focus')))
    const last = resolvers.length - 1
    await act(async () => resolvers[last](chip('Nuovo')))
    await act(async () => resolvers[0](chip('Vecchio')))
    expect(screen.getByText('Nuovo')).toBeTruthy()
    expect(screen.queryByText('Vecchio')).toBeNull()
  })
})
