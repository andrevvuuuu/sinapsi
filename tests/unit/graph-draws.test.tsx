// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

describe('chain pulse in draw() and GraphView', () => {
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
    notes: [
      {
        path: '/v/R.md',
        title: 'R',
        folder: '',
        tags: [],
        aliases: [],
        links: [],
        headings: [],
        blockIds: [],
        subject: null,
        mtime: 1,
        size: 1,
        available: true
      }
    ]
  }
  const graph: GraphData = {
    extracted: {},
    chains: [{ id: 'arg_1', premises: ['n_a'], conclusion: 'n_b', notes: ['/v/R.md'] }],
    concepts: [
      {
        id: 'n_a',
        name: 'A',
        statement: 'a',
        aliases: [],
        birth: '/v/R.md',
        notes: ['/v/R.md'],
        sections: {},
        depth: 0
      },
      {
        id: 'n_b',
        name: 'B',
        statement: 'b',
        aliases: [],
        birth: '/v/R.md',
        notes: ['/v/R.md'],
        sections: {},
        depth: 1
      }
    ]
  }

  function setupPulseDraw(pulse?: { t: number }, sel?: DrawState['sel']) {
    const model = buildModel(graph, index)
    const layout = createLayout(model, { mode: 'radial' })
    layout.tick(5)

    const calls: { name: string; args: unknown[]; lineDashOffset?: number }[] = []
    let currentLineDashOffset = 0

    const target = {
      canvas: {},
      measureText: () => ({ width: 10 }),
      save: () => calls.push({ name: 'save', args: [] }),
      restore: () => calls.push({ name: 'restore', args: [] }),
      set lineDashOffset(v: number) {
        currentLineDashOffset = v
        calls.push({ name: 'lineDashOffset', args: [v] })
      },
      get lineDashOffset() {
        return currentLineDashOffset
      },
      setLineDash: (d: number[]) => {
        calls.push({ name: 'setLineDash', args: [d], lineDashOffset: currentLineDashOffset })
      },
      beginPath: () => calls.push({ name: 'beginPath', args: [] }),
      moveTo: (x: number, y: number) => calls.push({ name: 'moveTo', args: [x, y] }),
      lineTo: (x: number, y: number) => calls.push({ name: 'lineTo', args: [x, y] }),
      stroke: () => calls.push({ name: 'stroke', args: [] }),
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
      sel: sel ?? null,
      path: null,
      subjectColor: () => '#fff',
      offscreen,
      memory: {},
      lens: 'all',
      now: Date.now(),
      pulse
    }

    draw(dummyCtx, state)
    return calls
  }

  it('draw con pulse e selezione chiama le API canvas dell impulso (setLineDash), senza selezione no', () => {
    const withSel = setupPulseDraw({ t: 0.2 }, { kind: 'concept', id: 'n_a' })
    const pulseCallsWithSel = withSel.filter((c) => c.name === 'lineDashOffset')
    expect(pulseCallsWithSel.length).toBeGreaterThan(0)

    const withoutSel = setupPulseDraw({ t: 0.2 }, null)
    const pulseCallsWithoutSel = withoutSel.filter((c) => c.name === 'lineDashOffset')
    expect(pulseCallsWithoutSel.length).toBe(0)
  })

  it('dopo una selezione i frame si fermano entro ~1 s', async () => {
    let now = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => now)

    let frameCount = 0
    let scheduledCb: FrameRequestCallback | null = null
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frameCount++
      scheduledCb = cb
      return frameCount
    })
    vi.stubGlobal('cancelAnimationFrame', () => {
      scheduledCb = null
    })

    const noopCtx = new Proxy(
      {},
      {
        get: (_t, k) =>
          k === 'measureText' ? () => ({ width: 10 }) : k === 'canvas' ? {} : () => undefined,
        set: () => true
      }
    )
    HTMLCanvasElement.prototype.getContext = vi.fn(() => noopCtx) as never

    window.sinapsi = {
      graph: {
        get: vi.fn(async () => graph),
        status: vi.fn(async () => ({ queued: [] })),
        extract: vi.fn(),
        onChange: () => () => undefined,
        positions: vi.fn(async () => ({})),
        savePositions: vi.fn(async () => undefined)
      }
    } as never

    const { unmount } = render(
      <GraphView menuOpen index={index} onStudy={vi.fn()} onOpenNote={vi.fn()} />
    )
    await screen.findByText(/2 concetti da 1 note/)

    // Advance initial frame
    if (scheduledCb) {
      const cb: FrameRequestCallback = scheduledCb
      scheduledCb = null
      cb(now)
    }

    // Select a concept via combobox
    const box = screen.getByRole('combobox', { name: 'Cerca nel grafo' })
    fireEvent.change(box, { target: { value: 'A' } })
    const opt = await screen.findByRole('option', { name: /A.*concetto/ })
    fireEvent.click(opt)

    // Simulate rAF stepping over 1.2 seconds in 100ms steps
    for (let step = 0; step < 15; step++) {
      now += 100
      if (scheduledCb) {
        const cb: FrameRequestCallback = scheduledCb
        scheduledCb = null
        cb(now)
      }
    }

    // After 1500ms (>800ms / ~1s), no new frame should be scheduled!
    expect(scheduledCb).toBeNull()

    unmount()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('reduced motion -> nessun pulse frame continuo', async () => {
    let now = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => now)

    window.matchMedia = vi.fn((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    })) as never

    let rAFCount = 0
    let scheduledCb: FrameRequestCallback | null = null
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rAFCount++
      scheduledCb = cb
      return rAFCount
    })
    vi.stubGlobal('cancelAnimationFrame', () => {
      scheduledCb = null
    })

    const noopCtx = new Proxy(
      {},
      {
        get: (_t, k) =>
          k === 'measureText' ? () => ({ width: 10 }) : k === 'canvas' ? {} : () => undefined,
        set: () => true
      }
    )
    HTMLCanvasElement.prototype.getContext = vi.fn(() => noopCtx) as never

    window.sinapsi = {
      graph: {
        get: vi.fn(async () => graph),
        status: vi.fn(async () => ({ queued: [] })),
        extract: vi.fn(),
        onChange: () => () => undefined,
        positions: vi.fn(async () => ({})),
        savePositions: vi.fn(async () => undefined)
      }
    } as never

    const { unmount } = render(
      <GraphView menuOpen index={index} onStudy={vi.fn()} onOpenNote={vi.fn()} />
    )
    await screen.findByText(/2 concetti da 1 note/)

    // Drain initial frame
    if (scheduledCb) {
      const cb: FrameRequestCallback = scheduledCb
      scheduledCb = null
      cb(now)
    }

    // Select concept A
    const box = screen.getByRole('combobox', { name: 'Cerca nel grafo' })
    fireEvent.change(box, { target: { value: 'A' } })
    const opt = await screen.findByRole('option', { name: /A.*concetto/ })
    fireEvent.click(opt)

    // With reduced motion, exactly 1 frame is scheduled for the selection update
    expect(scheduledCb).not.toBeNull()
    const cb: FrameRequestCallback = scheduledCb!
    scheduledCb = null
    cb(now)

    // Once that 1 frame runs, loop has stopped immediately (no pulse frames scheduled)
    expect(scheduledCb).toBeNull()

    unmount()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
})
