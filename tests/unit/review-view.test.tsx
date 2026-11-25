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

function mount(items: ReviewItem[], due = items.length, toStudy: { conceptId: string; name: string; noteTitle: string }[] = [], onPractice?: (conceptIds: string[]) => void) {
  const settings = settingsSchema('/x').parse({})
  const api = {
    review: {
      plan: vi.fn(async () => ({ items, due, toStudy })),
      grade: vi.fn(async () => ({ verdict: 'partial', feedback: 'Manca il perché.', proposed: 2 })),
      explain: vi
        .fn()
        .mockResolvedValueOnce({ kind: 'question', question: 'Perché il massimo è interno?' })
        .mockResolvedValueOnce({ kind: 'verdict', verdict: 'partial', feedback: 'Manca il caso costante.', proposed: 2 }),
      voice: vi.fn(async () => 'detto a voce'),
      microphone: vi.fn(async () => true),
      record: vi.fn(async (r: { conceptId: string; grade: number }) => ({ memory: { conceptId: r.conceptId, R: r.grade > 1 ? 0.95 : 0.3, state: 'la sai' }, intervals })),
      intervals: vi.fn(async () => intervals),
      memory: vi.fn(async () => ({})),
      contest: vi.fn(async () => ({ verdict: 'ok', feedback: 'Corretto dopo verifica.', proposed: 3 })),
      prerequisites: vi.fn(async (conceptId: string, budget: number) => {
        return Array.from({ length: budget }, (_, idx) => ({
          conceptId: `prereq_${conceptId}_${idx}`,
          name: `Prerequisito ${idx + 1} di ${conceptId}`,
          notePath: '/v/Prereq.md',
          noteTitle: 'Prerequisiti',
          subject: 'matematica',
          R: 0.2,
          cascadeOf: conceptId,
          exercise: { type: 'mc' as const, prompt: 'Prompt prereq', options: ['A', 'B'], correct: 0, answer: 'A' }
        }))
      })
    },
    settings: { get: vi.fn(async () => settings), set: vi.fn(async (p: object) => ({ ...settings, ...p })) }
  }
  window.sinapsi = api as never
  const onStudy = vi.fn()
  const onOpenNote = vi.fn()
  render(<ReviewView onBack={vi.fn()} onStudy={onStudy} onPractice={onPractice} onOpenNote={onOpenNote} />)
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
    expect(chips).toHaveLength(12)
    fireEvent.click(screen.getByRole('button', { name: 'Riordina i passi' }))
    expect(api.settings.set).toHaveBeenLastCalledWith({ exerciseTypes: expect.not.arrayContaining(['order']) })
    for (const c of chips) if (c.getAttribute('aria-pressed') === 'true') fireEvent.click(c)
    expect(chips.filter((c) => c.getAttribute('aria-pressed') === 'true')).toHaveLength(1)
  })
  it('checks a choice, proposes Bene when right and sure, and records the chosen grade', async () => {
    const { api } = mount([mc])
    await start()
    fireEvent.click(screen.getByRole('button', { name: /La continuità/ }))
    fireEvent.click(screen.getByRole('tab', { name: 'Sicuro' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verifica' }))
    expect(await screen.findByText('Corretto')).toBeTruthy()
    const grades = screen.getByRole('group', { name: 'Quanto ti è costato ricordarlo?' })
    expect(within(grades).getAllByRole('button')).toHaveLength(3)
    expect(within(grades).queryByRole('button', { name: /Facile/ })).toBeNull()
    expect(within(grades).getByRole('button', { name: /Bene/ }).textContent).toContain('proposta')
    expect(within(grades).getByRole('button', { name: /Bene/ }).textContent).not.toContain('4 giorni')
    fireEvent.click(within(grades).getByRole('button', { name: /Bene/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Vedi riepilogo' }))
    await screen.findByRole('heading', { name: /nitido/ })
    expect(screen.getByText(/Torna tra 4 giorni/)).toBeTruthy()
    expect(api.review.record).toHaveBeenCalledWith(
      expect.objectContaining({
        conceptId: 'n_w',
        grade: 3,
        confidence: 88,
        correct: true,
        variantId: 'v_1',
        type: 'mc'
      })
    )
  })
  it('spots a confident mistake and offers to study the concept', async () => {
    const { onStudy } = mount([mc])
    await start()
    fireEvent.click(screen.getByRole('button', { name: /La monotonia/ }))
    fireEvent.click(screen.getByRole('tab', { name: 'Sicuro' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verifica' }))
    expect(await screen.findByText('Sbagliato con sicurezza: possibile misconcezione')).toBeTruthy()
    const grades = screen.getByRole('group', { name: 'Quanto ti è costato ricordarlo?' })
    expect(within(grades).getByRole('button', { name: /Di nuovo/ }).textContent).toContain('proposta')
    expect((within(grades).getByRole('button', { name: /Difficile/ }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(grades).getByRole('button', { name: /Bene/ }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Vedi riepilogo' }))
    expect(await screen.findByText('Ripresentato')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /La continuità/ }))
    fireEvent.click(screen.getByRole('tab', { name: 'Sicuro' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verifica' }))
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
    fireEvent.click(screen.getByRole('tab', { name: 'Abbastanza sicuro' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verifica' }))
    expect(await screen.findByText('Manca il perché.')).toBeTruthy()
    expect(api.review.grade).toHaveBeenCalledWith(expect.objectContaining({ conceptId: 'n_r', answer: 'una tangente orizzontale', confidence: 63 }))
    expect(screen.getByText('Un punto a derivata nulla.')).toBeTruthy()
  })
  it('Spiegalo tu: the picky student asks the missing step, then gives the verdict that is recorded', async () => {
    const { api } = mount([proof])
    await start()
    expect(screen.getByText(/compagno pignolo/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('La tua spiegazione, a libro chiuso'), { target: { value: 'Per Weierstrass ha massimo e minimo.' } })
    fireEvent.click(screen.getByRole('tab', { name: 'Abbastanza sicuro' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verifica' }))
    expect(await screen.findByText('Perché il massimo è interno?')).toBeTruthy()
    const answer = screen.getByLabelText('La tua risposta') as HTMLTextAreaElement
    expect(answer.value).toBe('')
    fireEvent.change(answer, { target: { value: 'Se fosse sul bordo f sarebbe costante.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rispondi' }))
    expect(await screen.findByText('Manca il caso costante.')).toBeTruthy()
    expect(api.review.explain).toHaveBeenLastCalledWith({
      conceptId: 'n_p',
      exercise: proof.exercise,
      confidence: 63,
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
  it('shows the Da studiare block in empty state and button calls onStudy', async () => {
    const toStudy = [{ conceptId: 'c_bolzano', name: 'Teorema di Bolzano', noteTitle: 'Continuità' }]
    const { onStudy } = mount([], 0, toStudy)
    expect(await screen.findByRole('heading', { name: 'Niente da ripassare oggi.' })).toBeTruthy()
    expect(screen.getByText(/nuovi concetti da studiare/i)).toBeTruthy()
    expect(screen.queryByText(/è ancora nitido/i)).toBeNull()
    const block = screen.getByLabelText('Da studiare')
    expect(within(block).getByText('Teorema di Bolzano')).toBeTruthy()
    expect(within(block).getByText('Continuità')).toBeTruthy()
    const studyBtn = within(block).getByRole('button', { name: 'Studia' })
    fireEvent.click(studyBtn)
    expect(onStudy).toHaveBeenCalledWith('Teorema di Bolzano')
  })
  it('shows the Da studiare block in initial overview without blocking review', async () => {
    const toStudy = [{ conceptId: 'c_bolzano', name: 'Teorema di Bolzano', noteTitle: 'Continuità' }]
    const { onStudy } = mount([mc], 1, toStudy)
    await screen.findByRole('heading', { name: /concetto da fissare|sbiadendo/ })
    const block = screen.getByLabelText('Da studiare')
    expect(within(block).getByText('Teorema di Bolzano')).toBeTruthy()
    const studyBtn = within(block).getByRole('button', { name: 'Studia' })
    fireEvent.click(studyBtn)
    expect(onStudy).toHaveBeenCalledWith('Teorema di Bolzano')
    expect(screen.getByRole('button', { name: 'Inizia ripasso' })).toBeTruthy()
  })
  it('shows the Da studiare block in end summary and button calls onStudy', async () => {
    const toStudy = [{ conceptId: 'c_bolzano', name: 'Teorema di Bolzano', noteTitle: 'Continuità' }]
    const { onStudy } = mount([mc], 1, toStudy)
    await start()
    fireEvent.click(screen.getByRole('button', { name: /La continuità/ }))
    fireEvent.click(screen.getByRole('tab', { name: 'Sicuro' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verifica' }))
    fireEvent.click(screen.getByRole('button', { name: 'Vedi riepilogo' }))
    await screen.findByRole('heading', { name: /nitido/ })
    const block = screen.getByLabelText('Da studiare')
    expect(within(block).getByText('Teorema di Bolzano')).toBeTruthy()
    const studyBtn = within(block).getByRole('button', { name: 'Studia' })
    fireEvent.click(studyBtn)
    expect(onStudy).toHaveBeenCalledWith('Teorema di Bolzano')
  })
  it('requires confidence before verification and enables it once picked; Non lo so bypasses it', async () => {
    mount([mc])
    await start()
    fireEvent.click(screen.getByRole('button', { name: /La continuità/ }))
    const verifyBtn = screen.getByRole('button', { name: 'Verifica' }) as HTMLButtonElement
    expect(verifyBtn.disabled).toBe(true)
    fireEvent.click(screen.getByRole('tab', { name: 'Incerto' }))
    expect(verifyBtn.disabled).toBe(false)
  })
  it('enforces downward-only grade override when proposed is Difficile (2)', async () => {
    mount([mc])
    await start()
    fireEvent.click(screen.getByRole('button', { name: /La continuità/ }))
    fireEvent.click(screen.getByRole('tab', { name: 'Tiro a indovinare' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verifica' }))
    await screen.findByText('Corretto')
    const grades = screen.getByRole('group', { name: 'Quanto ti è costato ricordarlo?' })
    const b1 = within(grades).getByRole('button', { name: /Di nuovo/ }) as HTMLButtonElement
    const b2 = within(grades).getByRole('button', { name: /Difficile/ }) as HTMLButtonElement
    const b3 = within(grades).getByRole('button', { name: /Bene/ }) as HTMLButtonElement
    expect(b2.textContent).toContain('proposta')
    expect(b1.disabled).toBe(false)
    expect(b2.disabled).toBe(false)
    expect(b3.disabled).toBe(true)
  })
  it('allows all grades 1-3 when corrector falls back with an error', async () => {
    mount([open])
    window.sinapsi.review.grade = vi.fn(async () => ({
      verdict: 'partial',
      feedback: 'Non sono riuscito a correggere: valuta tu confrontando con la risposta di riferimento.',
      proposed: 2
    }))
    await start()
    fireEvent.change(screen.getByLabelText('La tua risposta, ragionando ad alta voce'), { target: { value: 'risposta' } })
    fireEvent.click(screen.getByRole('tab', { name: 'Abbastanza sicuro' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verifica' }))
    await screen.findByText(/Non sono riuscito a correggere/)
    const grades = screen.getByRole('group', { name: 'Quanto ti è costato ricordarlo?' })
    const b1 = within(grades).getByRole('button', { name: /Di nuovo/ }) as HTMLButtonElement
    const b2 = within(grades).getByRole('button', { name: /Difficile/ }) as HTMLButtonElement
    const b3 = within(grades).getByRole('button', { name: /Bene/ }) as HTMLButtonElement
    expect(b1.disabled).toBe(false)
    expect(b2.disabled).toBe(false)
    expect(b3.disabled).toBe(false)
  })
  it('allows contesting correction on open exercise and records contested: true', async () => {
    const { api } = mount([open])
    await start()
    fireEvent.change(screen.getByLabelText('La tua risposta, ragionando ad alta voce'), { target: { value: 'derivata nulla in un punto' } })
    fireEvent.click(screen.getByRole('tab', { name: 'Sicuro' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verifica' }))
    await screen.findByText('Manca il perché.')
    const contestBtn = screen.getByRole('button', { name: 'Contesta la correzione' })
    expect(contestBtn).toBeTruthy()
    fireEvent.click(contestBtn)
    expect(await screen.findByText('Corretto dopo verifica.')).toBeTruthy()
    expect(api.review.contest).toHaveBeenCalledWith(
      expect.objectContaining({
        conceptId: 'n_r',
        answer: 'derivata nulla in un punto',
        confidence: 88
      })
    )
    expect(screen.queryByRole('button', { name: 'Contesta la correzione' })).toBeNull()
    const grades = screen.getByRole('group', { name: 'Quanto ti è costato ricordarlo?' })
    expect(within(grades).getByRole('button', { name: /Bene/ }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Vedi riepilogo' }))
    await screen.findByRole('heading', { name: /nitido/ })
    expect(api.review.record).toHaveBeenCalledWith(
      expect.objectContaining({
        conceptId: 'n_r',
        contested: true
      })
    )
  })
  it('does not display "Contesta la correzione" for choice items or ok verdicts', async () => {
    mount([mc])
    await start()
    fireEvent.click(screen.getByRole('button', { name: /La continuità/ }))
    fireEvent.click(screen.getByRole('tab', { name: 'Sicuro' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verifica' }))
    await screen.findByText('Corretto')
    expect(screen.queryByRole('button', { name: 'Contesta la correzione' })).toBeNull()
  })
  it('renders summary bars with scaleX var(--v) style and keeps aria-label', async () => {
    mount([mc])
    await start()
    fireEvent.click(screen.getByRole('button', { name: /La continuità/ }))
    fireEvent.click(screen.getByRole('tab', { name: 'Sicuro' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verifica' }))
    await screen.findByText('Corretto')
    fireEvent.click(screen.getByRole('button', { name: 'Vedi riepilogo' }))
    await screen.findByRole('heading', { name: /nitido/ })

    const bars = screen.getByLabelText(/Prima \d+%, dopo \d+%/)
    expect(bars).toBeTruthy()

    const afterBar = bars.querySelector('.after') as HTMLElement
    expect(afterBar).toBeTruthy()
    expect(afterBar.style.getPropertyValue('--v')).toBeTruthy()
  })
  it('cascades prerequisites within remaining budget and does not grow queue length', async () => {
    const itemA: ReviewItem = { ...mc, conceptId: 'c_a', name: 'Concetto A' }
    const itemB: ReviewItem = { ...mc, conceptId: 'c_b', name: 'Concetto B' }
    const itemC: ReviewItem = { ...mc, conceptId: 'c_c', name: 'Concetto C' }
    const { api } = mount([itemA, itemB, itemC])
    await start()
    expect(screen.getByText('1 / 3')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /La monotonia/ }))
    fireEvent.click(screen.getByRole('tab', { name: 'Tiro a indovinare' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verifica' }))
    await screen.findByText('Non ancora')
    fireEvent.click(screen.getByRole('button', { name: 'Prossima' }))
    await vi.waitFor(() => {
      expect(api.review.prerequisites).toHaveBeenCalledWith('c_a', 2)
    })
    expect(await screen.findByText('2 / 3')).toBeTruthy()
  })

  it('re-presents an error later in session, discrete Ripresentato chip, no review.record on repeat, queue length fixed', async () => {
    const c1: ReviewItem = { ...mc, conceptId: 'c1', name: 'Concetto 1' }
    const c2: ReviewItem = { ...mc, conceptId: 'c2', name: 'Concetto 2' }
    const c3: ReviewItem = { ...mc, conceptId: 'c3', name: 'Concetto 3' }
    const c4: ReviewItem = { ...mc, conceptId: 'c4', name: 'Concetto 4' }
    const c5: ReviewItem = { ...mc, conceptId: 'c5', name: 'Concetto 5' }
    const { api } = mount([c1, c2, c3, c4, c5])
    api.review.prerequisites.mockResolvedValue([])
    await start()
    expect(screen.getByText('1 / 5')).toBeTruthy()

    // Answer c1 wrong (grade 1)
    fireEvent.click(screen.getByRole('button', { name: /La monotonia/ }))
    fireEvent.click(screen.getByRole('tab', { name: 'Sicuro' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verifica' }))
    await screen.findByText('Sbagliato con sicurezza: possibile misconcezione')
    expect(api.review.record).toHaveBeenCalledTimes(0)

    // Advance: c1 recorded with grade 1; budget consumed (c5 removed), c1 re-inserted after c2, c3, c4
    fireEvent.click(screen.getByRole('button', { name: 'Prossima' }))
    expect(await screen.findByText('2 / 5')).toBeTruthy()
    expect(api.review.record).toHaveBeenCalledTimes(1)
    expect(api.review.record).toHaveBeenLastCalledWith(expect.objectContaining({ conceptId: 'c1', grade: 1 }))

    // Pass through c2, c3, c4 (getting them right)
    for (let step = 0; step < 3; step++) {
      const tab = await screen.findByRole('tab', { name: 'Sicuro' })
      fireEvent.click(screen.getByRole('button', { name: /La continuità/ }))
      fireEvent.click(tab)
      fireEvent.click(screen.getByRole('button', { name: 'Verifica' }))
      await screen.findByText('Corretto')
      fireEvent.click(screen.getByRole('button', { name: 'Prossima' }))
    }

    // Now at item 5 / 5: re-presented c1!
    expect(await screen.findByText('5 / 5')).toBeTruthy()
    expect(await screen.findByText('Ripresentato')).toBeTruthy()

    const recordCallsBefore = api.review.record.mock.calls.length
    // Answer re-presented c1 correctly
    fireEvent.click(screen.getByRole('button', { name: /La continuità/ }))
    fireEvent.click(screen.getByRole('tab', { name: 'Sicuro' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verifica' }))
    await screen.findByText('Corretto')
    fireEvent.click(screen.getByRole('button', { name: 'Vedi riepilogo' }))

    // Re-presentation must NOT call review.record
    expect(api.review.record.mock.calls.length).toBe(recordCallsBefore)
    await screen.findByRole('heading', { name: /nitido/ })
  })

  it('caps re-presentations at a maximum of 2 on repeated errors', async () => {
    const item: ReviewItem = { ...mc, conceptId: 'c_fail', name: 'Concetto Fallito' }
    const { api } = mount([item])
    await start()

    // Initial attempt: fail (attempt 0 -> re-presentation 1 scheduled)
    fireEvent.click(screen.getByRole('button', { name: /La monotonia/ }))
    fireEvent.click(screen.getByRole('tab', { name: 'Sicuro' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verifica' }))
    fireEvent.click(screen.getByRole('button', { name: 'Vedi riepilogo' }))
    expect(api.review.record).toHaveBeenCalledTimes(1)

    // Re-presentation 1: fail again (attempt 1 -> re-presentation 2 scheduled)
    expect(await screen.findByText('Ripresentato')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /La monotonia/ }))
    fireEvent.click(screen.getByRole('tab', { name: 'Sicuro' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verifica' }))
    fireEvent.click(screen.getByRole('button', { name: 'Vedi riepilogo' }))
    expect(api.review.record).toHaveBeenCalledTimes(1) // Still 1!

    // Re-presentation 2: fail again (attempt 2 -> max reached, session terminates)
    expect(await screen.findByText('Ripresentato')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /La monotonia/ }))
    fireEvent.click(screen.getByRole('tab', { name: 'Sicuro' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verifica' }))
    fireEvent.click(screen.getByRole('button', { name: 'Vedi riepilogo' }))
    expect(api.review.record).toHaveBeenCalledTimes(1) // Still 1!

    // Terminated, reaches summary!
    await screen.findByRole('heading', { name: /nitido/ })
  })

  it('shows optional "Allenati su questo" button in error feedback and invokes onPractice', async () => {
    const onPractice = vi.fn()
    mount([mc], 1, [], onPractice)
    await start()

    // Wrong answer
    fireEvent.click(screen.getByRole('button', { name: /La monotonia/ }))
    fireEvent.click(screen.getByRole('tab', { name: 'Sicuro' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verifica' }))
    await screen.findByText('Sbagliato con sicurezza: possibile misconcezione')

    const practiceBtn = screen.getByRole('button', { name: 'Allenati su questo' })
    expect(practiceBtn).toBeTruthy()
    fireEvent.click(practiceBtn)
    expect(onPractice).toHaveBeenCalledWith(['n_w'])
  })

  it('does not show "Allenati su questo" button when answer is correct or onPractice is omitted', async () => {
    // Correct answer with onPractice provided
    const onPractice = vi.fn()
    mount([mc], 1, [], onPractice)
    await start()

    fireEvent.click(screen.getByRole('button', { name: /La continuità/ }))
    fireEvent.click(screen.getByRole('tab', { name: 'Sicuro' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verifica' }))
    await screen.findByText('Corretto')
    expect(screen.queryByRole('button', { name: 'Allenati su questo' })).toBeNull()
  })

  it('opens NotePeek when clicking "Apri nella nota" and allows opening note', async () => {
    const { onOpenNote } = mount([mc])
    await start()
    fireEvent.click(screen.getByRole('button', { name: /La continuità/ }))
    fireEvent.click(screen.getByRole('tab', { name: 'Sicuro' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verifica' }))
    await screen.findByText('Corretto')

    const openNoteBtn = screen.getByRole('button', { name: 'Apri nella nota' })
    fireEvent.click(openNoteBtn)

    const peekDialog = await screen.findByRole('dialog', { name: 'Teorema di Weierstrass' })
    expect(peekDialog).toBeTruthy()
    expect(within(peekDialog).getByText('Teorema di Rolle')).toBeTruthy()

    const openComplete = within(peekDialog).getByRole('button', { name: 'Apri la nota' })
    fireEvent.click(openComplete)
    expect(onOpenNote).toHaveBeenCalledWith('/v/Rolle.md')
  })
})
