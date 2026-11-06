// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { StrictMode } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSessionRunner } from '../../src/main/session/runner'
import { suggest } from '../../src/main/suggest/suggest'
import { GraphView } from '../../src/renderer/src/graph/GraphView'
import Home from '../../src/renderer/src/home/Home'
import { PracticeSetup } from '../../src/renderer/src/practice/PracticeSetup'
import { settingsSchema } from '../../src/shared/settings-schema'
import type { VaultNote } from '../../src/shared/vault-types'

afterEach(cleanup)
beforeAll(() => {
  const noop = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'canvas' ? {} : () => undefined), set: () => true })
  HTMLCanvasElement.prototype.getContext = vi.fn(() => noop) as never
})
beforeEach(() => {
  const data = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k), clear: () => data.clear() })
})
const note = (title: string, links: string[] = [], over: Partial<VaultNote> = {}): VaultNote => ({ path: `/v/${title}.md`, title, folder: '', tags: [], aliases: [], links: links.map((t) => ({ target: t, path: `/v/${t}.md`, resolved: true })), headings: [], blockIds: [], subject: null, mtime: 1, size: 1, available: true, ...over })

describe('a session start that failed', () => {
  it('can be retried at once, the failure is not remembered', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sinapsi-f12b-'))
    const blocker = join(root, 'sessions')
    await writeFile(blocker, 'not a folder')
    const runner = createSessionRunner({ dir: join(blocker, 'x'), bridge: { converse: vi.fn() } as never, vault: async () => null as never, readNote: async () => '', onUpdate: () => undefined })
    await expect(runner.create('Rolle')).rejects.toThrow()
    await rm(blocker)
    await expect(runner.create('Rolle')).resolves.toBeTruthy()
  })
})

describe('the exam course', () => {
  it('a hub MOC that lists other MOCs does not claim their notes', () => {
    const titles = ['A', 'B', 'C']
    const notes = [note('Università MOC', ['Analisi 1 MOC', ...titles], { type: 'MOC' }), note('Analisi 1 MOC', titles, { type: 'MOC' }), ...titles.map((t) => note(t))]
    const graph = { concepts: titles.map((t) => ({ id: t, name: t, statement: 's', aliases: [], birth: `/v/${t}.md`, notes: [`/v/${t}.md`], sections: {}, depth: 0 })), chains: [], extracted: {} }
    const chip = suggest({ index: { root: '/v', scannedAt: 1, subjects: [], notes }, notes: titles.map((t) => ({ sourcePath: `/v/${t}.md`, status: 'ready' as const })), sessions: [], practiced: new Set(titles), memory: {}, graph, now: 1 }).practice.find((c) => c.action.kind === 'practice' && c.action.exam)
    expect(chip?.label).toBe('Simulazione d’esame · Analisi 1')
  })
})

describe('Pratica opened with typed text', () => {
  it('says the picks come from what he wrote', async () => {
    const catalog = { subjects: [{ name: 'A', notes: [{ path: '/v/A.md', title: 'A', concepts: [{ id: 'n_r', name: 'Teorema di Rolle', R: null, due: false, practiced: false }] }] }], sources: [], suggested: [] }
    window.sinapsi = { practice: { catalog: vi.fn(async () => catalog), create: vi.fn(), examStart: vi.fn() } } as never
    render(<PracticeSetup initialText="Rolle" onBack={vi.fn()} onStarted={vi.fn()} />)
    expect(await screen.findByText(/a partire da quello che hai scritto/)).toBeTruthy()
    expect(screen.queryByText(/due concetti più urgenti/)).toBeNull()
  })
})

describe('the zoom controls', () => {
  it('are hidden until there is a graph to zoom', () => {
    window.sinapsi = { graph: { get: vi.fn(() => new Promise(() => undefined)), status: vi.fn(async () => ({ queued: [] })), extract: vi.fn(), onChange: () => () => undefined, positions: vi.fn(async () => ({})), savePositions: vi.fn() } } as never
    render(<GraphView index={{ root: '/v', scannedAt: 1, subjects: [], notes: [note('A')] }} onStudy={vi.fn()} onOpenNote={vi.fn()} />)
    expect(screen.queryByRole('group', { name: 'Zoom' })).toBeNull()
  })
})

describe('suggestions with StrictMode', () => {
  it('the request of a discarded first mount never wins', async () => {
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
    render(
      <StrictMode>
        <Home />
      </StrictMode>
    )
    await act(async () => resolvers[resolvers.length - 1](chip('Nuovo')))
    await act(async () => resolvers[0](chip('Vecchio')))
    expect(screen.queryByText('Vecchio')).toBeNull()
  })
})

describe('the back button', () => {
  it('keeps the 44 px touch size and no pill inside the note island', () => {
    const css = readFileSync('src/renderer/src/styles/tokens.css', 'utf8')
    expect(css).toMatch(/button\.back-btn\.back-btn\.back-btn\{[^}]*min-height:var\(--ctl\)/)
    expect(css).toMatch(/--ctl:44px/)
    expect(css).toMatch(/\.island button\.back-btn\.back-btn\.back-btn\{[^}]*background:transparent/)
  })
})
