// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { GraphView } from '../../src/renderer/src/graph/GraphView'
import { buildModel, fragileBases, lensCounts } from '../../src/renderer/src/graph/model'
import type { Concept, GraphData } from '../../src/shared/graph-types'
import type { Memory } from '../../src/shared/memory-types'
import type { VaultIndex, VaultNote } from '../../src/shared/vault-types'

beforeAll(() => {
  const noop = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => undefined), set: () => true })
  HTMLCanvasElement.prototype.getContext = vi.fn(() => noop) as never
})
afterEach(cleanup)

const NOW = Date.now()
const vnote = (title: string): VaultNote => ({ path: `/v/${title}.md`, title, folder: '', tags: [], aliases: [], links: [], headings: [], blockIds: [], subject: 'matematica', mtime: 1, size: 1, available: true })
const index: VaultIndex = { root: '/v', scannedAt: 1, subjects: [], notes: [vnote('Rolle'), vnote('Lagrange')] }
const C = (id: string, note: string, name: string, depth: number): Concept => ({ id, name, statement: `${name}.`, aliases: [], birth: `/v/${note}.md`, notes: [`/v/${note}.md`], sections: {}, depth })
const graph: GraphData = {
  extracted: {},
  concepts: [C('n_f', 'Rolle', 'Fermat', 0), C('n_r', 'Rolle', 'Rolle', 1), C('n_l', 'Lagrange', 'Lagrange', 2), C('n_c', 'Lagrange', 'Costanza', 3), C('n_m', 'Lagrange', 'Monotonia', 3)],
  chains: [
    { id: 'arg_1', premises: ['n_f'], conclusion: 'n_r', notes: [] },
    { id: 'arg_2', premises: ['n_r'], conclusion: 'n_l', notes: [] },
    { id: 'arg_3', premises: ['n_l'], conclusion: 'n_c', notes: [] },
    { id: 'arg_4', premises: ['n_l'], conclusion: 'n_m', notes: [] }
  ]
}
const M = (conceptId: string, state: Memory['state'], R: number, due: number): Memory => ({ conceptId, state, R, due, reps: 1, lapses: 0, lastAt: 1, misconception: false })
const memory: Record<string, Memory> = { n_f: M('n_f', 'la sai', 0.95, NOW + 1e9), n_r: M('n_r', 'incerto', 0.7, NOW - 1000), n_l: M('n_l', 'debole', 0.4, NOW - 1000) }

describe('memory helpers', () => {
  const model = buildModel(graph, index)
  it('counts the lenses', () => {
    expect(lensCounts(model, memory, NOW)).toEqual({ due: 2, never: 2, fragile: 1 })
  })
  it('finds fragile bases: uncertain or weak concepts that at least three others rest on', () => {
    expect([...fragileBases(model, memory)]).toEqual(['n_r'])
  })
})

function mount() {
  window.sinapsi = {
    graph: { get: vi.fn(async () => graph), status: vi.fn(async () => ({ queued: [] })), extract: vi.fn(), onChange: () => () => undefined, positions: vi.fn(async () => ({})), savePositions: vi.fn(async () => undefined) },
    review: { memory: vi.fn(async () => memory) }
  } as never
  const onReview = vi.fn()
  render(<GraphView index={index} onStudy={vi.fn()} onOpenNote={vi.fn()} onReview={onReview} />)
  return { onReview }
}
async function pick(q: string, label: RegExp): Promise<HTMLElement> {
  fireEvent.change(await screen.findByRole('combobox', { name: 'Cerca nel grafo' }), { target: { value: q } })
  fireEvent.click(screen.getByRole('option', { name: label }))
  return screen.getByRole('dialog', { name: 'Dettagli' })
}

describe('GraphView with memory', () => {
  it('offers the lenses with their counts', async () => {
    mount()
    const lens = await screen.findByRole('button', { name: 'Da ripassare (2)' })
    expect(screen.getByRole('button', { name: 'Tutto' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(lens)
    expect(lens.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Mai visti (2)' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Basi fragili (1)' })).toBeTruthy()
  })
  it('shows the memory of a concept and reviews it', async () => {
    const { onReview } = mount()
    await screen.findByRole('button', { name: 'Da ripassare (2)' })
    const card = await pick('rolle', /Rolle.*concetto/)
    expect(within(card).getByText('incerto · 70%')).toBeTruthy()
    fireEvent.click(within(card).getByRole('button', { name: 'Ripassa' }))
    expect(onReview).toHaveBeenCalledWith(['n_r'])
  })
  it('reviews every concept of a note from its region card', async () => {
    const { onReview } = mount()
    await screen.findByRole('button', { name: 'Da ripassare (2)' })
    const card = await pick('lagrange', /Lagrange.*nota/)
    fireEvent.click(within(card).getByRole('button', { name: 'Ripassa questa nota' }))
    expect(onReview).toHaveBeenCalledWith(['n_l', 'n_c', 'n_m'])
  })
})
