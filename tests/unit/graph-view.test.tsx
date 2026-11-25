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

function mount(status: ExtractorStatus = { queued: [] }, opts?: { graph?: GraphData; onReview?: ReturnType<typeof vi.fn> }) {
  let push: (e: { status: ExtractorStatus; graph?: GraphData }) => void = () => undefined
  const g = opts?.graph ?? graph
  const api = {
    get: vi.fn(async () => g),
    status: vi.fn(async () => status),
    extract: vi.fn(async () => undefined),
    explainChain: vi.fn(async (id: string) => ({
      chainId: id,
      text: 'Dimostrazione verificata dai passaggi nella nota.',
      engine: 'claude',
      verdict: 'supported' as const,
      at: 123
    })),
    chainSource: vi.fn(async (id: string) => ({
      chainId: id,
      notePath: '/v/Teorema di Rolle.md',
      premises: [],
      conclusion: { id: 'n_r', name: 'Teorema di Rolle', statement: '' },
      excerpts: [],
      why: 'Perché da Weierstrass segue il massimo interno.'
    })),
    onChange: (cb: typeof push) => ((push = cb), () => undefined),
    positions: vi.fn(async () => ({})),
    savePositions: vi.fn(async () => undefined)
  }
  const reviewApi = {
    memory: vi.fn(async () => ({
      n_r: {
        conceptId: 'n_r',
        state: 'debole' as const,
        R: 0.3,
        due: null,
        reps: 3,
        lapses: 2,
        lastAt: Date.now() - 86400000,
        misconception: false
      },
      n_l: {
        conceptId: 'n_l',
        state: 'debole' as const,
        R: 0.2,
        due: null,
        reps: 3,
        lapses: 1,
        lastAt: Date.now() - 86400000,
        misconception: true
      }
    }))
  }
  window.sinapsi = { graph: api, review: reviewApi } as never
  const onStudy = vi.fn()
  const onOpenNote = vi.fn()
  const onReview = opts?.onReview ?? vi.fn()
  render(<GraphView menuOpen index={index} onStudy={onStudy} onOpenNote={onOpenNote} onReview={onReview} />)
  return { api, reviewApi, onStudy, onOpenNote, onReview, push: (e: Parameters<typeof push>[0]) => act(() => push(e)) }
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
    expect(screen.queryByRole('tab', { name: 'A piani' })).toBeNull()
    const more = screen.getByRole('button', { name: 'Disposizione e strati' })
    expect(more.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(more)
    // The layout selector is a segmented control: the library's tabs.
    const b = screen.getByRole('tab', { name: 'A piani' })
    fireEvent.click(b)
    expect(b.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Radiale' }).getAttribute('aria-selected')).toBe('false')
  })
  it('says which note is being extracted and shows errors', async () => {
    const { push } = mount()
    await screen.findByText(/4 concetti/)
    push({ status: { running: '/v/Limiti.md', queued: ['/v/Teorema di Rolle.md'] } })
    expect(screen.getByText('Sto estraendo «Limiti»… (1 in coda)')).toBeTruthy()
    push({ status: { queued: [], lastError: { notePath: '/v/Limiti.md', message: 'Gemini non risponde.' } } })
    expect(screen.getByText(/Gemini non risponde/)).toBeTruthy()
  })

  it('handles Tenuta all\'esame lens with date input, legend and Massimo guadagno action', async () => {
    const onReview = vi.fn()
    mount({ queued: [] }, { onReview })
    await screen.findByText(/4 concetti/)

    // Switch to lens section in dock
    const lensSectionBtn = screen.getByRole('button', { name: 'Evidenzia concetti' })
    fireEvent.click(lensSectionBtn)

    const examLensTab = screen.getByRole('tab', { name: "Tenuta all'esame" })
    fireEvent.click(examLensTab)

    expect(screen.getByLabelText('Data esame')).toBeTruthy()
    expect(screen.getByText('Solidi')).toBeTruthy()
    expect(screen.getByText('Traballanti')).toBeTruthy()
    expect(screen.getByText('Deboli')).toBeTruthy()

    const gainBtn = screen.getByRole('button', { name: 'Massimo guadagno' })
    fireEvent.click(gainBtn)
    expect(onReview).toHaveBeenCalledWith([], { order: 'gain', examAt: expect.any(Number) })
  })

  it('handles Orfani lens and lists data quality queue', async () => {
    const orphanGraph: GraphData = {
      ...graph,
      concepts: [
        ...graph.concepts,
        C('n_iso', 'Teorema di Rolle', 'Concetto Isolato', 'Isolato da tutti', 0)
      ]
    }
    mount({ queued: [] }, { graph: orphanGraph })
    await screen.findByText(/5 concetti/)

    const lensSectionBtn = screen.getByRole('button', { name: 'Evidenzia concetti' })
    fireEvent.click(lensSectionBtn)

    const orphansTab = screen.getByRole('tab', { name: /Orfani/ })
    fireEvent.click(orphansTab)

    expect(screen.getByText(/Isolati/)).toBeTruthy()
    const orphanBtn = screen.getByRole('button', { name: /Concetto Isolato/ })
    expect(orphanBtn).toBeTruthy()
    fireEvent.click(orphanBtn)

    // Opens concept card for the orphan
    expect(await screen.findByRole('dialog', { name: 'Dettagli' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Concetto Isolato' })).toBeTruthy()
  })

  it('displays suspect premise warning on concept card', async () => {
    mount()
    await screen.findByText(/4 concetti/)
    // In our test graph, n_w is premise to n_r which is premise to n_l.
    // Memory has n_r and n_l with lapses > 0 / misconception => n_w has 2 struggling descendants!
    await select('weierstrass', /Teorema di Weierstrass.*concetto/)
    expect(await screen.findByText(/Premessa sospetta: 2 conseguenze in difficoltà/)).toBeTruthy()
  })

  it('stage 2 Spiegazione AI: generate-then-reveal and displays extraction why', async () => {
    mount()
    await screen.findByText(/4 concetti/)
    await select('rolle', /Teorema di Rolle.*concetto/)
    const card = screen.getByRole('dialog', { name: 'Dettagli' })

    // Open the chain from the concept card's incoming chain list.
    const chainBtn = within(card).getByRole('button', { name: /Vedi nesso/ })
    fireEvent.click(chainBtn)

    // The extraction source, including its why field, loads through the reveal action.
    fireEvent.click(within(card).getByRole('button', { name: 'Rivela dalla nota' }))
    expect(await screen.findByText("Perché (dall'estrazione)")).toBeTruthy()

    // Stage 2: AI explanation generate-then-reveal
    expect(screen.getByText('Spiegazione AI')).toBeTruthy()
    const confirmBtn = screen.getByRole('button', { name: 'Conferma spiegazione' }) as HTMLButtonElement
    expect(confirmBtn.disabled).toBe(true)

    const textarea = screen.getByPlaceholderText(/Spiega con parole tue/)
    fireEvent.change(textarea, { target: { value: 'La mia dimostrazione del nesso' } })
    expect(confirmBtn.disabled).toBe(false)
    fireEvent.click(confirmBtn)

    expect(screen.getByText('La tua spiegazione:')).toBeTruthy()
    expect(screen.getByText('La mia dimostrazione del nesso')).toBeTruthy()

    const revealBtn = screen.getByRole('button', { name: 'Rivela spiegazione AI' })
    fireEvent.click(revealBtn)

    // AI badge and verdict
    expect(await screen.findByText('AI')).toBeTruthy()
    expect(screen.getByText('Verificata sulla nota')).toBeTruthy()
    expect(screen.getByText('Dimostrazione verificata dai passaggi nella nota.')).toBeTruthy()
  })

  it('aprire anteprima dalla card non smonta il canvas e non cambia la selezione; .lg-scene non aumenta', async () => {
    mount()
    await screen.findByText(/4 concetti/)

    // Select concept Rolle
    await select('rolle', /Teorema di Rolle.*concetto/)
    const card = screen.getByRole('dialog', { name: 'Dettagli' })
    expect(card).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Teorema di Rolle' })).toBeTruthy()

    const canvasBefore = document.querySelector('canvas')
    expect(canvasBefore).toBeTruthy()
    const sceneCountBefore = document.querySelectorAll('.lg-scene').length

    // Click "Apri la nota" inside the concept card
    const openNoteBtn = within(card).getByRole('button', { name: 'Apri la nota' })
    fireEvent.click(openNoteBtn)

    // NotePeek drawer is now open
    const peekDialog = await screen.findByRole('dialog', { name: 'Teorema di Rolle' })
    expect(peekDialog).toBeTruthy()
    expect(peekDialog.classList.contains('note-peek')).toBe(true)

    // Canvas is still mounted and unchanged
    const canvasAfter = document.querySelector('canvas')
    expect(canvasAfter).toBe(canvasBefore)

    // Selection card is still open and unchanged
    expect(screen.getByRole('dialog', { name: 'Dettagli' })).toBeTruthy()

    // Number of .lg-scene elements in the DOM did not increase
    const sceneCountAfter = document.querySelectorAll('.lg-scene').length
    expect(sceneCountAfter).toBe(sceneCountBefore)

    // Closing NotePeek returns focus to the button that opened it
    fireEvent.click(within(peekDialog).getByRole('button', { name: 'Chiudi' }))
    expect(document.activeElement).toBe(openNoteBtn)
  })
})
