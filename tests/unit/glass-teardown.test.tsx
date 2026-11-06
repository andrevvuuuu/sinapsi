// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GlassContent, GlassSurface } from '@glass-sdk/liquid-glass'
import { GlassRange, ScrollEdges, Seg, ViewScene } from '../../src/renderer/src/components/glass'

/** Every observer of the render (the app's and the glass library's), and whether each one is still watching. */
const live = new Set<object>()
function tracked<T extends new (...a: never[]) => { observe: (...a: never[]) => void; disconnect: () => void }>(Base: T): T {
  return class extends Base {
    observe(...a: never[]): void {
      live.add(this)
      super.observe(...a)
    }
    disconnect(): void {
      live.delete(this)
      super.disconnect()
    }
  }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  live.clear()
})

function View(): React.JSX.Element {
  const page = useRef<HTMLDivElement>(null)
  return (
    <ViewScene className="sess">
      <GlassSurface radius={0} className="top">
        bar
      </GlassSurface>
      <ScrollEdges target={page} size={72} />
      <GlassContent layout="scroll" ref={page}>
        <p>testo</p>
      </GlassContent>
      <Seg label="Prova" value="a" onChange={() => undefined} options={[{ value: 'a', label: 'a' }, { value: 'b', label: 'b' }]} />
      <GlassRange aria-label="Fiducia" min={0} max={100} step={10} value={50} />
    </ViewScene>
  )
}

describe('glass scenes', () => {
  it('leave nothing behind when the view goes: no scene, no layer, no observer still watching', async () => {
    class RO {
      observe(): void {
        // jsdom has no layout to watch: only whether it is watching counts.
      }
      unobserve(): void {
        // as above
      }
      disconnect(): void {
        // as above
      }
    }
    vi.stubGlobal('ResizeObserver', tracked(RO))
    vi.stubGlobal('MutationObserver', tracked(window.MutationObserver))
    const view = render(<View />)
    await act(async () => await new Promise((r) => setTimeout(r, 50)))
    expect(document.querySelectorAll('.lg-scene').length).toBeGreaterThan(0)
    expect(live.size).toBeGreaterThan(0)
    view.unmount()
    await act(async () => await new Promise((r) => setTimeout(r, 50)))
    expect(document.querySelectorAll('.lg-scene, .lg-surface, .lg-content, svg').length).toBe(0)
    expect(live.size).toBe(0)
  })
})
