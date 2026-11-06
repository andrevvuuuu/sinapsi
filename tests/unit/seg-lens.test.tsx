// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SegLens } from '../../src/renderer/src/components/SegLens'

// jsdom has no layout: each button reports the box written in its data-box attribute.
const box = (el: HTMLElement, i: number): number => Number((el.dataset.box ?? '0,0,0,0').split(',')[i])
const observers: (() => void)[] = []

beforeEach(() => {
  for (const [prop, i] of [['offsetLeft', 0], ['offsetTop', 1], ['offsetWidth', 2], ['offsetHeight', 3]] as const)
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get(this: HTMLElement) { return box(this, i) } })
  Object.assign(globalThis, {
    ResizeObserver: class {
      cb: () => void
      constructor(cb: () => void) {
        this.cb = cb
        observers.push(() => this.cb())
      }
      observe(): void {}
      disconnect(): void {}
    }
  })
})

afterEach(() => {
  cleanup()
  observers.length = 0
})

function Seg(): React.JSX.Element {
  const [v, setV] = useState('a')
  return (
    <div className="seg seg-track" role="group" aria-label="Prova">
      {(['a', 'b', 'c'] as const).map((k, i) => (
        <button key={k} type="button" data-box={`${3 + i * 80},3,78,38`} aria-pressed={v === k} onClick={() => setV(k)}>
          {k}
        </button>
      ))}
      <SegLens />
    </div>
  )
}

const lens = (): HTMLElement => document.querySelector<HTMLElement>('.seg-lens')!

describe('segmented control lens', () => {
  it('sits on the pressed option and is hidden from assistive tech', () => {
    render(<Seg />)
    expect(lens().style.transform).toBe('translate(3px, 3px)')
    expect(lens().style.width).toBe('78px')
    expect(lens().style.height).toBe('38px')
    expect(lens().getAttribute('aria-hidden')).toBe('true')
  })

  it('moves to the option clicked, which stays the pressed one', async () => {
    render(<Seg />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'c' }))
    })
    expect(screen.getByRole('button', { name: 'c' }).getAttribute('aria-pressed')).toBe('true')
    expect(lens().style.transform).toBe('translate(163px, 3px)')
  })

  it('jumps to its first visible place when the track mounts hidden, without sliding from nothing', () => {
    // Hidden at mount (no layout), the lens has not been placed yet…
    const hidden = render(
      <div className="seg-track">
        <button type="button" data-box="0,0,0,0" aria-pressed="true">x</button>
        <SegLens />
      </div>
    )
    const l = hidden.container.querySelector<HTMLElement>('.seg-lens')!
    expect(l.style.width).toBe('')
    // …and once shown it is placed with its transition off for that frame, then back on.
    const set: string[] = []
    Object.defineProperty(l.style, 'transition', {
      configurable: true,
      get: () => set[set.length - 1] ?? '',
      set: (v: string) => void set.push(v)
    })
    hidden.container.querySelector<HTMLElement>('button')!.dataset.box = '3,3,78,38'
    act(() => observers.forEach((o) => o()))
    expect(l.style.width).toBe('78px')
    expect(l.style.transform).toBe('translate(3px, 3px)')
    expect(set).toEqual(['none', ''])
  })

  it('stays aligned when the buttons resize', async () => {
    render(<Seg />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'b' }))
    })
    const b = screen.getByRole('button', { name: 'b' })
    b.dataset.box = '90,3,100,44'
    act(() => observers.forEach((o) => o()))
    expect(lens().style.transform).toBe('translate(90px, 3px)')
    expect(lens().style.width).toBe('100px')
    expect(lens().style.height).toBe('44px')
  })
})
