import { select, type Selection } from 'd3-selection'
import 'd3-transition'
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChainSource, ExtractorStatus, GraphData } from '../../../shared/graph-types'
import type { VaultIndex } from '../../../shared/vault-types'
import { weakPrerequisites, type CascadeMemory } from '../../../shared/cascade'
import { DICTATION_SHORT, useDictation } from '../components/dictation'
import { GlassContent, GlassSurface } from '@glass-sdk/liquid-glass'
import { SceneBoundary } from '../components/glass'
import { RichText } from '../session/RichText'
import { draw, radiusOf, type Colors, type Lens, type Sel } from './draw'
import { createLayout, type Layout, type LayoutMode, type SimNode } from './layout'
import { GraphNotchDock } from './GraphNotchDock'
import {
  buildModel,
  filterBySubject,
  lensCounts,
  modelKey,
  subjectsOf,
  type GraphModel,
  type SearchHit,
  type VConcept,
  liveOnly
} from './model'
import type { Memory } from '../../../shared/memory-types'
import './graph.css'

const STORAGE_KEY = 'sinapsi:graph:subject'
function getStoredSubject(): string | null | undefined {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === null || v === '__all__') return undefined
    if (v === '__null__') return null
    return v
  } catch {
    return undefined
  }
}
function setStoredSubject(s: string | null | undefined): void {
  try {
    if (s === undefined) localStorage.removeItem(STORAGE_KEY)
    else if (s === null) localStorage.setItem(STORAGE_KEY, '__null__')
    else localStorage.setItem(STORAGE_KEY, s)
  } catch {
    // ignore
  }
}

function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - x1, py - y1)
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq))
  const projX = x1 + t * dx
  const projY = y1 + t * dy
  return Math.hypot(px - projX, py - projY)
}

const MODES: [LayoutMode, string, string][] = [
  [
    'radial',
    'Radiale',
    "Le basi al centro, ciò che ne deriva verso l'esterno. Il bordo è il limite di quello che sai; oltre, la frontiera."
  ],
  ['vertical', 'A piani', 'Le basi in basso, le conseguenze sopra: le frecce salgono.'],
  ['free', 'Libera', 'Ogni nota è una regione che si dispone liberamente, come in Obsidian.']
]
const TOKENS: (keyof Colors)[] = [
  'bg',
  'ink',
  'muted',
  'hair',
  'accent',
  'good',
  'warn',
  'bad',
  'pen',
  'surface'
]
const reducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches
const readColors = (): Colors => {
  const st = getComputedStyle(document.documentElement)
  return Object.fromEntries(
    TOKENS.map((k) => [k, st.getPropertyValue(`--${k}`).trim() || '#888888'])
  ) as Colors
}
const title = (index: VaultIndex, path: string): string =>
  index.notes.find((n) => n.path === path)?.title ?? path.split('/').pop()!.replace(/\.md$/, '')

/** The union graph: Obsidian notes and Learn Harness concepts in one picture (approved prototype grafo-v2). */
/** The graph in the Home's scene (its own when mounted alone, as in the unit tests). */
export function GraphView(props: Parameters<typeof GraphBody>[0]): React.JSX.Element {
  return (
    <SceneBoundary>
      <GraphBody {...props} />
    </SceneBoundary>
  )
}

function GraphBody({
  index,
  onStudy,
  onOpenNote,
  onReview,
  onAskTutor,
  menuOpen = false,
  livePaths
}: {
  index: VaultIndex
  onStudy: (title: string) => void
  onOpenNote: (path: string) => void
  onReview?: (conceptIds: string[], opts?: { cascadeWeak?: string[] }) => void
  onAskTutor?: (conceptId: string, name: string) => void
  /** Start with the graph menu open (it normally waits behind its round button). */
  menuOpen?: boolean
  /** Notes with a ready nota viva: when given, the graph shows only them. */
  livePaths?: string[]
}): React.JSX.Element {
  const api = window.sinapsi.graph
  const [graph, setGraph] = useState<GraphData | null>(null)
  const [status, setStatus] = useState<ExtractorStatus>({ queued: [] })
  const [mode, setMode] = useState<LayoutMode>('radial')
  const [show, setShow] = useState({ regions: true, wikilinks: true, frontier: true })
  const [sel, setSel] = useState<Sel | null>(null)
  const [path, setPath] = useState<Set<string> | null>(null)
  const [query, setQuery] = useState('')
  const [hi, setHi] = useState(-1)
  const searchField = useRef<HTMLInputElement>(null)
  const searchMic = useDictation({
    target: searchField,
    value: query,
    onChange: (v) => (setQuery(v), setHi(-1)),
    maxSeconds: DICTATION_SHORT
  })
  const [dockOpen, setDockOpen] = useState(menuOpen)
  const menuOpenRef = useRef(menuOpen)
  useEffect(() => {
    menuOpenRef.current = dockOpen
  }, [dockOpen])
  const [memory, setMemory] = useState<Record<string, Memory>>({})
  const [lens, setLens] = useState<Lens>('all')
  const [now] = useState(() => Date.now())

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const offscreen = useRef<HTMLCanvasElement | null>(null)
  const layoutRef = useRef<Layout | null>(null)
  const savedRef = useRef<Record<string, [number, number]> | null>(null)
  const T = useRef({ k: 0.5, x: 0, y: 0 })
  const zoomRef = useRef<ZoomBehavior<HTMLCanvasElement, unknown> | null>(null)
  const selRef = useRef<Selection<HTMLCanvasElement, unknown, null, undefined> | null>(null)
  const hov = useRef<Sel | null>(null)
  const dirty = useRef(true)
  const labels = useRef(new Map<string, [number, number, number, number]>())
  const size = useRef({ W: 800, H: 600 })
  const colors = useRef<Colors | null>(null)
  // The draw loop reads the latest UI state through refs, so it never restarts on a click.
  const modeRef = useRef(mode)
  const showRef = useRef(show)
  const selStateRef = useRef(sel)
  const pathRef = useRef(path)

  useEffect(() => {
    let alive = true
    void Promise.all([api.get(), api.status(), api.positions().catch(() => ({}))]).then(
      ([g, st, pos]) => {
        if (!alive) return
        savedRef.current = pos
        setStatus(st)
        setGraph(g)
      }
    )
    const off = api.onChange((e) => {
      setStatus(e.status)
      if (e.graph) setGraph(e.graph)
    })
    return () => {
      alive = false
      off()
    }
  }, [api])

  const [subjectFilter, setSubjectFilterState] = useState<string | null | undefined>(getStoredSubject)
  const setSubjectFilter = useCallback((s: string | null | undefined) => {
    setSubjectFilterState(s)
    setStoredSubject(s)
  }, [])
  const subjects = useMemo(() => (graph ? subjectsOf(graph) : []), [graph])

  // If stored subject doesn't exist in the current graph, revert to 'Tutte'
  useEffect(() => {
    if (graph && subjectFilter !== undefined && !subjects.includes(subjectFilter)) {
      setSubjectFilter(undefined)
    }
  }, [graph, subjectFilter, subjects, setSubjectFilter])

  // Rebuilt only when the content changes: every graph:changed and vault event brings new objects.
  const liveKey = livePaths ? [...livePaths].sort().join('\n') : null
  const subjectFilteredGraph = useMemo(
    () => (graph ? filterBySubject(graph, subjectFilter) : null),
    [graph, subjectFilter]
  )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shown = useMemo(
    () =>
      subjectFilteredGraph && livePaths
        ? liveOnly(subjectFilteredGraph, index, livePaths)
        : subjectFilteredGraph
          ? { graph: subjectFilteredGraph, index }
          : null,
    [subjectFilteredGraph, index, liveKey]
  )
  const key = shown ? modelKey(shown.graph, shown.index) : ''
  const model: GraphModel | null = useMemo(
    () => (shown ? buildModel(shown.graph, shown.index) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key]
  )
  const modelRef = useRef(model)
  const indexRef = useRef(index)
  // The draw loop reads these refs: they must follow every new model (an empty deps list left the canvas blank).
  useEffect(() => {
    modelRef.current = model
    indexRef.current = index
    dirty.current = true
  }, [model, index])
  const memoryRef = useRef(memory)
  const lensRef = useRef<Lens>(lens)
  const nowRef = useRef(now)
  useEffect(() => {
    memoryRef.current = memory
    lensRef.current = lens
    dirty.current = true
  }, [memory, lens])
  // Memory changes after each review: reload it when the graph changes too.
  useEffect(() => {
    let alive = true
    void window.sinapsi.review
      ?.memory()
      .then((m) => alive && setMemory(m))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [key])
  const counts = useMemo(
    () => (model ? lensCounts(model, memory, now) : { due: 0, never: 0, fragile: 0 }),
    [model, memory, now]
  )
  const [extractError, setExtractError] = useState<string | null>(null)
  const extract = (path: string): void => {
    setExtractError(null)
    api
      .extract(path)
      .catch((e) =>
        setExtractError(
          (e instanceof Error ? e.message : String(e)).replace(
            /^Error invoking remote method '[^']+': (Error: )?/,
            ''
          )
        )
      )
  }

  // A new model keeps the positions it already had (the graph grows without reshuffling).
  useEffect(() => {
    if (!model) return
    const prev = layoutRef.current?.positions() ?? savedRef.current ?? undefined
    const l = createLayout(model, { mode, saved: prev })
    l.tick(l.warmup)
    l.sim.on('tick', () => (dirty.current = true))
    let saveTimer: ReturnType<typeof setTimeout> | undefined
    // Manual ticks send no 'end' event: save after the warm-up too, and after every settled restart.
    const save = (): void => {
      clearTimeout(saveTimer)
      saveTimer = setTimeout(
        () => void api.savePositions(l.positions()).catch(() => undefined),
        2000
      )
    }
    l.sim.on('end', save)
    save()
    layoutRef.current?.sim.stop()
    layoutRef.current = l
    dirty.current = true
    return () => {
      clearTimeout(saveTimer)
      l.sim.stop()
    }
    // mode changes are applied by setMode below without rebuilding the layout
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, api])

  const fit = useCallback(
    (ids?: string[]) => {
      const l = layoutRef.current
      const z = zoomRef.current
      const s = selRef.current
      if (!l || !z || !s) return
      const ns = ids
        ? ids.map((id) => l.byId.get(id)).filter((n): n is SimNode => !!n)
        : l.nodes.filter((n) => n.kind !== 'junction')
      if (!ns.length) return
      const xs = ns.map((n) => n.x!)
      const ys = ns.map((n) => n.y!)
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
      const { W, H } = size.current
      // Leave room for zoom controls on the left, and notch dock/card on the right.
      const L0 = 70
      const R0 = Math.max(menuOpenRef.current ? 310 : 70, sel ? 370 : 70)
      const cw = Math.max(200, W - L0 - R0)
      const k = Math.min(
        3,
        0.88 * Math.min((cw - 60) / Math.max(60, x1 - x0), (H - 140) / Math.max(60, y1 - y0))
      )
      const t = zoomIdentity
        .translate(L0 + cw / 2 - (k * (x0 + x1)) / 2, H / 2 - (k * (y0 + y1)) / 2)
        .scale(k)
      s.transition()
        .duration(reducedMotion() ? 0 : 800)
        .call(z.transform, t)
    },
    [sel]
  )

  const focusOn = useCallback((id: string, k: number) => {
    const n = layoutRef.current?.byId.get(id)
    const z = zoomRef.current
    const s = selRef.current
    if (!n || !z || !s) return
    const { W, H } = size.current
    const L0 = 70
    const R0 = Math.max(menuOpenRef.current ? 310 : 70, 370)
    const cw = Math.max(200, W - L0 - R0)
    s.transition()
      .duration(reducedMotion() ? 0 : 900)
      .call(z.transform, zoomIdentity.translate(L0 + cw / 2 - k * n.x!, H / 2 - k * n.y!).scale(k))
  }, [])

  // Canvas, zoom, resize, theme and the draw loop.
  useEffect(() => {
    const cv = canvasRef.current
    const wrap = wrapRef.current
    if (!cv || !wrap) return
    offscreen.current = document.createElement('canvas')
    const resize = (): void => {
      const r = wrap.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      size.current = { W: r.width || 800, H: r.height || 600 }
      cv.width = size.current.W * dpr
      cv.height = size.current.H * dpr
      dirty.current = true
    }
    resize()
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null
    ro?.observe(wrap)
    const z = d3zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.08, 6])
      .on('zoom', (ev) => {
        T.current = ev.transform
        dirty.current = true
      })
    const s = select(cv)
    s.call(z).on('dblclick.zoom', null)
    zoomRef.current = z
    selRef.current = s
    const mo = new MutationObserver(() => {
      colors.current = readColors()
      dirty.current = true
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    let raf = 0
    const loop = (): void => {
      const l = layoutRef.current
      const model = modelRef.current
      const index = indexRef.current
      if (dirty.current && l && model) {
        dirty.current = false
        const ctx = cv.getContext('2d')
        if (ctx) {
          const dpr = cv.width / size.current.W
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
          colors.current ??= readColors()
          const out = draw(ctx, {
            model,
            layout: l,
            T: T.current,
            ...size.current,
            C: colors.current,
            dark: document.documentElement.dataset.theme !== 'trattato',
            mode: modeRef.current,
            show: showRef.current,
            hov: hov.current,
            sel: selStateRef.current,
            path: pathRef.current,
            memory: memoryRef.current,
            lens: lensRef.current,
            now: nowRef.current,
            subjectColor: (sj) =>
              index.subjects.find((x) => x.id === sj)?.color ?? colors.current!.muted,
            offscreen: offscreen.current!
          })
          labels.current = out.regionLabels
        }
      }
      if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(loop)
    }
    if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(loop)
    return () => {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf)
      ro?.disconnect()
      mo.disconnect()
      s.on('.zoom', null)
    }
  }, [model, index])

  useEffect(() => {
    modeRef.current = mode
    showRef.current = show
    selStateRef.current = sel
    pathRef.current = path
    dirty.current = true
  }, [mode, show, sel, path])

  // Deselect if currently selected item is no longer in visible model
  useEffect(() => {
    if (!model || !sel) return
    if (sel.kind === 'concept' && !model.conceptById.has(sel.id)) setSel(null)
    else if (sel.kind === 'region' && !model.regions.some((r) => r.notePath === sel.id)) setSel(null)
    else if (sel.kind === 'note' && !model.notes.some((n) => n.path === sel.id)) setSel(null)
    else if (sel.kind === 'chain' && !model.arrows.some((a) => a.chain === sel.id)) setSel(null)
  }, [model, sel])

  // First frame: frame the whole graph once.
  const framed = useRef(false)
  useEffect(() => {
    if (model && !framed.current && layoutRef.current) {
      framed.current = true
      fit()
    }
  }, [model, fit])

  const changeMode = (m: LayoutMode): void => {
    setMode(m)
    const l = layoutRef.current
    if (!l) return
    l.setMode(m)
    l.sim.alpha(0.9).restart()
    setTimeout(() => fit(), reducedMotion() ? 0 : 900)
  }

  function pick(x: number, y: number): Sel | null {
    const l = layoutRef.current
    if (!l || !model) return null
    for (const [id, [a, b, w, h]] of labels.current)
      if (x >= a && x <= a + w && y >= b && y <= b + h) return { kind: 'region', id }
    const { k, x: tx, y: ty } = T.current
    let best: Sel | null = null
    let bd = Infinity

    // 1. Nodes take priority (concepts, notes, junctions)
    for (const n of l.nodes) {
      if (n.kind !== 'concept' && n.kind !== 'note' && n.kind !== 'junction') continue
      const r =
        n.kind === 'concept'
          ? radiusOf(model, n) * Math.sqrt(k) * 0.9 + 8
          : n.kind === 'note'
            ? 6 + 8
            : 6 + 6
      const d = Math.hypot(n.x! * k + tx - x, n.y! * k + ty - y)
      if (d < r && d < bd) {
        bd = d
        best =
          n.kind === 'junction'
            ? { kind: 'chain', id: n.id }
            : { kind: n.kind === 'concept' ? 'concept' : 'note', id: n.id }
      }
    }
    if (best) return best

    // 2. Chain segments (~6px threshold)
    let bestDist = 6
    let bestLink: Sel | null = null
    for (const link of l.links) {
      const a = link.source as SimNode
      const b = link.target as SimNode
      if (a.x === undefined || a.y === undefined || b.x === undefined || b.y === undefined) continue
      if (!link.wikilink && link.chain) {
        const x1 = a.x * k + tx
        const y1 = a.y * k + ty
        const x2 = b.x * k + tx
        const y2 = b.y * k + ty
        const d = distToSegment(x, y, x1, y1, x2, y2)
        if (d < bestDist) {
          bestDist = d
          bestLink = { kind: 'chain', id: link.chain }
        }
      }
    }

    if (showRef.current.wikilinks) {
      const centroids = new Map<string, { x: number; y: number }>()
      for (const r of model.regions) {
        const ns = r.concepts.map((id) => l.byId.get(id)).filter((n): n is SimNode => !!n)
        if (ns.length) {
          centroids.set(r.notePath, {
            x: ns.reduce((acc, n) => acc + n.x!, 0) / ns.length,
            y: ns.reduce((acc, n) => acc + n.y!, 0) / ns.length
          })
        }
      }
      for (const [pathA, pathB] of model.wikilinks) {
        const A = centroids.get(pathA) ?? l.byId.get(pathA)
        const B = centroids.get(pathB) ?? l.byId.get(pathB)
        if (
          !A ||
          !B ||
          A.x === undefined ||
          B.x === undefined ||
          A.y === undefined ||
          B.y === undefined
        )
          continue
        const mx = (A.x + B.x) / 2
        const my = (A.y + B.y) / 2
        const nx = -(B.y - A.y) * 0.18
        const ny = (B.x - A.x) * 0.18
        const cx = mx + nx
        const cy = my + ny
        let prevX = A.x * k + tx
        let prevY = A.y * k + ty
        for (let step = 1; step <= 5; step++) {
          const t = step / 5
          const it = 1 - t
          const qx = it * it * A.x + 2 * it * t * cx + t * t * B.x
          const qy = it * it * A.y + 2 * it * t * cy + t * t * B.y
          const curX = qx * k + tx
          const curY = qy * k + ty
          const d = distToSegment(x, y, prevX, prevY, curX, curY)
          if (d < bestDist) {
            bestDist = d
            const pair = [pathA, pathB].sort()
            bestLink = { kind: 'wikilink', id: `${pair[0]}\n${pair[1]}` }
          }
          prevX = curX
          prevY = curY
        }
      }
    }

    return bestLink
  }

  const choose = (x: Sel | null): void => {
    setPath(null)
    setSel(x)
  }
  const go = (h: SearchHit): void => {
    setQuery('')
    setHi(-1)
    choose({ kind: h.kind, id: h.id })
    searchField.current?.blur()
    if (h.kind === 'region') {
      const ids = model?.regions.find((r) => r.notePath === h.id)?.concepts
      if (ids) fit(ids)
    } else focusOn(h.id, h.kind === 'concept' ? 1.9 : 1.2)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (
        e.key === 'Escape' &&
        !e.defaultPrevented &&
        !(document.activeElement instanceof HTMLInputElement)
      )
        choose(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const hits = model ? model.search(query) : []
  const down = useRef<[number, number] | null>(null)
  const multi = model ? model.concepts.filter((c) => c.notes.length > 1).length : 0

  return (
    <div className="graph" ref={wrapRef}>
      {/* The live layer the glass controls refract. */}
      <GlassContent className="gcanvas">
        <canvas
          ref={canvasRef}
          aria-label="Grafo unito: materie, note e concetti. Usa la ricerca per selezionare."
          role="img"
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            const h = pick(e.clientX - r.left, e.clientY - r.top)
            if (JSON.stringify(h) !== JSON.stringify(hov.current)) {
              hov.current = h
              dirty.current = true
              e.currentTarget.classList.toggle('hov', !!h)
            }
          }}
          onPointerDown={(e) => (down.current = [e.clientX, e.clientY])}
          onClick={(e) => {
            if (
              down.current &&
              Math.hypot(e.clientX - down.current[0], e.clientY - down.current[1]) > 4
            )
              return
            const r = e.currentTarget.getBoundingClientRect()
            choose(pick(e.clientX - r.left, e.clientY - r.top))
          }}
        />
      </GlassContent>
      {livePaths && livePaths.length === 0 && (
        <div className="glive-empty">
          <p>
            Il grafo nasce dalle note vive: creane una da una nota di Obsidian (pannello a destra) o
            alla fine di una sessione di Apprendimento.
          </p>
        </div>
      )}
      <GraphNotchDock
        model={model}
        counts={counts}
        multi={multi}
        query={query}
        setQuery={setQuery}
        hits={hits}
        hi={hi}
        setHi={setHi}
        go={go}
        searchMic={searchMic}
        searchField={searchField}
        lens={lens}
        setLens={setLens}
        mode={mode}
        changeMode={changeMode}
        modes={MODES}
        show={show}
        setShow={setShow}
        status={status}
        index={index}
        onRetry={extract}
        extractError={extractError}
        subjects={subjects}
        subjectFilter={subjectFilter}
        setSubjectFilter={setSubjectFilter}
        initialSection={menuOpen ? 'search' : null}
        onOpenChange={setDockOpen}
      />
      {model && !(livePaths && livePaths.length === 0) && (
        <GlassSurface radius={999} className="gzoom" role="group" aria-label="Zoom">
          <button
            type="button"
            aria-label="Avvicina"
            onClick={() =>
              selRef.current &&
              zoomRef.current &&
              selRef.current.transition().duration(300).call(zoomRef.current.scaleBy, 1.5)
            }
          >
            <svg
              viewBox="0 0 20 20"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="10" y1="4" x2="10" y2="16" />
              <line x1="4" y1="10" x2="16" y2="10" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Allontana"
            onClick={() =>
              selRef.current &&
              zoomRef.current &&
              selRef.current
                .transition()
                .duration(300)
                .call(zoomRef.current.scaleBy, 1 / 1.5)
            }
          >
            <svg
              viewBox="0 0 20 20"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="4" y1="10" x2="16" y2="10" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Mostra tutto"
            onClick={() => {
              setPath(null)
              fit()
            }}
          >
            <svg
              viewBox="0 0 20 20"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 8V4h4M16 8V4h-4M4 12v4h4M16 12v4h-4" />
            </svg>
          </button>
        </GlassSurface>
      )}
      {sel && model && (
        <Card
          sel={sel}
          model={model}
          index={index}
          onClose={() => choose(null)}
          onSelect={(x) => {
            choose(x)
            if (x.kind === 'concept') focusOn(x.id, Math.max(1.8, T.current.k))
            else if (x.kind === 'chain') {
              const arrows = model?.arrows.filter((a) => a.chain === x.id) ?? []
              const ids = new Set<string>()
              for (const a of arrows) {
                ids.add(a.from)
                ids.add(a.to)
              }
              if (ids.size) fit([...ids])
            }
          }}
          onPath={(ids) => {
            setPath(new Set(ids))
            fit(ids)
          }}
          onStudy={onStudy}
          onOpenNote={onOpenNote}
          onExtract={extract}
          memory={memory}
          onReview={onReview}
          onAskTutor={onAskTutor}
          graph={shown?.graph ?? graph}
        />
      )}
    </div>
  )
}


function ancestorsOf(model: GraphModel, id: string): string[] {
  const seen = new Set<string>()
  const walk = (x: string): void => {
    for (const p of model.parents.get(x) ?? [])
      if (!seen.has(p) && p !== id) {
        seen.add(p)
        walk(p)
      }
  }
  walk(id)
  return [...seen]
}

type CardProps = {
  sel: Sel
  model: GraphModel
  index: VaultIndex
  onClose: () => void
  onSelect: (s: Sel) => void
  onPath: (ids: string[]) => void
  onStudy: (title: string) => void
  onOpenNote: (path: string) => void
  onExtract: (path: string) => void
  memory: Record<string, Memory>
  onReview?: (conceptIds: string[], opts?: { cascadeWeak?: string[] }) => void
  onAskTutor?: (conceptId: string, name: string) => void
  graph?: GraphData | null
}

function ConceptCardBody({
  c,
  model,
  index,
  memory,
  graph,
  onSelect,
  onPath,
  onReview,
  onAskTutor,
  onOpenNote
}: {
  c: VConcept
  model: GraphModel
  index: VaultIndex
  memory: Record<string, Memory>
  graph?: GraphData | null
  onSelect: (s: Sel) => void
  onPath: (ids: string[]) => void
  onReview?: (conceptIds: string[], opts?: { cascadeWeak?: string[] }) => void
  onAskTutor?: (conceptId: string, name: string) => void
  onOpenNote: (path: string) => void
}): React.JSX.Element {
  const anc = ancestorsOf(model, c.id)
  const ps = model.parents.get(c.id) ?? []
  const ks = model.kids.get(c.id) ?? []

  const weak = useMemo(() => {
    const parentsObj: Record<string, string[]> = {}
    for (const [k, v] of model.parents) parentsObj[k] = v
    const depthObj: Record<string, number> = {}
    for (const conc of model.concepts) depthObj[conc.id] = conc.depth
    const memObj: Record<string, CascadeMemory | undefined> = {}
    for (const [id, m] of Object.entries(memory)) {
      if (m && typeof m.R === 'number') {
        memObj[id] = { R: m.R, stability: m.stability ?? 0, reps: m.reps }
      }
    }
    return weakPrerequisites({ parents: parentsObj, depth: depthObj, memory: memObj }, c.id)
  }, [model, memory, c.id])

  const incomingChains = (graph?.chains ?? []).filter((ch) => ch.conclusion === c.id)
  const coveredParents = new Set(incomingChains.flatMap((ch) => ch.premises))
  const orphanParents = ps.filter((p) => !coveredParents.has(p))

  const conceptRow = (id: string, tag?: string): React.JSX.Element | null => {
    const cp = model.concepts.find((x) => x.id === id)
    if (!cp) return null
    return (
      <li key={id}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onSelect({ kind: 'concept', id })
          }}
        >
          <i
            style={{ background: model.regions.find((r) => r.notePath === cp.region)?.hue }}
            aria-hidden="true"
          />
          {cp.name}
          <small>{tag ?? title(index, cp.region)}</small>
        </button>
      </li>
    )
  }

  return (
    <>
      <div className="chips">
        <span>concetto</span>
        <span>livello {c.depth}</span>
        <span className={'mem ' + (memory[c.id]?.state ?? 'mai visto').replace(' ', '-')}>
          {memory[c.id]
            ? `${memory[c.id].state} · ${Math.round((memory[c.id].R ?? 0) * 100)}%`
            : 'mai visto'}
        </span>
      </div>
      <h3>{c.name}</h3>
      <RichText md={c.statement} className="stmt" />
      <h4>
        {c.notes.length > 1
          ? `Compare in ${c.notes.length} tue note: un nodo solo`
          : 'Dove compare'}
      </h4>
      <ul className="rows">
        {c.notes.map((p, i) => (
          <li key={p} className="s">
            {title(index, p)}
            <small>
              {i === 0 ? 'nata qui' : 'ritrovata'}
              {c.sections[p] ? ` · ${c.sections[p]}` : ''}
            </small>
          </li>
        ))}
      </ul>
      <h4>Segue da</h4>
      {incomingChains.length > 0 ? (
        <>
          <div className="chain-groups">
            {incomingChains.map((ch, idx) => (
              <div
                key={ch.id}
                className="chain-group"
                onClick={() => onSelect({ kind: 'chain', id: ch.id })}
              >
                <button
                  type="button"
                  className="chain-group-header"
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelect({ kind: 'chain', id: ch.id })
                  }}
                  title="Seleziona la catena"
                >
                  <span className="chain-group-tag">
                    {incomingChains.length > 1 ? `Catena ${idx + 1}` : 'Catena'}
                  </span>
                  <span className="chain-group-arrow">⇒</span>
                  <small>Vedi nesso</small>
                </button>
                <ul className="rows">
                  {ch.premises.map((p) => conceptRow(p))}
                </ul>
              </div>
            ))}
          </div>
          {orphanParents.length > 0 && (
            <ul className="rows">
              {[...new Set(orphanParents)].map((p) => conceptRow(p))}
            </ul>
          )}
        </>
      ) : ps.length > 0 ? (
        <ul className="rows">{[...new Set(ps)].map((p) => conceptRow(p))}</ul>
      ) : (
        <p>È una base: non dipende da altri concetti.</p>
      )}
      {ks.length > 0 && (
        <>
          <h4>Porta a</h4>
          <ul className="rows">{[...new Set(ks)].map((p) => conceptRow(p))}</ul>
        </>
      )}
      <div className="acts">
        {onReview && (
          <button
            type="button"
            className="pri"
            onClick={() => onReview([c.id], { cascadeWeak: weak })}
          >
            Mettiti alla prova
          </button>
        )}
        {onReview && (
          <p className="hint">
            Prima il concetto a freddo; se sbagli, ripassi le basi deboli ({weak.length})
          </p>
        )}
        <button
          type="button"
          className={onReview ? '' : 'pri'}
          onClick={() => onPath([c.id, ...anc])}
        >
          Cosa serve per capirlo ({anc.length})
        </button>
        {onReview && (
          <button type="button" onClick={() => onReview([c.id])}>
            Ripassa
          </button>
        )}
        {onAskTutor && (
          <button type="button" onClick={() => onAskTutor(c.id, c.name)}>
            Chiedi al Tutor
          </button>
        )}
        <button type="button" onClick={() => onOpenNote(c.birth)}>
          Apri la nota
        </button>
      </div>
    </>
  )
}

function ChainCardBody({
  chainId,
  premisesIds,
  conclusion,
  model,
  index,
  onSelect,
  onOpenNote
}: {
  chainId: string
  premisesIds: string[]
  conclusion?: VConcept
  model: GraphModel
  index: VaultIndex
  onSelect: (s: Sel) => void
  onOpenNote: (path: string) => void
}): React.JSX.Element {
  const [revealed, setRevealed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [source, setSource] = useState<ChainSource | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onReveal = async (): Promise<void> => {
    setRevealed(true)
    setLoading(true)
    setError(null)
    try {
      if (typeof window.sinapsi?.graph?.chainSource !== 'function') {
        throw new Error('API chainSource non disponibile')
      }
      const src = await window.sinapsi.graph.chainSource(chainId)
      setSource(src)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="chips">
        <span>nesso logico</span>
        <span>{premisesIds.length > 1 ? `${premisesIds.length} premesse` : '1 premessa'}</span>
      </div>
      <h3>Catena di deduzione</h3>

      <h4>Premesse</h4>
      <div className="chain-premises">
        {premisesIds.map((pid) => {
          const cp = model.conceptById.get(pid)
          return (
            <div key={pid} className="chain-premise">
              <button
                type="button"
                className="chain-concept-btn"
                onClick={() => onSelect({ kind: 'concept', id: pid })}
              >
                <i
                  style={{
                    background: model.regions.find((r) => r.notePath === cp?.region)?.hue
                  }}
                  aria-hidden="true"
                />
                <strong>{cp?.name ?? pid}</strong>
              </button>
              {cp?.statement && <RichText md={cp.statement} className="stmt" />}
            </div>
          )
        })}
      </div>

      <div className="chain-arrow" aria-hidden="true">
        ⇒
      </div>

      <h4>Conclusione</h4>
      {conclusion ? (
        <div className="chain-conclusion">
          <div className="chain-premise">
            <button
              type="button"
              className="chain-concept-btn"
              onClick={() => onSelect({ kind: 'concept', id: conclusion.id })}
            >
              <i
                style={{
                  background: model.regions.find((r) => r.notePath === conclusion.region)?.hue
                }}
                aria-hidden="true"
              />
              <strong>{conclusion.name}</strong>
            </button>
            <RichText md={conclusion.statement} className="stmt" />
          </div>
        </div>
      ) : (
        <p className="hint">—</p>
      )}

      <h4>Perché</h4>
      <p className="chain-prompt">
        Perché queste premesse implicano la conclusione? Prova a dirlo prima di rivelare.
      </p>

      {!revealed && (
        <div className="acts">
          <button type="button" className="pri" onClick={onReveal}>
            Rivela dalla nota
          </button>
        </div>
      )}

      {loading && <p className="hint">Carico la spiegazione…</p>}

      {error && (
        <p className="gstatus err" role="alert">
          {error}
        </p>
      )}

      {revealed && !loading && !error && (
        <>
          {source?.notePath && <h4>Dalla nota «{title(index, source.notePath)}»</h4>}
          {source && source.excerpts && source.excerpts.length > 0 ? (
            <div className="chain-source-box">
              <div className="chain-excerpts">
                {source.excerpts.map((ex, i) => (
                  <div key={i} className="chain-excerpt">
                    {ex.heading && <h5>{ex.heading}</h5>}
                    <RichText md={ex.text} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="hint">
              La nota non contiene un passaggio che giustifichi il nesso
            </p>
          )}

          {source?.notePath && (
            <div className="acts">
              <button type="button" onClick={() => onOpenNote(source.notePath)}>
                Apri la nota
              </button>
            </div>
          )}
        </>
      )}
    </>
  )
}

function Card({
  sel,
  model,
  index,
  onClose,
  onSelect,
  onPath,
  onStudy,
  onOpenNote,
  onExtract,
  memory,
  onReview,
  onAskTutor,
  graph
}: CardProps): React.JSX.Element {
  const conceptRow = (id: string, tag?: string): React.JSX.Element | null => {
    const c = model.concepts.find((x) => x.id === id)
    if (!c) return null
    return (
      <li key={id}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onSelect({ kind: 'concept', id })
          }}
        >
          <i
            style={{ background: model.regions.find((r) => r.notePath === c.region)?.hue }}
            aria-hidden="true"
          />
          {c.name}
          <small>{tag ?? title(index, c.region)}</small>
        </button>
      </li>
    )
  }
  let body: React.JSX.Element
  if (sel.kind === 'concept') {
    const c = model.concepts.find((x) => x.id === sel.id)
    if (!c) return <></>
    body = (
      <ConceptCardBody
        c={c}
        model={model}
        index={index}
        memory={memory}
        graph={graph}
        onSelect={onSelect}
        onPath={onPath}
        onReview={onReview}
        onAskTutor={onAskTutor}
        onOpenNote={onOpenNote}
      />
    )
  } else if (sel.kind === 'chain') {
    const chain = (graph?.chains ?? []).find((ch) => ch.id === sel.id)
    const junc = model.junctions.find((j) => j.id === sel.id)
    const chainArrows = model.arrows.filter((a) => a.chain === sel.id)
    const premisesIds = [
      ...new Set(
        chain?.premises ??
          junc?.premises ??
          (chainArrows.some((a) => !a.head)
            ? chainArrows.filter((a) => !a.head).map((a) => a.from)
            : chainArrows.map((a) => a.from))
      )
    ]
    const conclusionId =
      chain?.conclusion ??
      junc?.conclusion ??
      model.arrows.find((a) => a.chain === sel.id && a.head)?.to
    const conclusion = conclusionId ? model.conceptById.get(conclusionId) : undefined

    body = (
      <ChainCardBody
        key={sel.id}
        chainId={sel.id}
        premisesIds={premisesIds}
        conclusion={conclusion}
        model={model}
        index={index}
        onSelect={onSelect}
        onOpenNote={onOpenNote}
      />
    )
  } else if (sel.kind === 'wikilink') {
    const [pathA, pathB] = sel.id.split('\n')
    const titleA = title(index, pathA)
    const titleB = title(index, pathB)
    const shared = model.concepts.filter(
      (c) => c.notes.includes(pathA) && c.notes.includes(pathB)
    )
    body = (
      <>
        <div className="chips">
          <span>link Obsidian</span>
        </div>
        <h3>
          {titleA} ↔ {titleB}
        </h3>
        <h4>Link scritto da te</h4>
        <p className="hint">
          {shared.length > 0
            ? `Le due note condividono ${shared.length} concetti nel grafo:`
            : 'Le due note sono collegate direttamente in Obsidian.'}
        </p>
        {shared.length > 0 && (
          <ul className="rows">
            {shared.map((c) => conceptRow(c.id))}
          </ul>
        )}
        <div className="acts">
          <button type="button" onClick={() => onOpenNote(pathA)}>
            Apri «{titleA}»
          </button>
          <button type="button" onClick={() => onOpenNote(pathB)}>
            Apri «{titleB}»
          </button>
        </div>
      </>
    )
  } else if (sel.kind === 'region') {
    const r = model.regions.find((x) => x.notePath === sel.id)
    if (!r) return <></>
    const shared = model.concepts.filter(
      (c) => c.region !== r.notePath && c.notes.includes(r.notePath)
    )
    const links = model.wikilinks
      .filter((w) => w.includes(r.notePath))
      .map((w) => (w[0] === r.notePath ? w[1] : w[0]))
    body = (
      <>
        <div className="chips">
          <span>nota Obsidian</span>
          <span>regione</span>
        </div>
        <h3>{r.title}</h3>
        <h4>
          {r.concepts.length} concetti nati qui
          {shared.length ? ` · ${shared.length} presi da altre note` : ''}
        </h4>
        <ul className="rows">
          {r.concepts.map((id) =>
            conceptRow(id, `livello ${model.concepts.find((c) => c.id === id)?.depth ?? 0}`)
          )}
        </ul>
        {shared.length > 0 && (
          <>
            <h4>Presi da altre note</h4>
            <ul className="rows">{shared.map((c) => conceptRow(c.id))}</ul>
          </>
        )}
        {links.length > 0 && (
          <>
            <h4>Link che hai scritto in Obsidian</h4>
            <p>{links.map((p) => title(index, p)).join(' · ')}</p>
          </>
        )}
        <div className="acts">
          <button type="button" className="pri" onClick={() => onStudy(r.title)}>
            Studia questa nota
          </button>
          {onReview && (
            <button type="button" onClick={() => onReview(r.concepts)}>
              Ripassa questa nota
            </button>
          )}
          <button type="button" onClick={() => onOpenNote(r.notePath)}>
            Apri la nota
          </button>
          <button type="button" onClick={() => onExtract(r.notePath)}>
            Estrai di nuovo
          </button>
        </div>
      </>
    )
  } else {
    const n = model.notes.find((x) => x.path === sel.id)
    if (!n) return <></>
    body = (
      <>
        <div className="chips">
          <span>nota Obsidian</span>
          {n.subject && <span>{n.subject}</span>}
        </div>
        <h3>{n.title}</h3>
        <p>
          {!n.available
            ? 'Non ancora scaricata da iCloud: aprila in Obsidian perché venga scaricata, poi potrai estrarla.'
            : n.extracted
              ? 'Estratta: non contiene concetti portanti.'
              : 'Non ancora estratta: quando la estrai, Gemini ne ricava i concetti e le catene di ragionamento, e la nota diventa una regione del grafo.'}
        </p>
        <div className="acts">
          {!n.extracted && n.available && (
            <button type="button" className="pri" onClick={() => onExtract(n.path)}>
              Estrai i concetti
            </button>
          )}
          <button type="button" onClick={() => onOpenNote(n.path)}>
            Apri la nota
          </button>
        </div>
      </>
    )
  }
  return (
    <aside className="gcard" role="dialog" aria-label="Dettagli">
      <button type="button" className="x" aria-label="Chiudi" onClick={onClose}>
        ×
      </button>
      {body}
    </aside>
  )
}
