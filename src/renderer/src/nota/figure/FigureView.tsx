import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { FigElement, Figure } from '../../../../shared/nota-schema'
import { RichText } from '../../session/RichText'
import { evalIn, findRoots, fmt, makeScope, samplePath, vanishes } from './plot'
import './figure.css'

const W = 640
const H = 300
const PAD = 28

const plain = (s: string): string => s.replace(/\$/g, '').replace(/\\([A-Za-z]+)/g, '$1').trim()
const reducedMotion = (): boolean => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
const round6 = (v: number): number => Number(v.toFixed(6))

function initial(fig: Figure, step?: number): Record<string, number> {
  const base = Object.fromEntries(fig.params.map((p) => [p.id, p.value]))
  return step !== undefined && fig.stepParams?.[step] ? { ...base, ...fig.stepParams[step] } : base
}

/**
 * A declarative figure: curves, points, lines drawn from the nota's expressions. Sliders and
 * draggable points move the parameters; "greenWhen" recolours an element when its condition is met;
 * "Mostra i punti" finds where that happens.
 */
export function FigureView({ fig, step, onParams }: { fig: Figure; step?: number; onParams?: (p: Record<string, number>) => void }): React.JSX.Element {
  const uid = useId().replace(/:/g, '')
  const [params, setParams] = useState<Record<string, number>>(() => initial(fig, step))
  const [showPts, setShowPts] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const anim = useRef<number | null>(null)
  const paramsRef = useRef(params)
  useEffect(() => {
    paramsRef.current = params
    onParams?.(params)
    // onParams is a callback from the parent: reporting on param changes only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  // Proof steps move the parameters to the step's values, smoothly unless motion is reduced.
  useEffect(() => {
    if (step === undefined) return
    const target = fig.stepParams?.[step]
    if (!target) return
    const from = { ...paramsRef.current }
    if (reducedMotion() || typeof window.requestAnimationFrame !== 'function') {
      setParams({ ...from, ...target })
      return
    }
    const t0 = performance.now()
    const tick = (t: number): void => {
      const k = Math.min(1, (t - t0) / 300)
      const e = 1 - Math.pow(1 - k, 3)
      setParams({ ...from, ...Object.fromEntries(Object.entries(target).map(([id, v]) => [id, (from[id] ?? v) + (v - (from[id] ?? v)) * e])) })
      if (k < 1) anim.current = requestAnimationFrame(tick)
    }
    anim.current = requestAnimationFrame(tick)
    return () => {
      if (anim.current !== null) cancelAnimationFrame(anim.current)
    }
  }, [step, fig])

  const [x0, x1] = fig.x
  const [y0, y1] = fig.y
  const toPx = (x: number, y: number): [number, number] => [PAD + ((x - x0) / (x1 - x0)) * (W - 2 * PAD), H - PAD - ((y - y0) / (y1 - y0)) * (H - 2 * PAD)]
  const scope = makeScope(fig, params)
  const ev = (src: string): number => evalIn(fig, src, scope)
  const greenTol = 0.02 * (y1 - y0)
  const isGreen = (el: FigElement): boolean => el.greenWhen !== undefined && Math.abs(ev(el.greenWhen)) < greenTol
  const visible = (el: FigElement): boolean => !el.steps || (step !== undefined && el.steps.includes(step))

  const setParam = (id: string, v: number): void => {
    const p = fig.params.find((q) => q.id === id)
    if (!p) return
    setParams((cur) => ({ ...cur, [id]: clamp(round6(v), p.min, p.max) }))
  }

  // Roots depend on the other parameters, not on the one being searched.
  const searched = fig.points?.param
  const others = JSON.stringify(Object.fromEntries(fig.params.filter((q) => q.id !== searched).map((q) => [q.id, params[q.id]])))
  const roots = useMemo(() => {
    if (!fig.points) return [] as number[]
    const pts = fig.points
    const p = fig.params.find((q) => q.id === pts.param)
    if (!p) return [] as number[]
    const base = JSON.parse(others) as Record<string, number>
    const g = (v: number): number => evalIn(fig, pts.expr, makeScope(fig, { ...base, [p.id]: v }))
    return vanishes(g, [p.min, p.max]) ? 'all' : findRoots(g, [p.min, p.max])
  }, [fig, others])

  const anyGreen = fig.elements.some((el) => visible(el) && isGreen(el))

  function dragTo(clientX: number, id: string): void {
    const svg = svgRef.current
    if (!svg) return
    const r = svg.getBoundingClientRect()
    if (!r.width) return
    const vx = ((clientX - r.left) / r.width) * W
    setParam(id, x0 + ((vx - PAD) / (W - 2 * PAD)) * (x1 - x0))
  }

  function renderEl(el: FigElement, i: number): React.JSX.Element | null {
    if (!visible(el)) return null
    const cls = `fe ${isGreen(el) ? 'good' : (el.color ?? defaultColor(el))}${'dashed' in el && el.dashed ? ' dashed' : ''}`
    const key = `el-${i}`
    switch (el.kind) {
      case 'curve': {
        const fn = scope.fns[el.fn]
        return <path key={key} data-testid={key} className={cls + ' curve'} d={samplePath(fn, fig.x, fig.y, toPx)} />
      }
      case 'line': {
        const [x, y, m] = [ev(el.x), ev(el.y), ev(el.slope)]
        if (![x, y, m].every(Number.isFinite)) return null
        const [a, b] = [toPx(x0, y + m * (x0 - x)), toPx(x1, y + m * (x1 - x))]
        return <line key={key} data-testid={key} className={cls} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
      }
      case 'segment': {
        const v = [ev(el.x1), ev(el.y1), ev(el.x2), ev(el.y2)]
        if (!v.every(Number.isFinite)) return null
        const [a, b] = [toPx(v[0], v[1]), toPx(v[2], v[3])]
        return <line key={key} data-testid={key} className={cls} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
      }
      case 'vline': {
        const x = ev(el.x)
        if (!Number.isFinite(x)) return null
        const [px] = toPx(x, 0)
        return <line key={key} data-testid={key} className={cls} x1={px} y1={PAD} x2={px} y2={H - PAD} />
      }
      case 'hline': {
        const y = ev(el.y)
        if (!Number.isFinite(y)) return null
        const [, py] = toPx(0, y)
        return <line key={key} data-testid={key} className={cls} x1={PAD} y1={py} x2={W - PAD} y2={py} />
      }
      case 'label': {
        const [x, y] = [ev(el.x), ev(el.y)]
        if (![x, y].every(Number.isFinite)) return null
        const [px, py] = toPx(x, y)
        return (
          <text key={key} data-testid={key} className={cls + ' lbl'} x={px} y={py}>
            {el.text}
          </text>
        )
      }
      case 'point': {
        const [x, y] = [ev(el.x), ev(el.y)]
        if (![x, y].every(Number.isFinite)) return null
        // Points are drawn above the clip (so their halo is never cut): skip those outside the view.
        if (x < x0 || x > x1 || y < y0 || y > y1) return null
        const [px, py] = toPx(x, y)
        const p = el.drag ? fig.params.find((q) => q.id === el.drag) : undefined
        const dot = (
          <>
            <circle className="dot" cx={px} cy={py} r={6} />
            {el.label && (
              <text className="lbl" x={px + 10} y={py - 12}>
                {el.label}
              </text>
            )}
          </>
        )
        if (!p) return <g key={key} data-testid={key} className={cls}>{dot}</g>
        const v = params[p.id]
        return (
          <g
            key={key}
            data-testid={key}
            className={cls + ' drag'}
            role="slider"
            tabIndex={0}
            aria-label={`Trascina ${el.label ?? 'il punto'}`}
            aria-valuemin={p.min}
            aria-valuemax={p.max}
            aria-valuenow={v}
            aria-valuetext={fmt(v)}
            onKeyDown={(e) => {
              const delta = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? p.step : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -p.step : 0
              if (delta) setParam(p.id, v + delta)
              else if (e.key === 'Home') setParam(p.id, p.min)
              else if (e.key === 'End') setParam(p.id, p.max)
              else return
              e.preventDefault()
            }}
            onPointerDown={(e) => {
              ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
              dragTo(e.clientX, p.id)
            }}
            onPointerMove={(e) => {
              if ((e.currentTarget as Element).hasPointerCapture?.(e.pointerId)) dragTo(e.clientX, p.id)
            }}
          >
            <circle className="hit" cx={px} cy={py} r={22} />
            {dot}
          </g>
        )
      }
    }
  }

  const at = fig.points?.at ? scope.fns[fig.points.at] : undefined
  const zeroY = y0 <= 0 && y1 >= 0 ? toPx(0, 0)[1] : null
  const zeroX = x0 <= 0 && x1 >= 0 ? toPx(0, 0)[0] : null

  return (
    <figure className="bezel fig">
      <div className="core">
        <div className="fighead">
          <span className="t">{fig.title}</span>
        </div>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={plain(fig.title)} className="plot">
          <defs>
            <clipPath id={`clip-${uid}`}>
              <rect x={PAD} y={PAD} width={W - 2 * PAD} height={H - 2 * PAD} />
            </clipPath>
          </defs>
          {zeroY !== null && <line className="axis" x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} />}
          {zeroX !== null && <line className="axis" x1={zeroX} y1={PAD} x2={zeroX} y2={H - PAD} />}
          <g clipPath={`url(#clip-${uid})`}>{fig.elements.map((el, i) => (el.kind === 'point' ? null : renderEl(el, i)))}</g>
          {showPts &&
            at &&
            roots !== 'all' &&
            roots.map((r) => {
              const y = at(r)
              if (!Number.isFinite(y)) return null
              const [px, py] = toPx(r, y)
              // A point off the plotted window gets no ring floating outside the figure.
              if (px < PAD || px > W - PAD || py < PAD || py > H - PAD) return null
              return <circle key={r} className="ring" cx={px} cy={py} r={10} />
            })}
          {fig.elements.map((el, i) => (el.kind === 'point' ? renderEl(el, i) : null))}
        </svg>
        {fig.params.length > 0 && (
          <div className="ctls">
            {fig.params.map((p) => (
              <div className="ctl" key={p.id}>
                <label>
                  <RichText md={p.label} className="inline" />
                  <span className="out" aria-hidden="true">{fmt(params[p.id])}</span>
                </label>
                <input type="range" aria-label={plain(p.label)} min={p.min} max={p.max} step={p.step} value={params[p.id]} onChange={(e) => setParam(p.id, Number(e.target.value))} />
              </div>
            ))}
          </div>
        )}
        {fig.readouts && fig.readouts.length > 0 && (
          <div className="readout">
            {fig.readouts.map((r, i) => (
              <div key={i} data-testid={`readout-${i}`}>
                <span>{r.label}</span>
                <b>{fmt(ev(r.expr))}</b>
              </div>
            ))}
          </div>
        )}
        {fig.points && (
          <div className="pts">
            <button type="button" className="nv-chip" aria-pressed={showPts} onClick={() => setShowPts(!showPts)}>
              {fig.points.label}
            </button>
            <span data-testid="points" aria-live="polite" className="ptl">
              {showPts &&
                (roots === 'all' ? (
                  'Vale in tutti i punti di questo intervallo'
                ) : roots.length === 0 ? (
                  'Nessun punto in questo intervallo'
                ) : (
                  roots.map((r) => (
                    <button key={r} type="button" className="nv-chip small" onClick={() => setParam(fig.points!.param, r)}>
                      {fig.points!.param} ≈ {fmt(r)}
                    </button>
                  ))
                ))}
            </span>
          </div>
        )}
        <div className="caption" role="status">
          {fig.caption && <RichText md={fig.caption} className="inline" />}
          {anyGreen && <b className="green-note"> Diventa verde: la condizione è soddisfatta qui.</b>}
        </div>
      </div>
    </figure>
  )
}

function defaultColor(el: FigElement): string {
  return el.kind === 'curve' ? 'accent' : el.kind === 'point' ? 'ink' : 'muted'
}
