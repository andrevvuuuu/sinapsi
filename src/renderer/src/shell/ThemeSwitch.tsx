import { useEffect, useRef, useState } from 'react'
import type { Settings } from '../../../shared/settings-schema'
import './signature.css'

/*
 * Glass light toggle (reference: experiments.thisiswhitespace.com/glass-light-toggle).
 * A glass knob slides in a sunken track. A light strip hugs the knob and orbits it as it switches:
 * along the bottom for night (violet), along the top for day (amber), passing round the right side.
 * Its glow washes the glass, the track and the page. The icon is a pixel matrix behind the glass:
 * every moon pixel is paired with a sun pixel by angle, and the morph is scrubbed by the knob's
 * position, with a per-pixel stagger, a swirl and a little overshoot, so dragging halfway holds the
 * swarm mid-flight.
 */

// Geometry (CSS px).
const W = 84
const H = 44
const INSET = 4
const K = H - INSET * 2 // knob side
const KR = 11 // knob radius
const TRAVEL = W - INSET * 2 - K
const GRID = 15 // icon matrix, cells per side
const ICON = 24 // icon size inside the knob

type Px = { x: number; y: number; a: number }

const C = (GRID - 1) / 2

function moonPixels(): Px[] {
  const out: Px[] = []
  for (let y = 0; y < GRID; y++)
    for (let x = 0; x < GRID; x++) {
      const inDisc = (x - 6.2) ** 2 + (y - 8) ** 2 <= 5.4 ** 2
      const inBite = (x - 8.9) ** 2 + (y - 6.1) ** 2 <= 4.5 ** 2
      if (inDisc && !inBite) out.push({ x, y, a: 1 })
      else if (inDisc && inBite && (x + y) % 2 === 0) out.push({ x, y, a: 0.22 })
    }
  // Stars: a small cross and two dots.
  for (const [x, y, a] of [
    [12, 1, 0.75],
    [11, 2, 0.75],
    [12, 2, 0.9],
    [13, 2, 0.75],
    [12, 3, 0.75],
    [9, 1, 0.55],
    [13, 5, 0.6]
  ])
    out.push({ x, y, a })
  return out
}

function sunPixels(): Px[] {
  const out: Px[] = []
  for (let y = 0; y < GRID; y++)
    for (let x = 0; x < GRID; x++)
      if ((x - C) ** 2 + (y - C) ** 2 <= 2.9 ** 2) out.push({ x, y, a: 1 })
  // Eight rays: two-pixel dashes at distance 5–6.
  for (let i = 0; i < 8; i++) {
    const t = (i * Math.PI) / 4
    for (const d of [5.1, 6.3]) {
      const x = Math.round(C + Math.cos(t) * d)
      const y = Math.round(C + Math.sin(t) * d)
      if (!out.some((p) => p.x === x && p.y === y)) out.push({ x, y, a: 0.85 })
    }
  }
  return out
}

/** Pair moon and sun pixels by their angle round the centre, so the swarm swirls instead of crossing. */
function pairPixels(): { m: Px; s: Px; delay: number }[] {
  const byAngle = (p: Px): number => Math.atan2(p.y - C, p.x - C)
  const m = moonPixels().sort((a, b) => byAngle(a) - byAngle(b))
  const s = sunPixels().sort((a, b) => byAngle(a) - byAngle(b))
  const n = Math.max(m.length, s.length)
  return Array.from({ length: n }, (_, k) => ({
    m: m[Math.floor((k * m.length) / n)],
    s: s[Math.floor((k * s.length) / n)],
    // Deterministic pseudo-random stagger in [0, .38].
    delay: ((((Math.sin(k * 12.9898) * 43758.5453) % 1) + 1) % 1) * 0.38
  }))
}

const PAIRS = pairPixels()

const clamp = (v: number, a = 0, b = 1): number => Math.min(b, Math.max(a, v))
const easeOutBack = (t: number): number => {
  const c1 = 1.4
  return 1 + (c1 + 1) * (t - 1) ** 3 + c1 * (t - 1) ** 2
}
const mix = (a: number, b: number, t: number): number => a + (b - a) * t

function drawIcon(ctx: CanvasRenderingContext2D, u: number, dpr: number): void {
  const size = ICON * dpr
  ctx.clearRect(0, 0, size, size)
  const pitch = size / GRID
  const cell = pitch * 0.78
  const centre = size / 2
  // Pixel colour: soft white at night, graphite by day.
  const r = Math.round(mix(246, 52, u))
  const g = Math.round(mix(240, 50, u))
  const b = Math.round(mix(236, 48, u))
  for (const p of PAIRS) {
    const t = easeOutBack(clamp((u - p.delay) / 0.62))
    const tl = clamp(t)
    const mx = (p.m.x + 0.5) * pitch
    const my = (p.m.y + 0.5) * pitch
    const sx = (p.s.x + 0.5) * pitch
    const sy = (p.s.y + 0.5) * pitch
    let x = mix(mx, sx, t)
    let y = mix(my, sy, t)
    // Swirl: a rotation round the centre that peaks mid-flight.
    const swirl = Math.sin(Math.PI * tl) * 0.9
    const dx = x - centre
    const dy = y - centre
    x = centre + dx * Math.cos(swirl) - dy * Math.sin(swirl)
    y = centre + dx * Math.sin(swirl) + dy * Math.cos(swirl)
    const shrink = 1 - Math.sin(Math.PI * tl) * 0.35
    const a = mix(p.m.a, p.s.a, tl)
    const c = cell * shrink
    ctx.fillStyle = `rgba(${r},${g},${b},${a})`
    ctx.fillRect(x - c / 2, y - c / 2, c, c)
  }
}

/** The knob outline (offset outward by `o`) as a path that starts at the bottom centre and runs
 *  anticlockwise on screen: right along the bottom, up the right side, left along the top, and back. */
function knobPath(o: number): { d: string; len: number } {
  const x0 = -o
  const y0 = -o
  const s = K + o * 2
  const r = KR + o
  const h = s / 2
  const straight = s - r * 2
  const arc = (Math.PI * r) / 2
  const d = [
    `M${x0 + h} ${y0 + s}`,
    `L${x0 + s - r} ${y0 + s}`,
    `A${r} ${r} 0 0 0 ${x0 + s} ${y0 + s - r}`,
    `L${x0 + s} ${y0 + r}`,
    `A${r} ${r} 0 0 0 ${x0 + s - r} ${y0}`,
    `L${x0 + r} ${y0}`,
    `A${r} ${r} 0 0 0 ${x0} ${y0 + r}`,
    `L${x0} ${y0 + s - r}`,
    `A${r} ${r} 0 0 0 ${x0 + r} ${y0 + s}`,
    'Z'
  ].join(' ')
  return { d, len: straight * 4 + arc * 4 }
}

const STRIP = knobPath(1.5)

export function ThemeSwitch({
  theme,
  onChange
}: {
  theme: Settings['theme']
  onChange: (theme: Settings['theme']) => void
}): React.JSX.Element {
  const light = theme === 'trattato'
  const [u, setU] = useState(light ? 1 : 0)
  const uRef = useRef(u)
  const vel = useRef(0)
  const target = useRef(light ? 1 : 0)
  const drag = useRef<{ x0: number; u0: number; moved: boolean } | null>(null)
  const raf = useRef(0)
  const canvas = useRef<HTMLCanvasElement>(null)
  const still = useRef(false)

  // Spring the knob towards the target; stop when it settles.
  const run = (): void => {
    cancelAnimationFrame(raf.current)
    const tick = (): void => {
      if (drag.current) return
      if (still.current) {
        uRef.current = target.current
        setU(target.current)
        return
      }
      vel.current = (vel.current + (target.current - uRef.current) * 0.03) * 0.84
      uRef.current += vel.current
      if (Math.abs(target.current - uRef.current) < 0.0015 && Math.abs(vel.current) < 0.0015) {
        uRef.current = target.current
        setU(target.current)
        return
      }
      setU(uRef.current)
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }

  useEffect(() => {
    still.current = matchMedia('(prefers-reduced-motion: reduce)').matches
    return () => cancelAnimationFrame(raf.current)
  }, [])

  // A theme change from elsewhere (settings, system) moves the knob too.
  useEffect(() => {
    const t = light ? 1 : 0
    if (t !== target.current && !drag.current) {
      target.current = t
      run()
    }
    // run is stable enough: it only touches refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [light])

  useEffect(() => {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const dpr = Math.max(2, Math.round(window.devicePixelRatio || 1))
    if (c.width !== ICON * dpr) {
      c.width = ICON * dpr
      c.height = ICON * dpr
    }
    drawIcon(ctx, clamp(u), dpr)
  }, [u])

  const commit = (next: 0 | 1): void => {
    target.current = next
    run()
    if ((next === 1) !== light) onChange(next === 1 ? 'trattato' : 'lavagna')
  }

  const p = clamp(u)
  // The strip's centre runs from the bottom centre (0) to the top centre (half the perimeter).
  const dash = STRIP.len * 0.44
  const centre = (p * STRIP.len) / 2
  const stripStyle = {
    strokeDasharray: `${dash} ${STRIP.len - dash}`,
    strokeDashoffset: dash / 2 - centre
  }

  return (
    <div className="sh-theme-row">
      <span>Tema</span>
      <button
        type="button"
        role="switch"
        aria-checked={light}
        aria-label={light ? 'Passa al tema scuro (lavagna)' : 'Passa al tema chiaro (trattato)'}
        className="sg-toggle"
        style={
          {
            '--p': p,
            '--knob-x': `${INSET + TRAVEL * u}px`,
            width: W,
            height: H
          } as React.CSSProperties
        }
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          cancelAnimationFrame(raf.current)
          drag.current = { x0: e.clientX, u0: uRef.current, moved: false }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d) return
          const dx = e.clientX - d.x0
          if (Math.abs(dx) > 3) d.moved = true
          if (!d.moved) return
          uRef.current = clamp(d.u0 + dx / TRAVEL, -0.06, 1.06)
          setU(uRef.current)
        }}
        onPointerUp={() => {
          const d = drag.current
          drag.current = null
          if (!d) return
          vel.current = 0
          if (d.moved) commit(uRef.current > 0.5 ? 1 : 0)
          else commit(light ? 0 : 1)
        }}
        onPointerCancel={() => {
          drag.current = null
          commit(light ? 1 : 0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            commit(light ? 0 : 1)
          }
        }}
      >
        <span className="sg-toggle-spill" aria-hidden="true" />
        <span className="sg-toggle-track" aria-hidden="true" />
        <span
          className="sg-toggle-knob"
          aria-hidden="true"
          style={{ width: K, height: K, borderRadius: KR }}
        >
          <span className="sg-toggle-bloom" />
          <canvas ref={canvas} className="sg-toggle-icon" style={{ width: ICON, height: ICON }} />
        </span>
        <svg
          className="sg-toggle-strip"
          aria-hidden="true"
          width={K + 12}
          height={K + 12}
          viewBox={`-6 -6 ${K + 12} ${K + 12}`}
        >
          <path className="sg-strip-glow" d={STRIP.d} style={stripStyle} />
          <path className="sg-strip-core" d={STRIP.d} style={stripStyle} />
        </svg>
      </button>
    </div>
  )
}
