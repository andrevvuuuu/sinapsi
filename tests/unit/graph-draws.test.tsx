// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GraphView } from '../../src/renderer/src/graph/GraphView'
import { draw, type Colors, type DrawState } from '../../src/renderer/src/graph/draw'
import { buildModel } from '../../src/renderer/src/graph/model'
import { createLayout } from '../../src/renderer/src/graph/layout'
import type { GraphData } from '../../src/shared/graph-types'
import type { VaultIndex } from '../../src/shared/vault-types'

afterEach(cleanup)

it('draws the graph once it has loaded (regression: the canvas stayed empty)', async () => {
  const calls: string[] = []
  const fn = (name: string) => (...a: unknown[]) => {
    calls.push(name)
    if (name === 'measureText') return { width: 10 }
    if (name.startsWith('create')) return { addColorStop: () => undefined }
    void a
    return undefined
  }
  const ctx = new Proxy({}, { get: (_t, k) => (k === 'canvas' ? {} : fn(String(k))), set: () => true })
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as never
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 5) as unknown as number)
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
  const index: VaultIndex = { root: '/v', scannedAt: 1, subjects: [], notes: [{ path: '/v/R.md', title: 'R', folder: '', tags: [], aliases: [], links: [], headings: [], blockIds: [], subject: null, mtime: 1, size: 1, available: true }] }
  const graph: GraphData = { extracted: {}, chains: [], concepts: [{ id: 'n_r', name: 'Rolle', statement: 'x', aliases: [], birth: '/v/R.md', notes: ['/v/R.md'], sections: {}, depth: 0 }] }
  window.sinapsi = { graph: { get: vi.fn(async () => graph), status: vi.fn(async () => ({ queued: [] })), extract: vi.fn(), onChange: () => () => undefined, positions: vi.fn(async () => ({})), savePositions: vi.fn(async () => undefined) } } as never
  render(<GraphView menuOpen index={index} onStudy={vi.fn()} onOpenNote={vi.fn()} />)
  await screen.findByText(/1 concetti da 1 note/)
  await vi.waitFor(() => expect(calls).toContain('arc'), { timeout: 2000 })
  vi.unstubAllGlobals()
})

describe('procedural ring in draw()', () => {
  const C: Colors = {
    bg: '#1c1d20',
    ink: '#ececef',
    muted: '#a5a6ae',
    hair: '#303137',
    accent: '#a596f0',
    good: '#5fd38a',
    warn: '#f2b84b',
    bad: '#f08080',
    pen: '#4c8dff',
    surface: '#2a2b30'
  }
  const index: VaultIndex = {
    root: '/v',
    scannedAt: 1,
    subjects: [],
    notes: [{ path: '/v/R.md', title: 'R', folder: '', tags: [], aliases: [], links: [], headings: [], blockIds: [], subject: null, mtime: 1, size: 1, available: true }]
  }
  const graph: GraphData = {
    extracted: {},
    chains: [],
    concepts: [{ id: 'n_r', name: 'Rolle', statement: 'x', aliases: [], birth: '/v/R.md', notes: ['/v/R.md'], sections: {}, depth: 0 }]
  }

  function setupDraw(mem: DrawState['memory']) {
    const model = buildModel(graph, index)
    const layout = createLayout(model, { mode: 'radial' })
    layout.tick(5)

    const calls: { name: string; args: unknown[]; strokeStyle?: unknown; lineDash?: number[] }[] = []
    let currentStrokeStyle: unknown = ''
    let currentLineDash: number[] = []

    const target = {
      canvas: {},
      measureText: () => ({ width: 10 }),
      set strokeStyle(v: unknown) {
        currentStrokeStyle = v
      },
      get strokeStyle() {
        return currentStrokeStyle
      },
      setLineDash: (d: number[]) => {
        currentLineDash = [...d]
        calls.push({ name: 'setLineDash', args: [d], lineDash: [...d] })
      },
      beginPath: () => calls.push({ name: 'beginPath', args: [] }),
      arc: (...args: unknown[]) => calls.push({ name: 'arc', args, strokeStyle: currentStrokeStyle, lineDash: [...currentLineDash] }),
      stroke: () => calls.push({ name: 'stroke', args: [], strokeStyle: currentStrokeStyle, lineDash: [...currentLineDash] }),
      fill: () => calls.push({ name: 'fill', args: [] })
    }

    const dummyCtx = new Proxy(target, {
      get: (t, k) => {
        if (k in t) return (t as never)[k]
        return (...args: unknown[]) => calls.push({ name: String(k), args })
      },
      set: (t, k, v) => {
        ;(t as never)[k] = v
        return true
      }
    }) as unknown as CanvasRenderingContext2D

    const offscreen = {
      getContext: () => null
    } as unknown as HTMLCanvasElement

    const state: DrawState = {
      model,
      layout,
      T: { k: 1, x: 400, y: 300 },
      W: 800,
      H: 600,
      C,
      dark: true,
      mode: 'radial',
      show: { regions: false, wikilinks: false, frontier: false },
      hov: null,
      sel: null,
      path: null,
      subjectColor: () => '#fff',
      offscreen,
      memory: mem,
      lens: 'all',
      now: Date.now()
    }

    draw(dummyCtx, state)
    return calls
  }

  it('draws a solid outer ring with C.accent when procedural is independent', () => {
    const calls = setupDraw({
      n_r: {
        state: 'la sai',
        R: 0.9,
        due: null,
        procedural: { independent: true, lastPracticeAt: 1000, lastOutcome: true }
      }
    })

    const accentStrokes = calls.filter((c) => c.name === 'stroke' && c.strokeStyle === C.accent)
    expect(accentStrokes.length).toBe(1)
    expect(accentStrokes[0].lineDash).toEqual([]) // pieno (solid)
  })

  it('draws a dashed outer ring with C.accent when practiced but not yet independent', () => {
    const calls = setupDraw({
      n_r: {
        state: 'incerto',
        R: 0.7,
        due: null,
        procedural: { independent: false, lastPracticeAt: 1000, lastOutcome: false }
      }
    })

    const accentStrokes = calls.filter((c) => c.name === 'stroke' && c.strokeStyle === C.accent)
    expect(accentStrokes.length).toBe(1)
    expect(accentStrokes[0].lineDash).toEqual([2, 2]) // tratteggiato (dashed)
  })

  it('draws no procedural ring when concept has no practice', () => {
    const calls = setupDraw({
      n_r: {
        state: 'la sai',
        R: 0.9,
        due: null
      }
    })

    const accentStrokes = calls.filter((c) => c.name === 'stroke' && c.strokeStyle === C.accent)
    expect(accentStrokes.length).toBe(0)
  })
})
