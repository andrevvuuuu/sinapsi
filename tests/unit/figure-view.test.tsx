// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FigureView } from '../../src/renderer/src/nota/figure/FigureView'
import type { Figure } from '../../src/shared/nota-schema'

afterEach(cleanup)

const fig: Figure = {
  type: 'figure',
  title: 'Figura 1 · Tangente orizzontale',
  caption: 'Muovi il punto.',
  x: [-2, 2],
  y: [-1.5, 3],
  functions: { f: 'x^2 - 1' },
  params: [{ id: 'p', label: 'Punto c', min: -1.5, max: 1.5, step: 0.05, value: -1 }],
  elements: [
    { kind: 'curve', fn: 'f', color: 'accent' },
    { kind: 'line', x: 'p', y: 'f(p)', slope: "f'(p)", color: 'warn', greenWhen: "f'(p)" },
    { kind: 'point', x: 'p', y: 'f(p)', drag: 'p', label: 'c' }
  ],
  readouts: [{ label: "f'(c)", expr: "f'(p)" }],
  points: { label: 'Mostra i punti', param: 'p', expr: "f'(p)", at: 'f' }
}

describe('FigureView', () => {
  it('updates the readout when the slider moves', () => {
    render(<FigureView fig={fig} />)
    const out = screen.getByTestId('readout-0')
    expect(out.textContent).toContain('−2,00')
    fireEvent.change(screen.getByRole('slider', { name: /Punto c/ }), { target: { value: '0.5' } })
    expect(out.textContent).toContain('1,00')
  })
  it('moves the draggable point with the arrow keys', () => {
    render(<FigureView fig={fig} />)
    const pt = screen.getByRole('slider', { name: /Trascina c/ })
    expect(pt.getAttribute('aria-valuenow')).toBe('-1')
    fireEvent.keyDown(pt, { key: 'ArrowRight' })
    expect(Number(pt.getAttribute('aria-valuenow'))).toBeCloseTo(-0.95)
  })
  it('turns an element green when its condition holds', () => {
    render(<FigureView fig={{ ...fig, params: [{ ...fig.params[0], value: 0 }] }} />)
    const line = screen.getByTestId('el-1')
    expect(line.getAttribute('class')).toContain('good')
    expect(screen.getByRole('status').textContent).toContain('Diventa verde')
  })
  it('is not green away from the condition', () => {
    render(<FigureView fig={fig} />)
    expect(screen.getByTestId('el-1').getAttribute('class')).not.toContain('good')
  })
  it('shows the points and jumps the slider to one', () => {
    render(<FigureView fig={fig} />)
    const toggle = screen.getByRole('button', { name: 'Mostra i punti' })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    const list = screen.getByTestId('points')
    const btn = within(list).getByRole('button', { name: /p ≈ 0,00/ })
    fireEvent.click(btn)
    expect((screen.getByRole('slider', { name: /Punto c/ }) as HTMLInputElement).value).toBe('0')
  })
  it('does not draw a point that falls outside the view', () => {
    render(<FigureView fig={{ ...fig, elements: [fig.elements[0], { kind: 'point', x: '1', y: '5', label: 'B' }] }} />)
    expect(screen.queryByTestId('el-1')).toBeNull()
  })
  it('says so when there is no point in range', () => {
    render(<FigureView fig={{ ...fig, points: { ...fig.points!, expr: "f'(p) - 10" } }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mostra i punti' }))
    expect(screen.getByTestId('points').textContent).toContain('Nessun punto in questo intervallo')
  })
  it('hides elements outside the current proof step and applies step params', () => {
    const stepped: Figure = { ...fig, elements: [fig.elements[0], { ...fig.elements[2], steps: [1] }], stepParams: [{ p: -1 }, { p: 1 }] }
    const { rerender } = render(<FigureView fig={stepped} step={0} />)
    expect(screen.queryByTestId('el-1')).toBeNull()
    rerender(<FigureView fig={stepped} step={1} />)
    expect(screen.getByTestId('el-1')).toBeTruthy()
  })
})
