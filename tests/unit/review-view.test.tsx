// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReviewView } from '../../src/renderer/src/review/ReviewView'
import type { ReviewItem } from '../../src/main/memory/review'
import { settingsSchema } from '../../src/shared/settings-schema'

afterEach(cleanup)
const mc: ReviewItem = {
  conceptId: 'n_w',
  name: 'Teorema di Weierstrass',
  notePath: '/v/Rolle.md',
  noteTitle: 'Teorema di Rolle',
  subject: 'matematica',
  R: 0.42,
  variantId: 'v_1',
  exercise: { type: 'mc', prompt: 'Quale ipotesi serve?', options: ['La continuità', 'La monotonia'], correct: 0, answer: 'La continuità su $[a,b]$.' }
}
const open: ReviewItem = { ...mc, conceptId: 'n_r', name: 'Teorema di Rolle', R: null, variantId: 'v_2', exercise: { type: 'open', prompt: 'Che cosa garantisce Rolle?', answer: 'Un punto a derivata nulla.' } }
const proof: ReviewItem = { ...mc, conceptId: 'n_p', name: 'Teorema di Rolle', variantId: 'v_3', exercise: { type: 'explain', prompt: 'A libro chiuso: ricostruisci la dimostrazione di Rolle.', answer: 'Weierstrass, poi Fermat.' } }
const intervals = { 1: '10 min', 2: '1 giorno', 3: '4 giorni', 4: '11 giorni' }

function mount(items: ReviewItem[], due = items.length) {
  const settings = settingsSchema('/x').parse({})
  const api = {
    review: {
      plan: vi.fn(async () => ({ items, due })),
      grade: vi.fn(async () => ({ verdict: 'partial', feedback: 'Manca il perché.', proposed: 2 })),
      explain: vi
        .fn()
        .mockResolvedValueOnce({ kind: 'question', question: 'Perché il massimo è interno?' })
        .mockResolvedValueOnce({ kind: 'verdict', verdict: 'partial', feedback: 'Manca il caso costante.', proposed: 2 }),
      voice: vi.fn(async () => 'detto a voce'),
      microphone: vi.fn(async () => true),
      record: vi.fn(async (r: { conceptId: string; grade: number }) => ({ memory: { conceptId: r.conceptId, R: r.grade > 1 ? 0.95 : 0.3, state: 'la sai' }, intervals })),
      intervals: vi.fn(async () => intervals),
      memory: vi.fn(async () => ({}))
    },
    settings: { get: vi.fn(async () => settings), set: vi.fn(async (p: object) => ({ ...settings, ...p })) }
  }
  window.sinapsi = api as never
  const onStudy = vi.fn()
  const onOpenNote = vi.fn()
  render(<ReviewView onBack={vi.fn()} onStudy={onStudy} onOpenNote={onOpenNote} />)
  return { api, onStudy, onOpenNote }
}
const start = async (): Promise<void> => fireEvent.click(await screen.findByRole('button', { name: 'Inizia ripasso' }))

describe('ReviewView', () => {
  it('introduces what is fading with its retention', async () => {
    mount([mc, open])
    expect(await screen.findByRole('heading', { name: /2 cose stanno sbiadendo/ })).toBeTruthy()
    const list = screen.getByRole('list', { name: 'Da ripassare' })
    expect(within(list).getByText('Teorema di Weierstrass')).toBeTruthy()
    expect(within(list).getByText('42%')).toBeTruthy()
    expect(within(list).getByText('nuovo')).toBeTruthy()
  })
  it('lets Andrea choose the exercise types, keeping at least one', async () => {
    const { api } = mount([mc])
    await screen.findByRole('heading', { name: /sbiadendo/ })
    const chips = within(screen.getByRole('group', { name: 'Esercizi' })).getAllByRole('button')
    expect(chips).toHaveLength(11)
    fireEvent.click(screen.getByRole('button', { name: 'Riordina i passi' }))
    expect(api.settings.set).toHaveBeenLastCalledWith({ exerciseTypes: expect.not.arrayContaining(['order']) })
    for (const c of chips) if (c.getAttribute('aria-pressed') === 'true') fireEvent.click(c)
    expect(chips.filter((c) => c.getAttribute('aria-pressed') === 'true')).toHaveLength(1)
  })
  it('checks a choice, proposes Bene when right and sure, and records the chosen grade', async () => {
    const { api } = mount([mc])
    await start()
    fireEvent.click(screen.getByRole('button', { name: /La continuità/ }))
    fireEvent.change(screen.getByLabelText('Quanto sei sicuro?'), { target: { value: '80' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verifica' }))
    expect(await screen.findByText('Corretto')).toBeTruthy()
    const grades = screen.getByRole('group', { name: 'Quanto ti è costato ricordarlo?' })
    expect(within(grades).getByRole('button', { name: /Bene/ }).textContent).toContain('proposta')
    expect(within(grades).getByRole('button', { name: /Bene/ }).textContent).toContain('4 giorni')
    fireEvent.click(within(grades).getByRole('button', { name: /Facile/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Vedi riepilogo' }))
    await screen.findByRole('heading', { name: /nitido/ })
    expect(api.review.record).toHaveBeenCalledWith(expect.objectContaining({ conceptId: 'n_w', grade: 4, confidence: 80, correct: true, variantId: 'v_1', type: 'mc' }))
  })
  it('spots a confident mistake and offers to study the concept', async () => {
    const { onStudy } = mount([mc])
    await start()
    fireEvent.click(screen.getByRole('button', { name: /La monotonia/ }))
    fireEvent.change(screen.getByLabelText('Quanto sei sicuro?'), { target: { value: '90' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verifica' }))
    expect(await screen.findByText('Sbagliato con sicurezza: possibile misconcezione')).toBeTruthy()
    expect(within(screen.getByRole('group', { name: 'Quanto ti è costato ricordarlo?' })).getByRole('button', { name: /Di nuovo/ }).textContent).toContain('proposta')
    fireEvent.click(screen.getByRole('button', { name: 'Vedi riepilogo' }))
    expect(await screen.findByText(/Possibile misconcezione su Teorema di Weierstrass/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Studia questo concetto' }))
    expect(onStudy).toHaveBeenCalledWith('Teorema di Weierstrass')
    expect(screen.getByRole('button', { name: 'Rifai subito gli errori' })).toBeTruthy()
  })
  it('sends open answers to the AI and shows its correction', async () => {
    const { api } = mount([open])
    await start()
    fireEvent.change(screen.getByLabelText('La tua risposta, ragionando ad alta voce'), { target: { value: 'una tangente orizzontale' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verifica' }))
    expect(await screen.findByText('Manca il perché.')).toBeTruthy()
    expect(api.review.grade).toHaveBeenCalledWith(expect.objectContaining({ conceptId: 'n_r', answer: 'una tangente orizzontale', confidence: 50 }))
    expect(screen.getByText('Un punto a derivata nulla.')).toBeTruthy()
  })
  it('Spiegalo tu: the picky student asks the missing step, then gives the verdict that is recorded', async () => {
    const { api } = mount([proof])
    await start()
    expect(screen.getByText(/compagno pignolo/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('La tua spiegazione, a libro chiuso'), { target: { value: 'Per Weierstrass ha massimo e minimo.' } })
    fireEvent.change(screen.getByLabelText('Quanto sei sicuro?'), { target: { value: '70' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verifica' }))
    expect(await screen.findByText('Perché il massimo è interno?')).toBeTruthy()
    expect(screen.queryByLabelText('Quanto sei sicuro?')).toBeNull()
    const answer = screen.getByLabelText('La tua risposta') as HTMLTextAreaElement
    expect(answer.value).toBe('')
    fireEvent.change(answer, { target: { value: 'Se fosse sul bordo f sarebbe costante.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rispondi' }))
    expect(await screen.findByText('Manca il caso costante.')).toBeTruthy()
    expect(api.review.explain).toHaveBeenLastCalledWith({
      conceptId: 'n_p',
      exercise: proof.exercise,
      confidence: 70,
      turns: [
        { by: 'andrea', text: 'Per Weierstrass ha massimo e minimo.' },
        { by: 'claude', text: 'Perché il massimo è interno?' },
        { by: 'andrea', text: 'Se fosse sul bordo f sarebbe costante.' }
      ]
    })
    expect(screen.getByText('Weierstrass, poi Fermat.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Vedi riepilogo' }))
    await screen.findByRole('heading', { name: /nitido/ })
    expect(api.review.record).toHaveBeenCalledWith(expect.objectContaining({ conceptId: 'n_p', grade: 2, correct: false, type: 'explain', variantId: 'v_3' }))
  })
  it('"Non lo so" reveals the answer and proposes Di nuovo', async () => {
    mount([mc])
    await start()
    fireEvent.click(screen.getByRole('button', { name: 'Non lo so' }))
    expect(await screen.findByText('Va bene non saperlo')).toBeTruthy()
  })
  it('offers the weakest concepts when nothing is due', async () => {
    const { api } = mount([], 0)
    expect(await screen.findByRole('heading', { name: 'Niente da ripassare oggi.' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ripassa comunque i più deboli' }))
    expect(api.review.plan).toHaveBeenLastCalledWith({ weakest: true })
  })
})
