// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BlockView } from '../../src/renderer/src/nota/BlockView'
import { FigureView } from '../../src/renderer/src/nota/figure/FigureView'
import { NotaView } from '../../src/renderer/src/nota/NotaView'
import { ExerciseView } from '../../src/renderer/src/review/ExerciseView'
import { parseNota } from '../../src/shared/nota-schema'

afterEach(cleanup)

describe('notes too long are trimmed, not rejected', () => {
  it('keeps the first 6 recap lines and 30 sections', () => {
    const section = (i: number) => ({ title: `S${i}`, blocks: [{ type: 'prose', md: 'x' }] })
    const r = parseNota({ title: 'T', tldr: ['1', '2', '3', '4', '5', '6', '7'], sections: Array.from({ length: 32 }, (_, i) => section(i)) })
    expect(r.nota.tldr).toHaveLength(6)
    expect(r.nota.sections).toHaveLength(30)
  })
})

describe('a tab whose blocks were all invalid', () => {
  it('says the content is not available', () => {
    render(<BlockView mode="leggi" block={{ type: 'tabs', tabs: [{ label: 'Esempio', blocks: [] }, { label: 'Altro', blocks: [{ type: 'prose', md: 'ciao' }] }] }} />)
    expect(screen.getByText('Contenuto non disponibile per questa scheda.')).toBeTruthy()
  })
})

describe('"Mostra i punti"', () => {
  const fig = {
    type: 'figure' as const,
    title: 'Fig',
    x: [-2, 2] as [number, number],
    y: [-1, 1] as [number, number],
    functions: { f: 'x^2 - 2', g: 'x + 5' },
    params: [{ id: 'c', label: 'Punto c', min: -2, max: 2, step: 0.1, value: 1 }],
    elements: [{ kind: 'curve' as const, fn: 'f' }],
    points: { label: 'Mostra i punti', param: 'c', expr: 'f(c)', at: 'g' }
  }
  it('names the real parameter and never draws a ring outside the plot', () => {
    const { container } = render(<FigureView fig={fig as never} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mostra i punti' }))
    expect(screen.getAllByRole('button', { name: /^c ≈/ }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /^x ≈/ })).toBeNull()
    // g(±√2) ≈ 6.4 is far above y ∈ [-1, 1]: no ring floating outside the plot.
    expect(container.querySelectorAll('circle.ring')).toHaveLength(0)
  })
})

describe('a damaged note file', () => {
  it('shows an explanation instead of a blank page', async () => {
    window.sinapsi = { notes: { get: vi.fn(async () => Promise.reject(new Error('Unexpected end of JSON input'))), onUpdate: () => () => undefined, retry: vi.fn() } } as never
    render(<NotaView id="n" onBack={vi.fn()} />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/non si riesce ad aprire/)
  })
})

describe('formulas in choices', () => {
  it('a "completa" choice shows LaTeX rendered', () => {
    const { container } = render(<BlockView mode="leggi" block={{ type: 'exercise', level: 'completa', title: 't', steps: ['Vale {{$\\frac{1}{2}$|*$e^x$}}.'] }} />)
    fireEvent.click(screen.getByRole('combobox'))
    expect(container.querySelectorAll('[role="option"] .katex').length).toBe(2)
    fireEvent.click(screen.getAllByRole('option')[1])
    expect(screen.getByText('Giusto')).toBeTruthy()
  })
  it('Ripasso fill and match options show LaTeX rendered', () => {
    const onChange = vi.fn()
    const { container } = render(<ExerciseView locked={false} onChange={onChange} exercise={{ type: 'match', prompt: 'Abbina', pairs: [['Rolle', "$f'(c)=0$"], ['Lagrange', '$\\frac{f(b)-f(a)}{b-a}$']], answer: 'x' }} />)
    fireEvent.click(screen.getAllByRole('combobox')[0])
    expect(container.querySelectorAll('[role="option"] .katex').length).toBe(2)
  })
})

describe('blanks with formulas', () => {
  it('reads choices containing braces and |x| inside formulas', async () => {
    const { blankSpans, ExerciseSchema } = await import('../../src/shared/exercise-schema')
    const spans = blankSpans('Vale {{$\\frac{1}{2}$|*$|x|$}} e poi {{a|*b}}.')
    expect(spans.map((s) => s.options)).toEqual([['$\\frac{1}{2}$', '$|x|$'], ['a', 'b']])
    expect(spans.map((s) => s.correct)).toEqual([1, 1])
    expect(ExerciseSchema.safeParse({ type: 'fill', prompt: 'p', text: 'Vale {{$\\frac{1}{2}$|*$e^{x}$}}.', answer: 'a' }).success).toBe(true)
  })
})
