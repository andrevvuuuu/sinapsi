import { select, type Selection } from 'd3-selection'
import 'd3-transition'
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ExtractorStatus, GraphData } from '../../../shared/graph-types'
import type { VaultIndex } from '../../../shared/vault-types'
import { RichText } from '../session/RichText'
import { draw, radiusOf, type Colors, type Lens, type Sel } from './draw'
import { createLayout, type Layout, type LayoutMode, type SimNode } from './layout'
import { buildModel, lensCounts, modelKey, type GraphModel, type SearchHit } from './model'
import type { Memory } from '../../../shared/memory-types'
import './graph.css'

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
export function GraphView({
  index,
  onStudy,
  onOpenNote,
  onReview
}: {
  index: VaultIndex
  onStudy: (title: string) => void
  onOpenNote: (path: string) => void
  onReview?: (conceptIds: string[]) => void
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
  const [options, setOptions] = useState(false)
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

  // Rebuilt only when the content changes: every graph:changed and vault event brings new objects.
  const key = graph ? modelKey(graph, index) : ''
  const model: GraphModel | null = useMemo(
    () => (graph ? buildModel(graph, index) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key]
  )
  const modelRef = useRef(model)
  const indexRef = useRef(index)
  useEffect(() => {
    modelRef.current = model
    indexRef.current = index
    dirty.current = true
  }, [])
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
  const counts = model ? lensCounts(model, memory, now) : { due: 0, never: 0, fragile: 0 }
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
      const L0 = 330
      const cw = Math.max(200, W - L0 - (sel ? 370 : 16))
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
    const cw = W - 330 - 370
    s.transition()
      .duration(reducedMotion() ? 0 : 900)
      .call(z.transform, zoomIdentity.translate(330 + cw / 2 - k * n.x!, H / 2 - k * n.y!).scale(k))
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
    for (const n of l.nodes) {
      if (n.kind !== 'concept' && n.kind !== 'note') continue
      const r = (n.kind === 'concept' ? radiusOf(model, n) * Math.sqrt(k) * 0.9 : 6) + 8
      const d = Math.hypot(n.x! * k + tx - x, n.y! * k + ty - y)
      if (d < r && d < bd) {
        bd = d
        best = { kind: n.kind === 'concept' ? 'concept' : 'note', id: n.id }
      }
    }
    return best
  }

  const choose = (x: Sel | null): void => {
    setPath(null)
    setSel(x)
  }
  const go = (h: SearchHit): void => {
    setQuery('')
    setHi(-1)
    choose({ kind: h.kind, id: h.id })
    if (h.kind === 'region') {
      const ids = model?.regions.find((r) => r.notePath === h.id)?.concepts
      if (ids) fit(ids)
    } else focusOn(h.id, h.kind === 'concept' ? 1.9 : 1.2)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !(document.activeElement instanceof HTMLInputElement)) choose(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const hits = model ? model.search(query) : []
  const down = useRef<[number, number] | null>(null)
  const multi = model ? model.concepts.filter((c) => c.notes.length > 1).length : 0

  return (
    <div className="graph" ref={wrapRef}>
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
      <section className="gpanel" aria-label="Controlli del grafo">
        <h2>Il tuo grafo</h2>
        <p className="meta">
          {model
            ? `${model.concepts.length} concetti da ${model.regions.length} note · ${new Set(model.arrows.map((a) => a.chain)).size} catene · ${multi} in più note`
            : 'Carico il grafo…'}
        </p>
        <div className="gsearch">
          <input
            role="combobox"
            aria-label="Cerca nel grafo"
            aria-expanded={hits.length > 0}
            aria-controls="graph-results"
            aria-activedescendant={hi >= 0 ? `gr-${hi}` : undefined}
            placeholder="Cerca un concetto o una nota"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setHi(-1)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') setHi(Math.min(hits.length - 1, hi + 1))
              else if (e.key === 'ArrowUp') setHi(Math.max(0, hi - 1))
              else if (e.key === 'Enter' && hits.length) go(hits[Math.max(0, hi)])
              else if (e.key === 'Escape') setQuery('')
              else return
              e.preventDefault()
            }}
          />
          {hits.length > 0 && (
            <ul role="listbox" id="graph-results" className="gresults">
              {hits.map((h, i) => (
                <li
                  key={`${h.kind}:${h.id}`}
                  id={`gr-${i}`}
                  role="option"
                  aria-selected={i === hi}
                  onClick={() => go(h)}
                >
                  <span>{h.label}</span>
                  <small>{h.kind === 'concept' ? 'concetto' : 'nota'}</small>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="gsec">
          <h3>Evidenzia</h3>
          <div className="gseg glens" role="group" aria-label="Evidenzia">
            {(
              [
                ['all', 'Tutto'],
                ['due', `Da ripassare (${counts.due})`],
                ['never', `Mai visti (${counts.never})`],
                ['fragile', `Basi fragili (${counts.fragile})`]
              ] as [Lens, string][]
            ).map(([l, label]) => (
              <button key={l} type="button" aria-pressed={lens === l} onClick={() => setLens(l)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="gmore"
          aria-expanded={options}
          onClick={() => setOptions(!options)}
        >
          Disposizione e strati
          <span aria-hidden="true">{options ? '−' : '+'}</span>
        </button>
        {options && (
          <>
            <div className="gsec">
              <h3>Disposizione</h3>
              <div className="gseg" role="group" aria-label="Disposizione">
                {MODES.map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={mode === m}
                    onClick={() => changeMode(m)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="hint">{MODES.find((m) => m[0] === mode)![2]}</p>
            </div>
            <div className="gsec gtoggles">
              {(
                [
                  ['regions', 'Regioni'],
                  ['wikilinks', 'Link di Obsidian'],
                  ['frontier', `Frontiera${model ? ` (${model.frontier.length})` : ''}`]
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={show[key]}
                  onClick={() => setShow({ ...show, [key]: !show[key] })}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
        <StatusLine status={status} index={index} onRetry={extract} error={extractError} />
      </section>
      <div className="gzoom" role="group" aria-label="Zoom">
        <button
          type="button"
          aria-label="Avvicina"
          onClick={() =>
            selRef.current &&
            zoomRef.current &&
            selRef.current.transition().duration(300).call(zoomRef.current.scaleBy, 1.5)
          }
        >
          +
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
          −
        </button>
        <button
          type="button"
          aria-label="Mostra tutto"
          onClick={() => {
            setPath(null)
            fit()
          }}
        >
          ⤢
        </button>
      </div>
      {sel && model && (
        <Card
          sel={sel}
          model={model}
          index={index}
          onClose={() => choose(null)}
          onSelect={(x) => {
            choose(x)
            if (x.kind === 'concept') focusOn(x.id, Math.max(1.8, T.current.k))
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
        />
      )}
    </div>
  )
}

function StatusLine({
  status,
  index,
  onRetry,
  error
}: {
  status: ExtractorStatus
  index: VaultIndex
  onRetry: (path: string) => void
  error: string | null
}): React.JSX.Element | null {
  if (error && !status.running)
    return (
      <p className="gstatus err" role="alert">
        {error}
      </p>
    )
  if (status.running)
    return (
      <p className="gstatus" role="status">
        <span className="pulse" aria-hidden="true" />
        Sto estraendo «{title(index, status.running)}»…
        {status.queued.length > 0 ? ` (${status.queued.length} in coda)` : ''}
      </p>
    )
  if (status.lastError)
    return (
      <p className="gstatus err" role="alert">
        «{title(index, status.lastError.notePath)}»: {status.lastError.message}{' '}
        <button type="button" onClick={() => onRetry(status.lastError!.notePath)}>
          Riprova
        </button>
      </p>
    )
  return null
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
  onReview?: (conceptIds: string[]) => void
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
  onReview
}: CardProps): React.JSX.Element {
  const conceptRow = (id: string, tag?: string): React.JSX.Element | null => {
    const c = model.concepts.find((x) => x.id === id)
    if (!c) return null
    return (
      <li key={id}>
        <button type="button" onClick={() => onSelect({ kind: 'concept', id })}>
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
    const anc = ancestorsOf(model, c.id)
    const ps = model.parents.get(c.id) ?? []
    const ks = model.kids.get(c.id) ?? []
    body = (
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
        {ps.length ? (
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
          <button type="button" className="pri" onClick={() => onPath([c.id, ...anc])}>
            Cosa serve per capirlo ({anc.length})
          </button>
          {onReview && (
            <button type="button" onClick={() => onReview([c.id])}>
              Ripassa
            </button>
          )}
          <button type="button" onClick={() => onOpenNote(c.birth)}>
            Apri la nota
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
