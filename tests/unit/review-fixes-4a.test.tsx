// @vitest-environment jsdom
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { extractJson } from '../../src/main/ai/json'
import { makeGraphHandlers } from '../../src/main/ipc-handlers'
import { createExtractor, type Extractor } from '../../src/main/graph/jobs'
import { graphStore } from '../../src/main/graph/store'
import { GraphView } from '../../src/renderer/src/graph/GraphView'
import { createLayout } from '../../src/renderer/src/graph/layout'
import { buildModel, modelKey } from '../../src/renderer/src/graph/model'
import type { GraphData } from '../../src/shared/graph-types'
import type { VaultIndex, VaultNote } from '../../src/shared/vault-types'

beforeAll(() => {
  const noop = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => undefined), set: () => true })
  HTMLCanvasElement.prototype.getContext = vi.fn(() => noop) as never
})
afterEach(cleanup)

const LONG = '/Users/andreaantonelli/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian Vault/Matematica/Teorema di Lagrange del Valor Medio.md'
const vnote = (title: string, available = true, path = `/v/${title}.md`): VaultNote => ({ path, title, folder: '', tags: [], aliases: [], links: [], headings: [], blockIds: [], subject: 'matematica', mtime: 1, size: 1, available })
const index: VaultIndex = { root: '/v', scannedAt: 1, subjects: [], notes: [vnote('Lagrange', true, LONG), vnote('Nuvola', false)] }
const empty: GraphData = { concepts: [], chains: [], extracted: {} }

describe('positions persist on a real vault', () => {
  it('accepts long absolute note paths as keys', async () => {
    const write = vi.fn(async () => undefined)
    const h = makeGraphHandlers({} as Extractor, { read: async () => ({}), write })
    await h.savePositions({ [LONG]: [1, 2], [`g:Analisi 1 MOC:${'x'.repeat(80)}`]: [3, 4] })
    expect(write).toHaveBeenCalled()
  })
  it('saves the positions after the first layout, without waiting for a layout change', async () => {
    const savePositions = vi.fn(async () => undefined)
    window.sinapsi = { graph: { get: vi.fn(async () => empty), status: vi.fn(async () => ({ queued: [] })), extract: vi.fn(), onChange: () => () => undefined, positions: vi.fn(async () => ({})), savePositions } } as never
    render(<GraphView menuOpen index={index} onStudy={vi.fn()} onOpenNote={vi.fn()} />)
    await vi.waitFor(() => expect(savePositions).toHaveBeenCalled(), { timeout: 4000 })
    expect(Object.keys(savePositions.mock.calls[0][0])).toContain(LONG)
  })
})

describe('LaTeX in JSON replies', () => {
  it('repairs a reply that parsed but turned \\frac into a form feed', () => {
    expect(extractJson('{"s":"$f(c)=\\frac{f(b)-f(a)}{b-a}$ e \\theta"}')).toEqual({ s: '$f(c)=\\frac{f(b)-f(a)}{b-a}$ e \\theta' })
  })
  it('keeps \\bigcup, \\rvert and \\nmid in a reply that needs repair', () => {
    expect(extractJson('{"s":"$\\bigcup_i A_i \\rvert x \\nmid y \\sum$"}')).toEqual({ s: '$\\bigcup_i A_i \\rvert x \\nmid y \\sum$' })
  })
  it('keeps a real newline before the article "i" in a reply that needs repair', () => {
    expect(extractJson('{"s":"riga\\ni teoremi \\sum"}')).toEqual({ s: 'riga\ni teoremi \\sum' })
  })
  it('leaves a clean reply with real newlines and tabs alone', () => {
    expect(extractJson('{"s":"a\\nb\\tc"}')).toEqual({ s: 'a\nb\tc' })
  })
})

describe('the graph is not rebuilt for nothing', () => {
  it('gives the same model key to equal data in new objects', () => {
    const g: GraphData = { concepts: [{ id: 'n_a', name: 'a', statement: 'a', aliases: [], birth: '/v/A.md', notes: ['/v/A.md'], sections: {}, depth: 0 }], chains: [], extracted: {} }
    expect(modelKey(structuredClone(g), structuredClone(index))).toBe(modelKey(g, index))
    expect(modelKey({ ...g, concepts: [] }, index)).not.toBe(modelKey(g, index))
  })
  it('starts a re-seeded layout gently', () => {
    const m = buildModel(empty, index)
    const first = createLayout(m, { mode: 'radial' })
    const again = createLayout(m, { mode: 'radial', saved: first.positions() })
    expect(again.sim.alpha()).toBeLessThanOrEqual(0.3)
  })
  it('looks concepts and notes up by id', () => {
    const m = buildModel(empty, index)
    expect(m.noteByPath.get(LONG)?.title).toBe('Lagrange')
  })
})

describe('extraction buttons say why they failed', () => {
  it('shows the error of a refused extraction and hides the button for unavailable notes', async () => {
    const extract = vi.fn(async () => Promise.reject(new Error("Error invoking remote method 'graph:extract': Error: Nota non trovata nel vault")))
    window.sinapsi = { graph: { get: vi.fn(async () => empty), status: vi.fn(async () => ({ queued: [] })), extract, onChange: () => () => undefined, positions: vi.fn(async () => ({})), savePositions: vi.fn(async () => undefined) } } as never
    render(<GraphView menuOpen index={index} onStudy={vi.fn()} onOpenNote={vi.fn()} />)
    const box = await screen.findByRole('combobox', { name: 'Cerca nel grafo' })
    fireEvent.change(box, { target: { value: 'nuvola' } })
    fireEvent.click(screen.getByRole('option', { name: /Nuvola/ }))
    const card = screen.getByRole('dialog', { name: 'Dettagli' })
    expect(within(card).queryByRole('button', { name: 'Estrai i concetti' })).toBeNull()
    expect(within(card).getByText(/iCloud/)).toBeTruthy()
    fireEvent.change(box, { target: { value: 'lagrange' } })
    fireEvent.click(screen.getByRole('option', { name: /Lagrange/ }))
    await act(async () => fireEvent.click(within(screen.getByRole('dialog', { name: 'Dettagli' })).getByRole('button', { name: 'Estrai i concetti' })))
    expect(await screen.findByText(/Nota non trovata nel vault/)).toBeTruthy()
  })
})

describe('no-op background checks do not use up the daily limit', () => {
  it('counts only extractions that asked Gemini', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-rf4a-'))
    const store = graphStore(dir)
    const day = new Date(2026, 9, 27, 15).getTime()
    for (let i = 0; i < 3; i++) await store.append('extraction', { notePath: `/v/x${i}.md`, hash: 'h', at: day, reason: 'background', nodes: 0, chains: 0, dropped: 0, ok: true, skipped: true })
    const ask = vi.fn(async () => ({ data: { propositions: [{ id: 'p1', name: 'A', statement: 'A vale.' }], chains: [], dropped: 0 }, fromCache: false, engine: 'agy' as const }))
    const idx: VaultIndex = { root: '/v', scannedAt: 1, subjects: [], notes: [vnote('A')] }
    const x = createExtractor({ bridge: { ask } as never, store, vault: async () => idx, readNote: async () => 'testo', workDir: join(dir, 'w'), now: () => day, onChange: () => undefined })
    expect(await x.backgroundTick({ idleSeconds: 600, enabled: true, dailyLimit: 3 })).toBe('/v/A.md')
  })
})
