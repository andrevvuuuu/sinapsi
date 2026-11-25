// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExerciseSchema, type ChainExercise } from '../../src/shared/exercise-schema'
import { ExerciseView } from '../../src/renderer/src/review/ExerciseView'
import { ReviewView } from '../../src/renderer/src/review/ReviewView'
import { gradeChainIdeaUnits, type ReviewItem } from '../../src/main/memory/review'
import { settingsSchema } from '../../src/shared/settings-schema'

afterEach(cleanup)

const ex: ChainExercise = {
  type: 'chain',
  chainId: 'ch_rolle',
  premises: [
    { id: 'p1', name: 'Weierstrass', statement: '$f$ continua ha massimo.' },
    { id: 'p2', name: 'Fermat', statement: 'Estremo interno annulla la derivata.' }
  ],
  conclusion: { id: 'c1', name: 'Rolle', statement: 'Esiste $c$ con $f\'(c)=0$.' },
  prompt: 'Perché Weierstrass e Fermat implicano Rolle?',
  question: 'Perché Weierstrass e Fermat implicano Rolle?',
  answer: 'Uso Weierstrass, poi Fermat.',
  ideaUnits: [
    'Applico Weierstrass per trovare punto di massimo o minimo in $[a,b]$',
    'Se è interno, applico Fermat per ottenere derivata nulla',
    'Se entrambi gli estremi sono sul bordo, la funzione è costante'
  ]
}

describe('gradeChainIdeaUnits', () => {
  it('tutte le unità → 3', () => {
    expect(gradeChainIdeaUnits([true])).toBe(3)
    expect(gradeChainIdeaUnits([true, true, true])).toBe(3)
  })

  it('parziale → 1', () => {
    expect(gradeChainIdeaUnits([true, false])).toBe(1)
    expect(gradeChainIdeaUnits([true, true, false])).toBe(1)
    expect(gradeChainIdeaUnits([false, true, false])).toBe(1)
  })

  it('nessuna → 1', () => {
    expect(gradeChainIdeaUnits([false])).toBe(1)
    expect(gradeChainIdeaUnits([false, false, false])).toBe(1)
    expect(gradeChainIdeaUnits([])).toBe(1)
  })
})

describe('chain exercise schema', () => {
  it('accepts deterministic premise idea units', () => {
    expect(
      ExerciseSchema.parse({
        type: 'chain',
        chainId: 'ch',
        premises: [{ id: 'p', name: 'P', statement: 'P è vero' }],
        conclusion: { id: 'c', name: 'C', statement: 'C è vero' },
        prompt: 'Perché da P segue C?',
        answer: 'Uso P',
        question: 'Perché da P segue C?',
        ideaUnits: ['Uso P']
      }).type
    ).toBe('chain')
  })
})

describe('chain exercise in ExerciseView', () => {
  it('renders premises and conclusion with KaTeX markup', () => {
    render(React.createElement(ExerciseView, { exercise: ex, locked: false, onChange: vi.fn() }))
    expect(screen.getByText('Premesse')).toBeTruthy()
    expect(screen.getByText('Weierstrass')).toBeTruthy()
    expect(screen.getByText('Fermat')).toBeTruthy()
    expect(screen.getByText('Conclusione')).toBeTruthy()
    expect(screen.getByText('Rolle')).toBeTruthy()
  })

  it('requires committing an answer before revealing checklist and allows ticking', () => {
    const onRecord = vi.fn()
    const onSkip = vi.fn()
    render(
      React.createElement(ExerciseView, {
        exercise: ex,
        locked: false,
        onChange: vi.fn(),
        onRecordChain: onRecord,
        onSkipChain: onSkip
      })
    )
    const commitBtn = screen.getByRole('button', { name: 'Conferma risposta' }) as HTMLButtonElement
    expect(commitBtn.disabled).toBe(true)

    const textarea = screen.getByPlaceholderText(/Perché le premesse/)
    fireEvent.change(textarea, { target: { value: 'La mia dimostrazione' } })
    expect(commitBtn.disabled).toBe(false)
    fireEvent.click(commitBtn)

    expect(screen.getByText('La tua risposta confermata')).toBeTruthy()
    expect(screen.getByText('La mia dimostrazione')).toBeTruthy()
    expect(screen.getByText(/Voto massimo: 3/)).toBeTruthy()

    // Checklist of 3 units
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(checkboxes).toHaveLength(3)
    expect(checkboxes[0].checked).toBe(false)

    fireEvent.click(checkboxes[0])
    expect(checkboxes[0].checked).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Registra' }))
    expect(onRecord).toHaveBeenCalledWith([true, false, false])
  })

  it('supports skipping without recording', () => {
    const onSkip = vi.fn()
    render(
      React.createElement(ExerciseView, {
        exercise: ex,
        locked: false,
        onChange: vi.fn(),
        onSkipChain: onSkip
      })
    )
    fireEvent.change(screen.getByPlaceholderText(/Perché le premesse/), { target: { value: 'test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Conferma risposta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salta senza registrare' }))
    expect(onSkip).toHaveBeenCalled()
  })
})

describe('chain exercise in ReviewView', () => {
  const item: ReviewItem = {
    conceptId: 'c1',
    name: 'Teorema di Rolle',
    notePath: '/v/Rolle.md',
    noteTitle: 'Teorema di Rolle',
    subject: 'matematica',
    R: 0.5,
    variantId: null,
    exercise: ex
  }

  it('records chain exercise with checked booleans and advances to summary', async () => {
    const settings = settingsSchema('/x').parse({})
    const api = {
      review: {
        plan: vi.fn(async () => ({ items: [item], due: 1 })),
        record: vi.fn(async () => ({ memory: { conceptId: 'c1', R: 0.9, state: 'la sai' }, intervals: {} })),
        intervals: vi.fn(async () => ({ 1: '10m', 2: '1d', 3: '4d', 4: '11d' })),
        memory: vi.fn(async () => ({}))
      },
      settings: { get: vi.fn(async () => settings), set: vi.fn(async (p: object) => ({ ...settings, ...p })) }
    }
    window.sinapsi = api as never
    render(React.createElement(ReviewView, { onBack: vi.fn(), onStudy: vi.fn(), onOpenNote: vi.fn() }))
    fireEvent.click(await screen.findByRole('button', { name: 'Inizia ripasso' }))

    // Standard buttons are hidden for chain
    expect(screen.queryByRole('button', { name: 'Verifica' })).toBeNull()
    expect(screen.queryByLabelText('Quanto sei sicuro?')).toBeNull()

    fireEvent.change(screen.getByPlaceholderText(/Perché le premesse/), { target: { value: 'Perché Weierstrass dà max/min...' } })
    fireEvent.click(screen.getByRole('button', { name: 'Conferma risposta' }))

    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    fireEvent.click(checkboxes[1])

    fireEvent.click(screen.getByRole('button', { name: 'Registra' }))
    await vi.waitFor(() => {
      expect(api.review.record).toHaveBeenCalledWith({
        conceptId: 'c1',
        at: expect.any(Number),
        type: 'chain',
        checked: [true, true, false]
      })
    })

    // Shows summary
    expect(await screen.findByRole('heading', { name: /nitido/ })).toBeTruthy()
    expect(screen.getAllByText('Teorema di Rolle').length).toBeGreaterThan(0)
  })

  it('skipping chain exercise calls record with record:false and does not mark as miss in summary', async () => {
    const settings = settingsSchema('/x').parse({})
    const api = {
      review: {
        plan: vi.fn(async () => ({ items: [item], due: 1 })),
        record: vi.fn(async () => null),
        intervals: vi.fn(async () => ({ 1: '10m', 2: '1d', 3: '4d', 4: '11d' })),
        memory: vi.fn(async () => ({}))
      },
      settings: { get: vi.fn(async () => settings), set: vi.fn(async (p: object) => ({ ...settings, ...p })) }
    }
    window.sinapsi = api as never
    render(React.createElement(ReviewView, { onBack: vi.fn(), onStudy: vi.fn(), onOpenNote: vi.fn() }))
    fireEvent.click(await screen.findByRole('button', { name: 'Inizia ripasso' }))

    fireEvent.change(screen.getByPlaceholderText(/Perché le premesse/), { target: { value: 'Non sono sicuro' } })
    fireEvent.click(screen.getByRole('button', { name: 'Conferma risposta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salta senza registrare' }))

    await vi.waitFor(() => {
      expect(api.review.record).toHaveBeenCalledWith({
        conceptId: 'c1',
        at: expect.any(Number),
        type: 'chain',
        record: false
      })
    })

    // Reaches summary, but does NOT count as a miss!
    expect(await screen.findByRole('heading', { name: /nitido/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Rifai subito gli errori' })).toBeNull()
  })
})
