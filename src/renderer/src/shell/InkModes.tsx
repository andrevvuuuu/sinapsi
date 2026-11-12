import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import './signature.css'

const MODES = ['Studia', 'Esercitati', 'Ripassa'] as const
export type Mode = (typeof MODES)[number]

/*
 * Ink chips (reference: «filter navigation bar — pick a chip and it fills with ink from the edge in
 * as it flows into the results bar»). The results bar is a pill of ink: the count, a divider and the
 * chosen mode. The other modes wait outside as outlined chips that wobble under the pointer.
 * Choosing one: ink floods it from the edge nearest the bar (phase A); then it flows into the bar
 * while the previous mode pops out, draining its ink back into the bar, and the count rolls like an
 * odometer (phase B). Shapes are drawn on one SVG layer through a gooey filter, so ink that comes
 * close melts together; labels sit above, sharp.
 */

const H = 38 // chip and bar height
const GAP = 8 // between bar and chips
const PADX = 16 // chip side padding
const BAR_PADL = 14
const DIV_GAP = 12
const PHASE_A = 360
const PHASE_B = 520

type Geo = { barW: number; chips: Record<Mode, { x: number; fill: number }> }
type Widths = { count: number; text: Record<Mode, number> }

const clamp = (v: number): number => Math.min(1, Math.max(0, v))
const easeInOut = (t: number): number => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2)
const easeOutBack = (t: number): number => 1 + 1.7 * (t - 1) ** 3 + 0.7 * (t - 1) ** 2
// Ink starts slow and rushes at the end: the ASMR feel.
const easeInk = (t: number): number => t ** 2.2

/** Where everything sits when `mode` is the chosen one. */
function layoutFor(mode: Mode, w: Widths): Geo {
  const chipW = (m: Mode): number => w.text[m] + PADX * 2
  const inX = BAR_PADL + w.count + DIV_GAP + 1 + DIV_GAP - PADX
  const barW = inX + chipW(mode)
  let x = barW + GAP
  const chips = {} as Geo['chips']
  for (const m of MODES) {
    if (m === mode) chips[m] = { x: inX, fill: 1 }
    else {
      chips[m] = { x, fill: 0 }
      x += chipW(m) + GAP
    }
  }
  return { barW, chips }
}

/** A pill outline whose edge wobbles: points round the perimeter pushed along their normal. */
function wobblyPill(w: number, amp: number, time: number): string {
  const r = H / 2
  const n = 44
  const pts: [number, number][] = []
  const per = 2 * (w - 2 * r) + 2 * Math.PI * r
  for (let i = 0; i < n; i++) {
    let s = (i / n) * per
    let x: number
    let y: number
    let nx: number
    let ny: number
    const top = w - 2 * r
    if (s < top) {
      x = r + s
      y = 0
      nx = 0
      ny = -1
    } else if ((s -= top) < Math.PI * r) {
      const a = -Math.PI / 2 + s / r
      x = w - r + Math.cos(a) * r
      y = r + Math.sin(a) * r
      nx = Math.cos(a)
      ny = Math.sin(a)
    } else if ((s -= Math.PI * r) < top) {
      x = w - r - s
      y = H
      nx = 0
      ny = 1
    } else {
      s -= top
      const a = Math.PI / 2 + s / r
      x = r + Math.cos(a) * r
      y = r + Math.sin(a) * r
      nx = Math.cos(a)
      ny = Math.sin(a)
    }
    const k = (i / n) * Math.PI * 2
    const off = amp * (Math.sin(k * 3 + time * 5.2) * 0.6 + Math.sin(k * 5 - time * 3.7) * 0.4)
    pts.push([x + nx * off, y + ny * off])
  }
  // Closed Catmull-Rom spline through the points.
  let d = `M${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % n]
    const p3 = pts[(i + 2) % n]
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`
  }
  return `${d} Z`
}

/** Digits that roll vertically, one column each, like an odometer. */
function Odometer({ value }: { value: string }): React.JSX.Element {
  return (
    <span className="sg-odo" aria-label={value}>
      {value.split('').map((ch, i) =>
        /\d/.test(ch) ? (
          <span key={`${value.length}-${i}`} className="sg-odo-col" aria-hidden="true">
            <span className="sg-odo-strip" style={{ transform: `translateY(${-Number(ch)}em)` }}>
              {'0123456789'.split('').map((d) => (
                <span key={d}>{d}</span>
              ))}
            </span>
          </span>
        ) : (
          <span key={`${value.length}-${i}`} aria-hidden="true">
            {ch}
          </span>
        )
      )}
    </span>
  )
}

export function InkModes({
  mode,
  due,
  studyCount,
  practiceCount,
  onChange
}: {
  mode: Mode
  due: number
  studyCount: number | null
  practiceCount: number | null
  onChange: (mode: Mode) => void
}): React.JSX.Element {
  const goo = `sg-goo-${useId().replace(/:/g, '')}`
  const measureRef = useRef<HTMLSpanElement>(null)
  const countRef = useRef<HTMLSpanElement>(null)
  const chipBtn = useRef<Record<string, HTMLButtonElement | null>>({})
  const [w, setW] = useState<Widths | null>(null)
  const [geo, setGeo] = useState<Geo | null>(null)
  const geoRef = useRef<Geo | null>(null)
  const anim = useRef<{ from: Geo; to: Mode; prev: Mode; t0: number } | null>(null)
  const shown = useRef<Mode>(mode)
  const [hover, setHover] = useState<Mode | null>(null)
  const wobRef = useRef({ amp: 0, time: 0 })
  const [wob, setWob] = useState({ amp: 0, time: 0 })

  // The bar keeps showing the previous mode's count until the new chip flows into it.
  const [barMode, setBarMode] = useState<Mode>(mode)
  const count = barMode === 'Ripassa' ? due : barMode === 'Esercitati' ? practiceCount : studyCount
  const countText = count == null ? '—' : String(count)
  const label = barMode === 'Ripassa' ? 'dovuti' : 'suggerimenti'

  // Measure the labels with the real font (again once web fonts have loaded).
  useLayoutEffect(() => {
    const measure = (): void => {
      const box = measureRef.current
      const c = countRef.current
      if (!box || !c) return
      const text = {} as Widths['text']
      box.querySelectorAll<HTMLElement>('[data-m]').forEach((el) => {
        text[el.dataset.m as Mode] = el.getBoundingClientRect().width
      })
      setW({ count: c.getBoundingClientRect().width, text })
    }
    measure()
    void document.fonts?.ready.then(measure)
  }, [countText, label])

  // First layout, and re-layout when sizes change without a mode change.
  useEffect(() => {
    if (!w) return
    if (!anim.current) {
      const g = layoutFor(shown.current, w)
      geoRef.current = g
      setGeo(g)
    }
  }, [w])

  // The animation loop lives outside the effect that starts it: the count label changes width at
  // the same moment as the mode, and a re-measure must not cancel the animation under way.
  const wRef = useRef<Widths | null>(null)
  const rafRef = useRef(0)
  useEffect(() => {
    wRef.current = w
  }, [w])
  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  // A new mode starts the two-phase animation from wherever things are now.
  useEffect(() => {
    if (mode === shown.current || !geoRef.current) return
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    const prev = shown.current
    shown.current = mode
    anim.current = { from: geoRef.current, to: mode, prev, t0: performance.now() }
    cancelAnimationFrame(rafRef.current)
    const swap = window.setTimeout(() => setBarMode(mode), still ? 0 : PHASE_A)
    const tick = (now: number): void => {
      const a = anim.current
      const ww = wRef.current
      if (!a || !ww) return
      const t = still ? PHASE_A + PHASE_B : now - a.t0
      const pa = clamp(t / PHASE_A)
      const pb = clamp((t - PHASE_A) / PHASE_B)
      const end = layoutFor(a.to, ww)
      const ease = easeOutBack(pb)
      const chips = {} as Geo['chips']
      for (const m of MODES) {
        const f = a.from.chips[m]
        const e = end.chips[m]
        let fill: number
        if (m === a.to) fill = Math.max(f.fill, easeInk(pa))
        else if (m === a.prev) fill = f.fill * (1 - easeInOut(clamp(pb * 1.4)))
        else fill = f.fill * (1 - pa)
        // The chosen chip waits in place while the ink floods it, then flows into the bar.
        const x = m === a.to ? f.x + (e.x - f.x) * ease : f.x + (e.x - f.x) * (pb > 0 ? ease : 0)
        chips[m] = { x, fill }
      }
      const g = { barW: a.from.barW + (end.barW - a.from.barW) * ease, chips }
      geoRef.current = g
      setGeo(g)
      if (t < PHASE_A + PHASE_B) rafRef.current = requestAnimationFrame(tick)
      else {
        anim.current = null
        geoRef.current = end
        setGeo(end)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => window.clearTimeout(swap)
  }, [mode])

  // Wobble of the hovered chip's outline.
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const st = wobRef.current
      st.time += dt
      st.amp += ((hover ? 1.8 : 0) - st.amp) * 0.14
      setWob({ amp: st.amp, time: st.time })
      if (hover || st.amp > 0.02) raf = requestAnimationFrame(tick)
      else st.amp = 0
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [hover])

  const chipW = (m: Mode): number => (w ? w.text[m] + PADX * 2 : 0)
  const totalW = geo ? Math.max(geo.barW, ...MODES.map((m) => geo.chips[m].x + chipW(m))) + 4 : 0
  const divX = w ? BAR_PADL + w.count + DIV_GAP : 0

  return (
    <div className="sg-ink" style={{ height: H + 8, width: totalW || undefined }}>
      {/* Hidden measuring copies of the labels. */}
      <span ref={measureRef} className="sg-ink-measure" aria-hidden="true">
        {MODES.map((m) => (
          <span key={m} data-m={m} className="sg-chip-label">
            {m}
          </span>
        ))}
      </span>
      <svg className="sg-ink-shapes" width={totalW} height={H + 8} aria-hidden="true">
        <defs>
          <filter id={goo} x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b" />
            <feColorMatrix
              in="b"
              mode="matrix"
              values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 22 -10"
            />
          </filter>
        </defs>
        {geo && w && (
          <>
            <g filter={`url(#${goo})`} className="sg-ink-fill">
              <rect x={0} y={4} width={geo.barW} height={H} rx={H / 2} />
              {MODES.map((m) => {
                const c = geo.chips[m]
                const cw = chipW(m) * c.fill
                return c.fill > 0.01 ? (
                  <rect
                    key={m}
                    x={c.x}
                    y={4}
                    width={Math.max(cw, H * 0.6 * Math.min(1, c.fill * 4))}
                    height={H}
                    rx={H / 2}
                  />
                ) : null
              })}
            </g>
            <g className="sg-ink-outline">
              {MODES.map((m) => {
                const c = geo.chips[m]
                let cover = 0
                if (m !== mode)
                  for (const o of MODES) {
                    const oc = geo.chips[o]
                    if (o === m || (o !== mode && oc.fill < 0.5)) continue
                    const ov = Math.min(c.x + chipW(m), oc.x + chipW(o)) - Math.max(c.x, oc.x)
                    if (ov > 0) cover = Math.max(cover, Math.min(1, (ov / chipW(m)) * 1.6))
                  }
                const op = (1 - c.fill) * (1 - cover)
                if (op < 0.02) return null
                const amp = hover === m ? wob.amp : 0
                return (
                  <path
                    key={m}
                    d={wobblyPill(chipW(m) - 2, amp, wob.time)}
                    transform={`translate(${c.x + 1} ${5})`}
                    style={{ opacity: op }}
                  />
                )
              })}
            </g>
            <line className="sg-ink-divider" x1={divX} x2={divX} y1={4 + 11} y2={4 + H - 11} />
          </>
        )}
      </svg>
      <div className="sg-ink-count" style={{ left: BAR_PADL, height: H, top: 4 }}>
        <span ref={countRef} className="sg-ink-count-inner">
          <b>
            <Odometer value={countText} />
          </b>
          <span>{label}</span>
        </span>
      </div>
      <div
        role="radiogroup"
        aria-label="Modalità di studio"
        className="sg-ink-radios"
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
          e.preventDefault()
          const n = MODES[(MODES.indexOf(mode) + (e.key === 'ArrowRight' ? 1 : 2)) % 3]
          onChange(n)
          chipBtn.current[n]?.focus()
        }}
      >
        {geo &&
          MODES.map((m) => {
            const c = geo.chips[m]
            const cw = chipW(m)
            const inked = Math.min(1, c.fill)
            // A chip that an inked chip slides over hides under the ink instead of showing through.
            let cover = 0
            if (m !== mode)
              for (const o of MODES) {
                const oc = geo.chips[o]
                if (o === m || (o !== mode && oc.fill < 0.5)) continue
                const ov = Math.min(c.x + cw, oc.x + chipW(o)) - Math.max(c.x, oc.x)
                if (ov > 0) cover = Math.max(cover, Math.min(1, (ov / cw) * 1.6))
              }
            return (
              <button
                key={m}
                ref={(el) => {
                  chipBtn.current[m] = el
                }}
                type="button"
                role="radio"
                aria-checked={mode === m}
                tabIndex={mode === m ? 0 : -1}
                className={`sg-chip ${mode === m ? 'is-active' : ''}`}
                style={{
                  left: c.x,
                  width: cw,
                  height: H,
                  top: 4,
                  opacity: 1 - cover,
                  zIndex: c.fill > 0.5 ? 2 : 1
                }}
                onClick={() => mode !== m && onChange(m)}
                onPointerEnter={() => mode !== m && setHover(m)}
                onPointerLeave={() => setHover((h) => (h === m ? null : h))}
              >
                <span className="sg-chip-label">{m}</span>
                <span
                  className="sg-chip-label sg-chip-label-ink"
                  aria-hidden="true"
                  style={{ clipPath: `inset(0 ${(1 - inked) * 100}% 0 0)` }}
                >
                  {m}
                </span>
              </button>
            )
          })}
      </div>
    </div>
  )
}
