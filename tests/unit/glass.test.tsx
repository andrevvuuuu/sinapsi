// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GlassSceneProps } from '@glass-sdk/liquid-glass'
import { GlassMaterial, ViewScene } from '../../src/renderer/src/components/glass'

// The library's scene, recorded: the props the app gives it, and its onDiagnostic to play a GPU failure.
const scenes = vi.hoisted(() => [] as GlassSceneProps[])
vi.mock('@glass-sdk/liquid-glass', async (original) => {
  const lib = await original<typeof import('@glass-sdk/liquid-glass')>()
  return { ...lib, GlassScene: (p: GlassSceneProps) => (scenes.push(p), lib.GlassScene(p)) }
})

/** window.sinapsi.ui as the preload exposes it; `emit` plays macOS changing the setting. */
function mockUi(reduced: boolean | Promise<boolean>): { emit: (v: boolean) => void; unsubscribe: ReturnType<typeof vi.fn> } {
  const listeners = new Set<(v: boolean) => void>()
  const unsubscribe = vi.fn()
  Object.assign(window, {
    sinapsi: {
      ui: {
        reducedTransparency: vi.fn(() => Promise.resolve(reduced)),
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
  document.documentElement.dataset.theme = 'lavagna'
  scenes.length = 0
})

describe('Riduci trasparenza', () => {
  it('sets data-glass="solid" when macOS reduces transparency', async () => {
    mockUi(true)
    await act(async () => {
      render(<GlassMaterial />)
    })
    expect(document.documentElement.dataset.glass).toBe('solid')
  })

  it('keeps the glass on when macOS does not reduce transparency', async () => {
    mockUi(false)
    await act(async () => {
      render(<GlassMaterial />)
    })
    expect(document.documentElement.dataset.glass).toBe('on')
  })

  it('leaves the glass off until macOS has answered, so it never flashes', async () => {
    mockUi(new Promise<boolean>(() => {}))
    await act(async () => {
      render(<GlassMaterial />)
    })
    expect(document.documentElement.dataset.glass).toBeUndefined()
  })

  it('stays solid when the first answer fails', async () => {
    mockUi(Promise.reject(new Error('ipc')))
    await act(async () => {
      render(<GlassMaterial />)
    })
    expect(document.documentElement.dataset.glass).toBe('solid')
  })

  it('switches live when the setting changes', async () => {
    const ui = mockUi(false)
    let view!: ReturnType<typeof render>
    await act(async () => {
      view = render(<GlassMaterial />)
    })
    expect(document.documentElement.dataset.glass).toBe('on')
    act(() => ui.emit(true))
    expect(document.documentElement.dataset.glass).toBe('solid')
    act(() => ui.emit(false))
    expect(document.documentElement.dataset.glass).toBe('on')
    view.unmount()
    expect(ui.unsubscribe).toHaveBeenCalled()
  })

})

describe('the glass scene of a view', () => {
  it('uses the library\'s Regular material, its appearance following the theme live', async () => {
    document.documentElement.dataset.theme = 'lavagna'
    const { container } = render(<ViewScene className="sess">x</ViewScene>)
    const root = container.querySelector('.lg-scene.sess')
    expect(root).not.toBeNull()
    expect(scenes.at(-1)).toMatchObject({ material: 'regular', appearance: 'dark' })
    await act(async () => {
      document.documentElement.dataset.theme = 'trattato'
      await Promise.resolve()
    })
    expect(scenes.at(-1)).toMatchObject({ material: 'regular', appearance: 'light' })
  })

  it('logs a material that cannot be prepared once, and turns the scene\'s surfaces solid', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { container } = render(<ViewScene className="sess">x</ViewScene>)
    const root = container.querySelector('.lg-scene.sess')!
    act(() => scenes.at(-1)!.onDiagnostic!({ surfaces: 1, maps: 1, mapTime: 3 }))
    expect(root.hasAttribute('data-glass-failed')).toBe(false)
    act(() => scenes.at(-1)!.onDiagnostic!({ surfaces: 1, maps: 0, mapTime: 0, error: new Error('no WebGPU adapter') }))
    act(() => scenes.at(-1)!.onDiagnostic!({ surfaces: 1, maps: 0, mapTime: 0, error: new Error('no WebGPU adapter') }))
    expect(root.hasAttribute('data-glass-failed')).toBe(true)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain('no WebGPU adapter')
    warn.mockRestore()
  })
})
