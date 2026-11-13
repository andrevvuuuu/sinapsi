import { useId, useLayoutEffect, useRef } from 'react'
import './signature.css'

const MODES = ['Studia', 'Esercitati', 'Ripassa'] as const
export type Mode = (typeof MODES)[number]

/** Pill height, horizontal padding of a chip, inset of a 1.5 px outline. */
const H = 38
const PAD = 16
const EDGE = 0.75
/** How far the count's capsule runs past the divider under the active mode's: the overlap that leaves a slight waist. */
const WAIST = 14

/** Analytical damped harmonic oscillator over an arbitrary time step. */
function solveSpring(
  current: number,
  velocity: number,
  target: number,
  stiffness: number,
  damping: number,
  dt: number
): [number, number] {
  const omega0 = Math.sqrt(stiffness)
  const zeta = damping / (2 * omega0)
  const x = current - target
  if (zeta < 1) {
    const omegaD = omega0 * Math.sqrt(1 - zeta * zeta)
    const decay = Math.exp(-zeta * omega0 * dt)
    const cos = Math.cos(omegaD * dt)
    const sin = Math.sin(omegaD * dt)
    const nextX = decay * (x * cos + ((velocity + zeta * omega0 * x) / omegaD) * sin)
    const nextV =
      decay * (velocity * (cos - ((zeta * omega0) / omegaD) * sin) - x * ((omega0 * omega0) / omegaD) * sin)
    return [target + nextX, nextV]
  }
  const decay = Math.exp(-omega0 * dt)
  return [target + decay * (x + (velocity + omega0 * x) * dt), decay * (velocity * (1 - omega0 * dt) - x * omega0 * omega0 * dt)]
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/**
 * A pill from x to x + w, H tall. `dip` pulls the top and bottom edges inward around `cx`: the elastic pinch
 * under the cursor. Narrower than its height it becomes an ellipse, the shape a drop of ink starts from.
 */
function pillPath(x: number, w: number, inset = 0, dip = 0, cx = 0): string {
  const r = H / 2 - inset
  if (w <= 0.5) return ''
  if (w < 2 * r) {
    const rx = w / 2
    return `M${(x).toFixed(2)},${H / 2}a${rx.toFixed(2)},${r} 0 1,0 ${w.toFixed(2)},0a${rx.toFixed(2)},${r} 0 1,0 ${(-w).toFixed(2)},0Z`
  }
  const x0 = x + r
  const x1 = x + w - r
  const top = inset
  const bot = H - inset
  const n = dip > 0.05 ? 18 : 1
  const g = (px: number): number => dip * Math.exp(-(((px - cx) / 18) ** 2))
  let d = `M${x0.toFixed(2)},${(top + g(x0)).toFixed(2)}`
  for (let i = 1; i <= n; i++) {
    const px = x0 + ((x1 - x0) * i) / n
    d += `L${px.toFixed(2)},${(top + g(px)).toFixed(2)}`
  }
  d += `A${r},${r} 0 0 1 ${x1.toFixed(2)},${(bot - g(x1)).toFixed(2)}`
  for (let i = n - 1; i >= 0; i--) {
    const px = x0 + ((x1 - x0) * i) / n
    d += `L${px.toFixed(2)},${(bot - g(px)).toFixed(2)}`
  }
  return `${d}A${r},${r} 0 0 1 ${x0.toFixed(2)},${(top + g(x0)).toFixed(2)}Z`
}

/** Digits that roll vertically, one column each, slightly staggered, like an odometer. */
function Odometer({ value }: { value: string }): React.JSX.Element {
  return (
    <span className="sg-odo" aria-label={value}>
      {value.split('').map((ch, i) =>
        /\d/.test(ch) ? (
          // Keyed from the right, so the units column keeps rolling when the count gains or loses a digit.
          <span key={value.length - 1 - i} className="sg-odo-col" aria-hidden="true">
            <span
              className="sg-odo-strip"
              style={{ transform: `translateY(${-Number(ch)}em)`, transitionDelay: `${i * 45}ms` }}
            >
              {'0123456789'.split('').map((d) => (
                <span key={d}>{d}</span>
              ))}
            </span>
          </span>
        ) : (
          <span key={`c${value.length - 1 - i}`} aria-hidden="true">
            {ch}
          </span>
        )
      )}
    </span>
  )
}

type Span = { x: number; w: number }
type Wobble = { amp: number; vel: number; target: number; cx: number }
type Snapshot = { from: Mode; to: Mode; other: Mode; cEnd: number; aStart: Span; tStart: Span; oStart: number | null }

/**
 * The study mode filter of the composer, after the reference video: a results pill (count | active mode) and the
 * other two modes as outlined chips. Choosing a chip runs two overlapping springs: the active mode detaches (its
 * ink drains back to the left, the viscous neck to the bar stretches and snaps), then the chosen one slides over
 * and docks (a neck forms, ink flows in from the contact edge, its letters turn dark as the ink passes). The fills
 * live on one gooey SVG layer; the text never goes through the filter. Hovering pinches a pill's edge under the
 * cursor.
 */
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
  const gooId = `sg-goo-${useId().replace(/:/g, '')}`
  const rootRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const countRef = useRef<HTMLSpanElement>(null)
  const dividerRef = useRef<HTMLSpanElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)
  const chipRefs = useRef<Partial<Record<Mode, HTMLButtonElement | null>>>({})
  const edgeRefs = useRef<Partial<Record<Mode, SVGPathElement | null>>>({})
  const barPathRef = useRef<SVGPathElement>(null)
  const slotPathRef = useRef<SVGPathElement>(null)
  const blobRefs = [useRef<SVGPathElement>(null), useRef<SVGPathElement>(null)]
  const actorRefs = [useRef<HTMLSpanElement>(null), useRef<HTMLSpanElement>(null)]
  const wobble = useRef<Record<string, Wobble>>({})
  const wobbleRaf = useRef(0)
  const animRaf = useRef(0)
  const animating = useRef(false)
  const snap = useRef<Snapshot | null>(null)

  const count = mode === 'Ripassa' ? due : mode === 'Esercitati' ? practiceCount : studyCount
  const countText = count == null ? '—' : String(count)
  const label = mode === 'Ripassa' ? 'dovuti' : 'suggerimenti'
  const outer = MODES.filter((m) => m !== mode)

  const rel = (el: Element): Span => {
    const c = rootRef.current!.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    return { x: r.left - c.left, w: r.width }
  }

  /** The resting shapes: the bar's fill and the chips' outlines, with the current pinch. */
  const drawStatic = (): void => {
    if (animating.current || !rootRef.current || !barRef.current) return
    const b = rel(barRef.current)
    const wb = wobble.current.bar
    const dip = wb?.amp ?? 0
    const cx = (wb?.cx ?? 0) + b.x
    // Two capsules on the gooey layer: the count's, and the active mode's from the divider to the end. Their overlap
    // reads as one body with a slight waist at the joint, as in the video.
    const j = dividerRef.current ? rel(dividerRef.current).x + 0.5 : b.x + b.w / 2
    barPathRef.current?.setAttribute('d', pillPath(b.x, j + WAIST - b.x, 0, dip, cx))
    slotPathRef.current?.setAttribute('d', pillPath(j - 4, b.x + b.w - (j - 4), 0, dip, cx))
    for (const m of MODES) {
      const btn = chipRefs.current[m]
      const path = edgeRefs.current[m]
      if (!btn || !path) continue
      const wo = wobble.current[m]
      path.setAttribute('d', pillPath(0, btn.getBoundingClientRect().width, EDGE, wo?.amp ?? 0, wo?.cx ?? 0))
    }
  }

  const reduced = (): boolean =>
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

  /** One loop for every pinch: a soft, bouncy spring towards 3 px while hovered, back to flat after. */
  const kickWobble = (): void => {
    if (wobbleRaf.current) return
    let last = performance.now()
    const step = (now: number): void => {
      const dt = Math.min(Math.max((now - last) / 1000, 0.001), 0.033)
      last = now
      let moving = false
      for (const s of Object.values(wobble.current)) {
        ;[s.amp, s.vel] = solveSpring(s.amp, s.vel, s.target, 420, s.target > 0 ? 13 : 41, dt)
        if (s.amp < 0) [s.amp, s.vel] = [0, 0]
        if (Math.abs(s.amp - s.target) > 0.02 || Math.abs(s.vel) > 0.05) moving = true
      }
      drawStatic()
      wobbleRaf.current = moving ? requestAnimationFrame(step) : 0
    }
    wobbleRaf.current = requestAnimationFrame(step)
  }

  const pinch = (key: string): React.HTMLAttributes<HTMLElement> => ({
    onPointerMove: (e) => {
      if (reduced()) return
      const s = (wobble.current[key] ??= { amp: 0, vel: 0, target: 0, cx: 0 })
      s.cx = e.clientX - e.currentTarget.getBoundingClientRect().left
      s.target = 3
      kickWobble()
    },
    onPointerLeave: () => {
      const s = wobble.current[key]
      if (!s) return
      s.target = 0
      kickWobble()
    }
  })

  /** Ends a running transition at once: the real elements take over from the actors. */
  const finish = (): void => {
    cancelAnimationFrame(animRaf.current)
    animRaf.current = 0
    if (!animating.current) return
    animating.current = false
    rootRef.current?.classList.remove('is-animating')
    for (const a of actorRefs) if (a.current) a.current.style.display = 'none'
    for (const b of blobRefs) b.current?.setAttribute('d', '')
    if (activeRef.current) activeRef.current.style.visibility = ''
    if (dividerRef.current) dividerRef.current.style.opacity = ''
    for (const m of MODES) {
      const btn = chipRefs.current[m]
      if (btn) {
        btn.style.visibility = ''
        btn.style.transform = ''
      }
    }
    drawStatic()
  }

  const select = (target: Mode): void => {
    if (target === mode) return
    finish()
    const bar = barRef.current
    const act = activeRef.current
    const tChip = chipRefs.current[target]
    if (!rootRef.current || !bar || !act || !tChip || reduced()) {
      onChange(target)
      return
    }
    const other = MODES.find((m) => m !== mode && m !== target)!
    const oChip = chipRefs.current[other]
    const a = rel(act)
    snap.current = {
      from: mode,
      to: target,
      other,
      cEnd: (dividerRef.current ? rel(dividerRef.current).x + 0.5 : rel(bar).x + rel(bar).w) + WAIST,
      aStart: { x: a.x - PAD, w: a.w + 2 * PAD },
      tStart: rel(tChip),
      oStart: oChip ? rel(oChip).x : null
    }
    onChange(target)
  }

  // Resting shapes after every render, once the fonts are in, and whenever the filter resizes.
  useLayoutEffect(() => {
    drawStatic()
  })
  useLayoutEffect(() => {
    let alive = true
    void document.fonts?.ready.then(() => alive && drawStatic())
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => drawStatic()) : null
    if (rootRef.current) ro?.observe(rootRef.current)
    return () => {
      alive = false
      ro?.disconnect()
      cancelAnimationFrame(wobbleRaf.current)
      cancelAnimationFrame(animRaf.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The transition, from the snapshot taken before the change to the layout React has just committed.
  useLayoutEffect(() => {
    const s = snap.current
    snap.current = null
    const root = rootRef.current
    const bar = barRef.current
    const act = activeRef.current
    const countEl = countRef.current
    const aChip = s ? chipRefs.current[s.from] : null
    if (!s || s.to !== mode || !root || !bar || !act || !countEl || !aChip) return
    const oChip = chipRefs.current[s.other]
    const b = rel(bar)
    const tIn = rel(act)
    const aEnd = rel(aChip)
    const oEnd = oChip ? rel(oChip).x : null
    const cEnd = (dividerRef.current ? rel(dividerRef.current).x + 0.5 : tIn.x - 12) + WAIST
    const tEnd = tIn.x - PAD
    slotPathRef.current?.setAttribute('d', '')

    const actors = actorRefs.map((r) => r.current)
    const texts: [Mode, Mode] = [s.from, s.to]
    actors.forEach((el, i) => {
      if (!el) return
      el.style.display = 'flex'
      // First frame at the start positions, before the loop moves them.
      const start = i === 0 ? s.aStart : s.tStart
      el.style.transform = `translate3d(${start.x.toFixed(2)}px,0,0)`
      el.style.width = `${start.w.toFixed(2)}px`
      el.querySelectorAll<HTMLElement>('.base, .ink').forEach((t) => (t.textContent = texts[i]))
    })
    animating.current = true
    root.classList.add('is-animating')
    act.style.visibility = 'hidden'
    aChip.style.visibility = 'hidden'

    let p1 = 0
    let v1 = 0
    let p2 = 0
    let v2 = 0
    let docking = false
    let last = performance.now()
    const tick = (now: number): void => {
      const dt = Math.min(Math.max((now - last) / 1000, 0.001), 0.033)
      last = now
      ;[p1, v1] = solveSpring(p1, v1, 1, 380, 28, dt)
      if (!docking && p1 > 0.22) docking = true
      if (docking) [p2, v2] = solveSpring(p2, v2, 1, 380, 33, dt)

      // The count's capsule stays put (it only follows a change of the count's width); the modes come and go.
      barPathRef.current?.setAttribute('d', pillPath(b.x, lerp(s.cEnd, cEnd, clamp01(p1)) - b.x))
      if (dividerRef.current) dividerRef.current.style.opacity = String(docking ? 0.3 * clamp01(p2) : 0.3 * (1 - clamp01(p1)))

      // Leaving: slides right, its ink drains back towards the bar (the right side clears first).
      const xa = lerp(s.aStart.x, aEnd.x, p1)
      const wa = lerp(s.aStart.w, aEnd.w, clamp01(p1))
      const fa = 1 - clamp01((p1 - 0.08) / 0.55)
      blobRefs[0].current?.setAttribute('d', pillPath(xa, wa * fa))
      // Arriving: slides left over the other chip, ink flows in from the contact edge once it is close.
      const xt = lerp(s.tStart.x, tEnd, p2)
      const ft = clamp01((p2 - 0.28) / 0.55)
      // Until it starts moving it waits at its old place as an outline (the real chip has already left the DOM).
      blobRefs[1].current?.setAttribute('d', pillPath(xt, s.tStart.w * ft))

      const place = (el: HTMLSpanElement | null, x: number, w: number, fill: number): void => {
        if (!el) return
        el.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`
        el.style.width = `${w.toFixed(2)}px`
        // A chip in flight is opaque, so it hides what it slides over (as in the video); its ink is a disc grown
        // from the contact edge, and the same disc reveals the dark letters.
        const r = fill * Math.hypot(w, H / 2)
        el.style.background = `radial-gradient(circle at 0% 50%,var(--sh-send-bg,#7664c2) ${r.toFixed(2)}px,var(--sh-card-solid,#1c1f26) ${(r + 0.8).toFixed(2)}px)`
        const ink = el.querySelector<HTMLElement>('.ink')
        if (ink) ink.style.clipPath = `circle(${r.toFixed(2)}px at 0% 50%)`
        const edge = el.querySelector<SVGPathElement>('path')
        if (edge) {
          edge.setAttribute('d', pillPath(0, w, EDGE))
          edge.style.opacity = (1 - fill).toFixed(3)
        }
      }
      place(actors[0], xa, wa, fa)
      place(actors[1], xt, s.tStart.w, ft)
      if (oChip && s.oStart !== null && oEnd !== null) {
        oChip.style.transform = `translate3d(${((s.oStart - oEnd) * (1 - p1)).toFixed(2)}px,0,0)`
      }

      const settled = p1 > 0.999 && Math.abs(v1) < 0.01 && p2 > 0.999 && Math.abs(v2) < 0.01
      if (settled) finish()
      else animRaf.current = requestAnimationFrame(tick)
    }
    animRaf.current = requestAnimationFrame(tick)
    // A mode changed from outside mid-flight (or an unmount) ends this transition cleanly instead of orphaning it.
    return () => finish()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  return (
    <div
      ref={rootRef}
      className="sg-ink"
      role="radiogroup"
      aria-label="Modalità di studio"
      onKeyDown={(e) => {
        const step = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: 2, ArrowUp: 2 } as Record<string, number | undefined>)[e.key]
        if (!step) return
        e.preventDefault()
        select(MODES[(MODES.indexOf(mode) + step) % 3])
      }}
    >
      <svg className="sg-ink-shapes" aria-hidden="true">
        <defs>
          <filter id={gooId} x="-20%" y="-60%" width="140%" height="220%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" />
          </filter>
        </defs>
        <g className="sg-ink-fill" filter={`url(#${gooId})`}>
          <path ref={barPathRef} />
          <path ref={slotPathRef} />
          <path ref={blobRefs[0]} />
          <path ref={blobRefs[1]} />
        </g>
      </svg>

      <div ref={barRef} className="sg-ink-main" {...pinch('bar')}>
        <span ref={countRef} className="sg-ink-count">
          <b>
            <Odometer value={countText} />
          </b>
          <span>{label}</span>
        </span>
        <span ref={dividerRef} className="sg-ink-divider" aria-hidden="true" />
        <button
          ref={activeRef}
          type="button"
          role="radio"
          aria-checked="true"
          tabIndex={0}
          aria-label={mode}
          className="sg-chip-active"
        >
          {mode}
        </button>
      </div>

      {outer.map((m) => (
        <button
          key={m}
          ref={(el) => {
            chipRefs.current[m] = el
          }}
          type="button"
          role="radio"
          aria-checked="false"
          tabIndex={-1}
          aria-label={m}
          className="sg-chip-inactive"
          onClick={() => select(m)}
          {...pinch(m)}
        >
          <svg className="sg-chip-edge" aria-hidden="true">
            <path
              ref={(el) => {
                edgeRefs.current[m] = el
              }}
            />
          </svg>
          <span>{m}</span>
        </button>
      ))}

      {/* The two chips in flight during a change: an outline, the light label and the dark label the ink reveals. */}
      {[0, 1].map((i) => (
        <span key={i} ref={actorRefs[i]} className="sg-ink-actor" aria-hidden="true">
          <svg>
            <path />
          </svg>
          <span className="base" />
          <span className="ink" />
        </span>
      ))}
    </div>
  )
}
