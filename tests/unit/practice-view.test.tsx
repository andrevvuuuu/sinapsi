// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PracticeSetup } from '../../src/renderer/src/practice/PracticeSetup'
import { PracticeView } from '../../src/renderer/src/practice/PracticeView'
import type { PracticeState } from '../../src/main/practice/events'
import type { Catalog } from '../../src/shared/practice-types'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
Element.prototype.scrollIntoView = vi.fn()

const ID = '11111111-1111-4111-8111-111111111111'
const catalog: Catalog = {
  subjects: [
    {
      name: 'Analisi',
      notes: [
        { path: '/v/Rolle.md', title: 'Teorema di Rolle', concepts: [{ id: 'n_r', name: 'Teorema di Rolle', R: 0.31, due: true, practiced: true }, { id: 'n_w', name: 'Teorema di Weierstrass', R: 0.5, due: false, practiced: true }] },
        { path: '/v/Lagrange.md', title: 'Teorema di Lagrange', concepts: [{ id: 'n_l', name: 'Teorema di Lagrange', R: 0.23, due: true, practiced: true }, { id: 'n_f', name: 'Teorema di Fermat', R: 0.9, due: false, practiced: false }] }
      ]
    }
  ],
  sources: [{ id: '22222222-2222-4222-8222-222222222222', title: 'Temi d’esame', kind: 'pdf', notebook: 'Analisi 1', info: '34 pagine' }],
  suggested: [
    { id: 'n_l', name: 'Teorema di Lagrange', why: 'da ripassare · 23%' },
    { id: 'n_r', name: 'Teorema di Rolle', why: 'da ripassare · 31%' },
    { id: 'n_f', name: 'Teorema di Fermat', why: 'mai praticato' }
  ]
}

function api(state?: PracticeState) {
  let listener: (s: PracticeState) => void = () => undefined
  const a = {
    practice: {
      catalog: vi.fn(async () => catalog),
      create: vi.fn(async () => ID),
      examStart: vi.fn(async () => ID),
      get: vi.fn(async () => state),
      submit: vi.fn(async () => undefined),
      retry: vi.fn(async () => undefined),
      examSave: vi.fn(async () => undefined),
      examDeliver: vi.fn(async () => undefined),
      examHand: vi.fn(async () => undefined),
      examSelf: vi.fn(async () => undefined),
      calibration: vi.fn(async () => [] as unknown[]),
      photo: vi.fn(async () => '$|\\cos c| \\le 1$'),
      camera: vi.fn(async () => true),
      onUpdate: vi.fn((cb: (s: PracticeState) => void) => ((listener = cb), () => undefined))
    }
  }
  window.sinapsi = a as never
  return { a, push: (s: PracticeState) => act(() => listener(s)) }
}

describe('PracticeSetup', () => {
  it('pre-selects the two most urgent suggestions and shows why the others are suggested', async () => {
    api()
    render(<PracticeSetup onBack={vi.fn()} onStarted={vi.fn()} />)
    const picked = await screen.findByRole('group', { name: 'Scelti' })
    expect(within(picked).getByText('Teorema di Lagrange')).toBeTruthy()
    expect(within(picked).getByText('Teorema di Rolle')).toBeTruthy()
    const sugg = screen.getByRole('group', { name: 'Suggeriti per oggi' })
    expect(within(sugg).getByRole('button', { name: /Teorema di Fermat.*mai praticato/ })).toBeTruthy()
    expect(screen.getByText('2 concetti · ~12 min')).toBeTruthy()
  })
  it('adds the concepts matching a typed topic and starts a training session', async () => {
    const { a } = api()
    const onStarted = vi.fn()
    render(<PracticeSetup onBack={vi.fn()} onStarted={onStarted} />)
    await screen.findByRole('group', { name: 'Scelti' })
    fireEvent.click(within(screen.getByRole('group', { name: 'Scelti' })).getByRole('button', { name: 'Togli Teorema di Rolle' }))
    const free = screen.getByLabelText('Argomento libero')
    fireEvent.change(free, { target: { value: 'weierstrass' } })
    fireEvent.keyDown(free, { key: 'Enter' })
    expect(screen.getByRole('status').textContent).toContain('Trovato 1 concetto per «weierstrass»')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Inizia allenamento' })))
    expect(a.practice.create).toHaveBeenCalledWith({ conceptIds: ['n_l', 'n_w'], sourceIds: [], free: '' })
    expect(onStarted).toHaveBeenCalledWith(ID)
  })
  it('keeps unmatched text as a free topic, and starts an exam of a custom length', async () => {
    const { a } = api()
    render(<PracticeSetup initialText="autovalori" onBack={vi.fn()} onStarted={vi.fn()} />)
    await screen.findByRole('group', { name: 'Scelti' })
    expect(screen.getByRole('status').textContent).toContain('lo userò come argomento libero')
    fireEvent.click(screen.getByRole('radio', { name: /Simulazione d'esame/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Altro…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Più 5 minuti' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Inizia simulazione · 50 min' })))
    expect(a.practice.examStart).toHaveBeenCalledWith({ conceptIds: ['n_l', 'n_r'], sourceIds: [], free: 'autovalori' }, 50, false)
  })
  it('starts an exam on paper', async () => {
    const { a } = api()
    render(<PracticeSetup onBack={vi.fn()} onStarted={vi.fn()} />)
    await screen.findByRole('group', { name: 'Scelti' })
    fireEvent.click(screen.getByRole('radio', { name: /Simulazione d'esame/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Carta e penna' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Inizia simulazione su carta · 60 min' })))
    expect(a.practice.examStart).toHaveBeenCalledWith({ conceptIds: ['n_l', 'n_r'], sourceIds: [], free: '' }, 60, true)
  })
  it('picks concepts and sources in the dialog; closing without confirming restores the choice', async () => {
    api()
    render(<PracticeSetup onBack={vi.fn()} onStarted={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Scegli…' }))
    let dlg = screen.getByRole('dialog', { name: 'Scegli il materiale' })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Mai praticati' }))
    expect(within(dlg).queryByLabelText('Teorema di Rolle')).toBeNull()
    fireEvent.click(within(dlg).getByLabelText('Teorema di Fermat'))
    fireEvent.click(within(dlg).getByRole('tab', { name: 'Fonti' }))
    fireEvent.click(within(dlg).getByLabelText(/Temi d’esame/))
    fireEvent.click(within(dlg).getByRole('button', { name: 'Conferma' }))
    expect(screen.getByText('3 concetti · 1 fonte · ~28 min')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Scegli…' }))
    dlg = screen.getByRole('dialog', { name: 'Scegli il materiale' })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Svuota' }))
    fireEvent.click(within(dlg).getByRole('button', { name: 'Chiudi' }))
    expect(screen.getByText('3 concetti · 1 fonte · ~28 min')).toBeTruthy()
  })
})

const material = { conceptIds: ['n_r'], sourceIds: [], free: '' }
const base: PracticeState = { id: ID, mode: 'train', material, topic: 'Rolle', phase: 'warmup', items: [], problems: [], paused: false, awaiting: 'learner', hasTutorTurn: true, createdAt: 1, updatedAt: 1 }
const problem = { id: 'p1', statement: 'Mostra che $|\\sin a - \\sin b| \\le |a-b|$.', mode: 'recall' as const, targets: ['n_r'] }
const open: PracticeState = {
  ...base,
  items: [{ kind: 'learner', submission: { kind: 'start' }, text: 'MATERIALE…' }, { kind: 'tutor', turn: { phase: 'warmup', blocks: [{ type: 'text', md: 'Si parte.' }], problem } }],
  problems: [{ ...problem, status: 'active', phase: 'warmup', hints: 0, maxRung: null, attempts: 0 }],
  active: 'p1'
}

describe('PracticeView — training', () => {
  it('shows the problem in the dock and sends hints and reasoning', async () => {
    const { a } = api(open)
    render(<PracticeView id={ID} onBack={vi.fn()} onStarted={vi.fn()} />)
    const dock = await screen.findByRole('region', { name: 'Problema' })
    expect(within(dock).getByText(/Mostra che/)).toBeTruthy()
    await act(async () => fireEvent.click(within(dock).getByRole('button', { name: 'Dammi un indizio' })))
    expect(a.practice.submit).toHaveBeenCalledWith(ID, { kind: 'hint' })
    fireEvent.change(within(dock).getByLabelText('Il tuo ragionamento'), { target: { value: 'valor medio' } })
    await act(async () => fireEvent.click(within(dock).getByRole('button', { name: 'Invia' })))
    expect(a.practice.submit).toHaveBeenLastCalledWith(ID, { kind: 'thinking', text: 'valor medio' })
  })
  it('lets Andrea pick the wrong line in a spot-the-error problem', async () => {
    const lines = ['$f$ continua', '$f(-1)=f(1)$', 'per Rolle esiste $c$']
    const { a } = api({ ...open, problems: [{ ...open.problems[0], lines }] })
    render(<PracticeView id={ID} onBack={vi.fn()} onStarted={vi.fn()} />)
    const dock = await screen.findByRole('region', { name: 'Problema' })
    fireEvent.click(within(dock).getByRole('button', { name: /^3/ }))
    await act(async () => fireEvent.click(within(dock).getByRole('button', { name: 'Invia' })))
    expect(a.practice.submit).toHaveBeenCalledWith(ID, { kind: 'thinking', line: 2 })
  })
  it('shows the conclusion with the reference solution, then the pause', async () => {
    const done: PracticeState = {
      ...open,
      items: [...open.items, { kind: 'tutor', turn: { phase: 'warmup', blocks: [{ type: 'text', md: 'Corretto.' }], conclude: { outcome: 'solved_hints', verdict: 'Con un indizio.', retest: true } } }],
      problems: [{ ...open.problems[0], status: 'done', hints: 1, maxRung: 1, outcome: 'solved_hints', verdict: 'Con un indizio.', retest: true, modelSolution: 'Per il valor medio…' }],
      active: undefined,
      paused: true
    }
    const { a } = api(done)
    render(<PracticeView id={ID} onBack={vi.fn()} onStarted={vi.fn()} />)
    const card = await screen.findByRole('article', { name: 'Problema concluso' })
    expect(within(card).getByText('Risolto con aiuti')).toBeTruthy()
    expect(within(card).getByText('Per il valor medio…')).toBeTruthy()
    expect(within(card).getByText('Modo: richiamo · aiuto massimo: R1')).toBeTruthy()
    expect(within(screen.getByRole('complementary', { name: 'Andamento della sessione' })).getByText('in coda')).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Prossimo problema' })))
    expect(a.practice.submit).toHaveBeenCalledWith(ID, { kind: 'next' })
  })
  it('offers Riprova after an error', async () => {
    const { a } = api({ ...open, items: [...open.items, { kind: 'error', message: 'Il tutor non ha risposto.' }], awaiting: 'retry' })
    render(<PracticeView id={ID} onBack={vi.fn()} onStarted={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Riprova' }))
    expect(a.practice.retry).toHaveBeenCalledWith(ID)
  })
  it('reads the photo of the sheet and lets Andrea correct it before sending', async () => {
    const { a } = api(open)
    render(<PracticeView id={ID} onBack={vi.fn()} onStarted={vi.fn()} />)
    const dock = await screen.findByRole('region', { name: 'Problema' })
    fireEvent.click(within(dock).getByRole('button', { name: 'Foto del foglio' }))
    const dlg = screen.getByRole('dialog', { name: 'Foto del foglio' })
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 1])], 'foglio.jpg', { type: 'image/jpeg' })
    await act(async () => fireEvent.change(within(dlg).getByLabelText('Scegli un’immagine…'), { target: { files: [file] } }))
    const read = await within(dlg).findByLabelText('Letto dal foglio — controlla e correggi')
    expect(a.practice.photo).toHaveBeenCalledWith(ID, new Uint8Array([0xff, 0xd8, 0xff, 1]))
    fireEvent.change(read, { target: { value: '$|\\cos c| \\le 1$ quindi' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Usa questo testo' }))
    await act(async () => fireEvent.click(within(dock).getByRole('button', { name: 'Invia' })))
    expect(a.practice.submit).toHaveBeenCalledWith(ID, { kind: 'thinking', photoText: '$|\\cos c| \\le 1$ quindi' })
  })
})

describe('PracticeView — exam', () => {
  const sheet = { title: 'Prova', problems: [{ id: 'e1', statement: 'Calcola il limite.', points: 12, targets: [] }, { id: 'e2', statement: 'Dimostra Rolle.', points: 18, targets: ['n_r'] }] }
  const exam = (endsAt: number, extra: Partial<NonNullable<PracticeState['exam']>> = {}): PracticeState => ({ ...base, mode: 'exam', durationMin: 30, exam: { sheet, endsAt, answers: {}, delivered: false, ...extra } })
  it('runs the clock, saves drafts and delivers on confirmation', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { a } = api(exam(Date.now() + 30 * 60_000 + 1_500))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<PracticeView id={ID} onBack={vi.fn()} onStarted={vi.fn()} />)
    expect(await screen.findByRole('timer')).toBeTruthy()
    expect(screen.getByRole('timer').textContent).toMatch(/^(30:00|29:5\d)$/)
    expect(screen.queryByRole('button', { name: 'Dammi un indizio' })).toBeNull()
    fireEvent.change(screen.getByLabelText('Risposta all’esercizio 1'), { target: { value: 'vale 1' } })
    await act(async () => void vi.advanceTimersByTime(10_500))
    expect(a.practice.examSave).toHaveBeenCalledWith(ID, { e1: 'vale 1' })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Consegna' })))
    expect(a.practice.examDeliver).toHaveBeenCalledWith(ID, { e1: 'vale 1' })
  })
  it('delivers by itself, once, when the time is over', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { a } = api(exam(Date.now() + 2_000))
    render(<PracticeView id={ID} onBack={vi.fn()} onStarted={vi.fn()} />)
    fireEvent.change(await screen.findByLabelText('Risposta all’esercizio 2'), { target: { value: 'Weierstrass' } })
    await act(async () => void vi.advanceTimersByTime(5_000))
    expect(a.practice.examDeliver).toHaveBeenCalledTimes(1)
    expect(a.practice.examDeliver).toHaveBeenCalledWith(ID, { e2: 'Weierstrass' })
  })
  it('shows the grade in thirtieths with points, comments and solutions, and retests the misses', async () => {
    const graded = exam(0, {
      delivered: true,
      answers: { e1: '1', e2: 'boh' },
      sheet: { title: 'Prova', problems: [{ ...sheet.problems[0], modelSolution: 'Vale 1.' }, { ...sheet.problems[1], modelSolution: 'Weierstrass e Fermat.' }] },
      grade: { items: [{ id: 'e1', points: 12, comment: 'Giusto.' }, { id: 'e2', points: 9, comment: 'Manca la derivabilità.' }], note: 'Riprendi Rolle.', total: 21, lode: false }
    })
    const { a } = api({ ...graded, phase: 'done' })
    const onStarted = vi.fn()
    render(<PracticeView id={ID} onBack={vi.fn()} onStarted={onStarted} />)
    expect(await screen.findByText('21/30')).toBeTruthy()
    expect(screen.getByText('9 / 18')).toBeTruthy()
    expect(screen.getByText('Weierstrass e Fermat.')).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Ritesta gli errori in allenamento' })))
    expect(a.practice.create).toHaveBeenCalledWith({ conceptIds: ['n_r'], sourceIds: [], free: '' })
    expect(onStarted).toHaveBeenCalledWith(ID)
  })
})

describe('PracticeView — exam on paper', () => {
  const sheet = { title: 'Prova', problems: [{ id: 'e1', statement: 'Calcola il limite.', points: 12, targets: [] }, { id: 'e2', statement: 'Dimostra Rolle.', points: 18, targets: ['n_r'] }] }
  const solved = { title: 'Prova', problems: [{ ...sheet.problems[0], modelSolution: 'Vale 1.' }, { ...sheet.problems[1], modelSolution: 'Weierstrass e Fermat.' }] }
  const paper = (extra: Partial<NonNullable<PracticeState['exam']>> = {}, endsAt = Date.now() + 30 * 60_000): PracticeState => ({ ...base, mode: 'exam', paper: true, durationMin: 30, exam: { sheet, endsAt, answers: {}, delivered: false, ...extra } })
  it('shows only the sheet and the clock, and puts the pens down by itself when the time is over', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { a } = api(paper({}, Date.now() + 2_000))
    render(<PracticeView id={ID} onBack={vi.fn()} onStarted={vi.fn()} />)
    expect(await screen.findByRole('timer')).toBeTruthy()
    expect(screen.getByText('Dimostra Rolle.')).toBeTruthy()
    expect(screen.queryByLabelText('Risposta all’esercizio 1')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Foto del foglio' })).toBeNull()
    await act(async () => void vi.advanceTimersByTime(5_000))
    expect(a.practice.examHand).toHaveBeenCalledTimes(1)
    expect(a.practice.examDeliver).not.toHaveBeenCalled()
  })
  it('asks for the self-grade before the answer, and sends to the grader only when every problem has one', async () => {
    const { a, push } = api(paper({ handed: true, self: {}, sheet: solved }))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<PracticeView id={ID} onBack={vi.fn()} onStarted={vi.fn()} />)
    expect(await screen.findByText('Weierstrass e Fermat.')).toBeTruthy()
    expect(screen.queryByRole('timer')).toBeNull()
    expect(screen.queryByLabelText('Risposta all’esercizio 1')).toBeNull()
    expect((screen.getByRole('button', { name: 'Correggi' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Il tuo voto all’esercizio 1'), { target: { value: '13' } })
    expect((screen.getAllByRole('button', { name: 'Conferma il mio voto' })[0] as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Il tuo voto all’esercizio 1'), { target: { value: '10,5' } })
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Conferma il mio voto' })[0]))
    expect(a.practice.examSelf).toHaveBeenCalledWith(ID, 'e1', 10.5)
    push(paper({ handed: true, self: { e1: 10.5, e2: 18 }, sheet: solved }))
    expect(screen.getByText('10,5 / 12')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Risposta all’esercizio 1'), { target: { value: 'vale 1' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Correggi' })))
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Un esercizio è senza risposta'))
    expect(a.practice.examDeliver).toHaveBeenCalledWith(ID, { e1: 'vale 1' })
  })
  it('shows both grades and the calibration, now and over time', async () => {
    const graded: PracticeState = {
      ...paper({
        handed: true,
        delivered: true,
        self: { e1: 12, e2: 16 },
        answers: { e1: '1', e2: 'boh' },
        sheet: solved,
        grade: { items: [{ id: 'e1', points: 12, comment: 'Giusto.', self: 12 }, { id: 'e2', points: 9, comment: 'Manca la derivabilità.', self: 16 }], note: 'Riprendi Rolle.', total: 21, lode: false }
      }),
      phase: 'done'
    }
    const { a } = api(graded)
    a.practice.calibration.mockResolvedValue([
      { id: 'old', topic: 'Limiti', at: Date.UTC(2026, 10, 1), items: [{ id: 'e1', max: 15, self: 15, ai: 10 }, { id: 'e2', max: 15, self: 10, ai: 10 }] },
      { id: ID, topic: 'Rolle', at: Date.UTC(2026, 10, 8), items: [{ id: 'e1', max: 12, self: 12, ai: 12 }, { id: 'e2', max: 18, self: 16, ai: 9 }] }
    ])
    render(<PracticeView id={ID} onBack={vi.fn()} onStarted={vi.fn()} />)
    const panel = await screen.findByRole('region', { name: 'Calibrazione' })
    expect(within(panel).getByText('28/30')).toBeTruthy()
    expect(within(panel).getByText('Ti sei sopravvalutato di 3,5 punti in media a esercizio.')).toBeTruthy()
    expect(screen.getByText('tu 16')).toBeTruthy()
    expect(await within(panel).findByText('Limiti')).toBeTruthy()
    expect(within(panel).getByText('25 → 20')).toBeTruthy()
    expect(within(panel).getByText('Su 2 simulazioni a carta — Ti sei sopravvalutato di 3 punti in media a esercizio.')).toBeTruthy()
  })
})

describe('arc previews', () => {
  it('turn LaTeX into readable text', async () => {
    const { snippet } = await import('../../src/renderer/src/practice/exam-format')
    expect(snippet('Mostra che $|\\sin a - \\sin b| \\le |a-b|$.')).toBe('Mostra che |sin a - sin b| ≤ |a-b|.')
  })
})
