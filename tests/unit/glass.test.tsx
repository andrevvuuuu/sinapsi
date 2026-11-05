// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GlassFilter } from '../../src/renderer/src/components/GlassFilter'

/** window.sinapsi.ui as the preload exposes it; `emit` plays macOS changing the setting. */
function mockUi(reduced: boolean): { emit: (v: boolean) => void; unsubscribe: ReturnType<typeof vi.fn> } {
  const listeners = new Set<(v: boolean) => void>()
  const unsubscribe = vi.fn()
  Object.assign(window, {
    sinapsi: {
      ui: {
        reducedTransparency: vi.fn(async () => reduced),
        onReducedTransparency: (cb: (v: boolean) => void) => {
          listeners.add(cb)
          return () => {
            unsubscribe()
            listeners.delete(cb)
          }
        }
      }
    }
  })
  return { emit: (v) => listeners.forEach((cb) => cb(v)), unsubscribe }
}

afterEach(() => {
  cleanup()
  delete document.documentElement.dataset.glass
})

describe('Liquid Glass material', () => {
  it('sets data-glass="solid" when macOS reduces transparency', async () => {
    mockUi(true)
    await act(async () => {
      render(<GlassFilter />)
    })
    expect(document.documentElement.dataset.glass).toBe('solid')
  })

  it('keeps the glass on when macOS does not reduce transparency', async () => {
    mockUi(false)
    await act(async () => {
      render(<GlassFilter />)
    })
    expect(document.documentElement.dataset.glass).toBe('on')
  })

  it('switches live when the setting changes', async () => {
    const ui = mockUi(false)
    let view!: ReturnType<typeof render>
    await act(async () => {
      view = render(<GlassFilter />)
    })
    expect(document.documentElement.dataset.glass).toBe('on')
    act(() => ui.emit(true))
    expect(document.documentElement.dataset.glass).toBe('solid')
    act(() => ui.emit(false))
    expect(document.documentElement.dataset.glass).toBe('on')
    view.unmount()
    expect(ui.unsubscribe).toHaveBeenCalled()
  })

  it('mounts the refraction filter once', async () => {
    mockUi(false)
    await act(async () => {
      render(
        <StrictMode>
          <GlassFilter />
        </StrictMode>
      )
    })
    const filters = document.querySelectorAll('filter#glass-refract')
    expect(filters).toHaveLength(1)
    expect(filters[0].querySelector('feTurbulence')).not.toBeNull()
    expect(filters[0].querySelector('feDisplacementMap')).not.toBeNull()
    // The SVG only carries the filter: it takes no space and is hidden from assistive tech.
    const svg = filters[0].closest('svg')!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
  })
})
