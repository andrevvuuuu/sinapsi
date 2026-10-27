// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { GraphView } from '../../src/renderer/src/graph/GraphView'
import type { Concept, ExtractorStatus, GraphData } from '../../src/shared/graph-types'
import type { VaultIndex, VaultNote } from '../../src/shared/vault-types'

beforeAll(() => {
  // jsdom has no canvas: a 2d context that accepts every call is enough for the DOM side.
  const noop = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'canvas' ? {} : () => undefined), set: () => true })
  HTMLCanvasElement.prototype.getContext = vi.fn(() => noop) as never
})
afterEach(cleanup)

const vnote = (title: string, links: string[] = []): VaultNote => ({ path: `/v/${title}.md`, title, folder: '', tags: [], aliases: [], links: links.map((t) => ({ target: t, resolved: true })), headings: [], blockIds: [], subject: 'matematica', mtime: 1, size: 1, available: true })
const index: VaultIndex = { root: '/v', scannedAt: 1, subjects: [{ id: 'matematica', color: '#de77a9' }], notes: [vnote('Teorema di Rolle', ['Teorema di Lagrange']), vnote('Teorema di Lagrange'), vnote('Limiti')] }
const C = (id: string, birth: string, name: string, statement: string, depth: number, notes = [`/v/${birth}.md`]): Concept => ({ id, name, statement, aliases: [], birth: `/v/${birth}.md`, notes, sections: {}, depth })
const graph: GraphData = {
  extracted: { '/v/Teorema di Rolle.md': { hash: 'h', at: 1 }, '/v/Teorema di Lagrange.md': { hash: 'h', at: 1 } },
  concepts: [
    C('n_w', 'Teorema di Rolle', 'Teorema di Weierstrass', 'Una funzione continua su $[a,b]$ ha massimo e minimo.', 0),
    C('n_f', 'Teorema di Rolle', 'Teorema di Fermat', 'Un estremo interno è stazionario.', 0),
    C('n_r', 'Teorema di Rolle', 'Teorema di Rolle', 'Esiste $c$ con $f\'(c)=0$.', 1, ['/v/Teorema di Rolle.md', '/v/Teorema di Lagrange.md']),
    C('n_l', 'Teorema di Lagrange', 'Teorema di Lagrange', 'Tangente parallela alla corda.', 2)
  ],
  chains: [
    { id: 'arg_1', premises: ['n_w', 'n_f'], conclusion: 'n_r', notes: ['/v/Teorema di Rolle.md'] },
    { id: 'arg_2', premises: ['n_r'], conclusion: 'n_l', notes: ['/v/Teorema di Lagrange.md'] }
  ]
}

function mount(status: ExtractorStatus = { queued: [] }) {
  let push: (e: { status: ExtractorStatus; graph?: GraphData }) => void = () => undefined
  const api = {
    get: vi.fn(async () => graph),
    status: vi.fn(async () => status),
    extract: vi.fn(async () => undefined),
    onChange: (cb: typeof push) => ((push = cb), () => undefined),
    positions: vi.fn(async () => ({})),
    savePositions: vi.fn(async () => undefined)
  }
  window.sinapsi = { graph: api } as never
  const onStudy = vi.fn()
  const onOpenNote = vi.fn()
  render(<GraphView index={index} onStudy={onStudy} onOpenNote={onOpenNote} />)
  return { api, onStudy, onOpenNote, push: (e: Parameters<typeof push>[0]) => act(() => push(e)) }
}

async function select(q: string, label: RegExp) {
  const box = screen.getByRole('combobox', { name: 'Cerca nel grafo' })
  fireEvent.change(box, { target: { value: q } })
  fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: label }))
}

describe('GraphView', () => {
  it('summarises the graph', async () => {
    mount()
    expect(await screen.findByText('4 concetti da 2 note · 2 catene · 1 in più note')).toBeTruthy()
  })
  it('finds a concept and shows its card with where it comes from and what it leads to', async () => {
    mount()
    await screen.findByText(/4 concetti/)
    await select('rolle', /Teorema di Rolle.*concetto/)
    const card = screen.getByRole('dialog', { name: 'Dettagli' })
    expect(within(card).getByText(/Esiste/)).toBeTruthy()
    expect(within(card).getByText('livello 1')).toBeTruthy()
    expect(within(card).getByText('Compare in 2 tue note: un nodo solo')).toBeTruthy()
    expect(within(card).getByRole('button', { name: /Teorema di Weierstrass/ })).toBeTruthy()
    expect(within(card).getByRole('button', { name: /Teorema di Lagrange/ })).toBeTruthy()
    expect(within(card).getByRole('button', { name: 'Cosa serve per capirlo (2)' })).toBeTruthy()
  })
  it('navigates with the keyboard in the search results', async () => {
    mount()
    await screen.findByText(/4 concetti/)
    const box = screen.getByRole('combobox', { name: 'Cerca nel grafo' })
    fireEvent.change(box, { target: { value: 'teorema' } })
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(screen.getByRole('dialog', { name: 'Dettagli' })).toBeTruthy()
  })
  it('offers to extract a note that has no concepts yet', async () => {
    const { api } = mount()
    await screen.findByText(/4 concetti/)
    await select('limiti', /Limiti/)
    const card = screen.getByRole('dialog', { name: 'Dettagli' })
    expect(within(card).getByText(/non ancora estratta/i)).toBeTruthy()
    fireEvent.click(within(card).getByRole('button', { name: 'Estrai i concetti' }))
    expect(api.extract).toHaveBeenCalledWith('/v/Limiti.md')
  })
  it('lets you study a region and open its note', async () => {
    const { onStudy, onOpenNote } = mount()
    await screen.findByText(/4 concetti/)
    await select('lagrange', /Teorema di Lagrange.*nota/)
    const card = screen.getByRole('dialog', { name: 'Dettagli' })
    fireEvent.click(within(card).getByRole('button', { name: 'Studia questa nota' }))
    expect(onStudy).toHaveBeenCalledWith('Teorema di Lagrange')
    fireEvent.click(within(card).getByRole('button', { name: 'Apri la nota' }))
    expect(onOpenNote).toHaveBeenCalledWith('/v/Teorema di Lagrange.md')
  })
  it('closes the card with Escape', async () => {
    mount()
    await screen.findByText(/4 concetti/)
    await select('fermat', /Teorema di Fermat/)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Dettagli' })).toBeNull()
  })
  it('keeps layout options folded until asked, then switches layout', async () => {
    mount()
    await screen.findByText(/4 concetti/)
    expect(screen.queryByRole('button', { name: 'A piani' })).toBeNull()
    const more = screen.getByRole('button', { name: 'Disposizione e strati' })
    expect(more.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(more)
    const b = screen.getByRole('button', { name: 'A piani' })
    fireEvent.click(b)
    expect(b.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Radiale' }).getAttribute('aria-pressed')).toBe('false')
  })
  it('says which note is being extracted and shows errors', async () => {
    const { push } = mount()
    await screen.findByText(/4 concetti/)
    push({ status: { running: '/v/Limiti.md', queued: ['/v/Teorema di Rolle.md'] } })
    expect(screen.getByText('Sto estraendo «Limiti»… (1 in coda)')).toBeTruthy()
    push({ status: { queued: [], lastError: { notePath: '/v/Limiti.md', message: 'Gemini non risponde.' } } })
    expect(screen.getByText(/Gemini non risponde/)).toBeTruthy()
  })
})
