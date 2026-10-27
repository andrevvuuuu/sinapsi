// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExerciseView, type ExerciseState } from '../../src/renderer/src/review/ExerciseView'
import type { Exercise } from '../../src/shared/exercise-schema'

afterEach(cleanup)
function mount(exercise: Exercise, locked = false) {
  const onChange = vi.fn<(s: ExerciseState) => void>()
  const r = render(<ExerciseView exercise={exercise} locked={locked} onChange={onChange} />)
  const last = (): ExerciseState => onChange.mock.calls.at(-1)![0]
  return { onChange, last, ...r }
}

describe('choice exercises', () => {
  const mc: Exercise = { type: 'mc', prompt: 'Quale?', options: ['Continuità', 'Monotonia'], correct: 0, answer: 'La continuità.' }
  it('a right pick is correct, a wrong one is not', () => {
    const { last } = mount(mc)
    fireEvent.click(screen.getByRole('button', { name: /Monotonia/ }))
    expect(last()).toMatchObject({ correct: false, ready: true, answer: 'Monotonia' })
    fireEvent.click(screen.getByRole('button', { name: /Continuità/ }))
    expect(last()).toMatchObject({ correct: true, ready: true })
  })
  it('marks the right option once locked', () => {
    mount(mc, true)
    expect(screen.getByRole('button', { name: /Continuità/ }).getAttribute('data-state')).toBe('ok')
  })
  it('true or false with a reason', () => {
    const { last } = mount({ type: 'truefalse', prompt: 'Vero o falso?', statement: 'Rolle dà un solo punto.', value: false, answer: 'Falso.' })
    expect(screen.getByText('Rolle dà un solo punto.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Falso' }))
    fireEvent.change(screen.getByLabelText('Perché?'), { target: { value: 'possono essere tanti' } })
    expect(last()).toMatchObject({ correct: true, ready: true })
    expect(last().answer).toContain('possono essere tanti')
  })
})

describe('order', () => {
  it('starts shuffled and becomes correct when the steps are put in order', () => {
    const steps = ['Weierstrass', 'Fermat', 'Conclusione', 'Verifica']
    const { last } = mount({ type: 'order', prompt: 'Riordina', steps, answer: 'Così.' })
    const shown = (): string[] => screen.getAllByRole('listitem').map((li) => li.querySelector('.txt')!.textContent!)
    expect(shown()).not.toEqual(steps)
    for (let i = 0; i < steps.length; i++)
      while (shown().indexOf(steps[i]) > i) fireEvent.click(screen.getByRole('button', { name: `Sposta su: ${steps[i]}` }))
    expect(shown()).toEqual(steps)
    expect(last()).toMatchObject({ correct: true, ready: true })
  })
})

describe('fill, match, estimate, spot the error', () => {
  it('fill is correct when every blank is right', () => {
    const { last } = mount({ type: 'fill', prompt: 'Completa', text: 'Continua su {{(a,b)|*[a,b]}} e derivabile su {{*(a,b)|[a,b]}}.', answer: 'x' })
    const pick = (box: number, k: number): void => {
      fireEvent.click(screen.getAllByRole('combobox')[box])
      fireEvent.click(screen.getAllByRole('option')[k])
    }
    pick(0, 1)
    expect(last().ready).toBe(false)
    pick(1, 1)
    expect(last()).toMatchObject({ correct: false, ready: true })
    pick(1, 0)
    expect(last()).toMatchObject({ correct: true })
  })
  it('match is correct when every pair is right', () => {
    const { last } = mount({ type: 'match', prompt: 'Abbina', pairs: [['Weierstrass', 'max e min'], ['Fermat', 'derivata nulla']], answer: 'x' })
    fireEvent.click(screen.getByRole('combobox', { name: 'Weierstrass' }))
    fireEvent.click(screen.getByRole('option', { name: 'max e min' }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Fermat' }))
    fireEvent.click(screen.getByRole('option', { name: 'derivata nulla' }))
    expect(last()).toMatchObject({ correct: true, ready: true })
  })
  it('estimate accepts a decimal comma within the tolerance', () => {
    const { last } = mount({ type: 'estimate', prompt: 'Quanto?', value: 3, tolerance: 0.1, answer: '3' })
    fireEvent.change(screen.getByLabelText('Il tuo valore'), { target: { value: '3,05' } })
    expect(last()).toMatchObject({ correct: true, ready: true })
    fireEvent.change(screen.getByLabelText('Il tuo valore'), { target: { value: '3,5' } })
    expect(last()).toMatchObject({ correct: false })
  })
  it('spot the error is correct on the wrong step', () => {
    const { last } = mount({ type: 'spoterror', prompt: 'Trova', steps: ['g(a)=0', 'g(b)=1', 'Rolle'], wrong: 1, why: 'g(b)=0', answer: 'x' })
    fireEvent.click(screen.getByRole('button', { name: /g\(b\)=1/ }))
    expect(last()).toMatchObject({ correct: true, ready: true })
  })
})

describe('graph and open', () => {
  it('graph is correct when the chosen point meets the target', () => {
    const { last } = mount({
      type: 'graph',
      prompt: 'Tangente orizzontale',
      figure: { type: 'figure', title: 'Fig', x: [-2, 2], y: [-1, 3], functions: { f: 'x^2' }, params: [{ id: 'p', label: 'Punto', min: -1.5, max: 1.5, step: 0.05, value: -1 }], elements: [{ kind: 'curve', fn: 'f' }, { kind: 'point', x: 'p', y: 'f(p)', drag: 'p' }] },
      param: 'p',
      target: "f'(p)",
      answer: 'In 0.'
    })
    fireEvent.change(screen.getByRole('slider', { name: 'Punto' }), { target: { value: '0.5' } })
    expect(last()).toMatchObject({ correct: false, ready: true })
    fireEvent.change(screen.getByRole('slider', { name: 'Punto' }), { target: { value: '0' } })
    expect(last()).toMatchObject({ correct: true })
  })
  it('open answers are graded by the AI', () => {
    const { last } = mount({ type: 'open', prompt: 'Che cosa?', answer: 'x' })
    fireEvent.change(screen.getByLabelText('La tua risposta, ragionando ad alta voce'), { target: { value: 'la mia idea' } })
    expect(last()).toEqual({ answer: 'la mia idea', correct: null, ready: true })
  })
})

describe('locked', () => {
  it('disables input after the answer is checked', () => {
    mount({ type: 'spoterror', prompt: 'Trova', steps: ['a', 'b', 'c'], wrong: 2, why: 'w', answer: 'x' }, true)
    for (const b of within(screen.getByRole('group', { name: 'Passi' })).getAllByRole('button')) expect((b as HTMLButtonElement).disabled).toBe(true)
  })
})
