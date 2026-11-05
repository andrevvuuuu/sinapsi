// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useScrollEdges } from '../../src/renderer/src/components/useScrollEdges'

afterEach(cleanup)

function Area(): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [n, setN] = useState(0)
  useScrollEdges(ref)
  return (
    <>
      <button type="button" onClick={() => setN((x) => x + 1)}>
        render
      </button>
      <div ref={ref} data-testid="area">
        {Array.from({ length: n + 1 }, (_, i) => (
          <p key={i}>{i}</p>
        ))}
      </div>
    </>
  )
}

/** jsdom has no layout: the area reports the scroll geometry given here. */
function geometry(el: HTMLElement, g: { top: number; height: number; client: number }): void {
  Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => g.top })
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => g.height })
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => g.client })
}

describe('scroll edges', () => {
  it('subscribes once however often the owner renders, and unsubscribes on unmount', () => {
    const add = vi.spyOn(HTMLElement.prototype, 'addEventListener')
    const remove = vi.spyOn(HTMLElement.prototype, 'removeEventListener')
    const { unmount, getByTestId } = render(<Area />)
    const el = getByTestId('area')
    // Only the area's own listeners (React listens for scroll on its root container too).
    const on = (m: typeof add): number =>
      m.mock.calls.filter(([t], i) => t === 'scroll' && m.mock.contexts[i] === el).length
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByRole('button', { name: 'render' }))
    expect(on(add)).toBe(1)
    expect(on(remove)).toBe(0)
    unmount()
    expect(on(remove)).toBe(1)
    add.mockRestore()
    remove.mockRestore()
  })

  it('re-checks the marks on each render and on scroll', () => {
    const { getByTestId } = render(<Area />)
    const el = getByTestId('area')
    const g = { top: 0, height: 100, client: 100 }
    geometry(el, g)
    fireEvent.click(screen.getByRole('button', { name: 'render' }))
    expect(el.hasAttribute('data-more-below')).toBe(false)
    g.height = 300
    fireEvent.click(screen.getByRole('button', { name: 'render' }))
    expect(el.hasAttribute('data-more-below')).toBe(true)
    expect(el.hasAttribute('data-more-above')).toBe(false)
    g.top = 200
    act(() => void el.dispatchEvent(new Event('scroll')))
    expect(el.hasAttribute('data-more-above')).toBe(true)
    expect(el.hasAttribute('data-more-below')).toBe(false)
  })
})
