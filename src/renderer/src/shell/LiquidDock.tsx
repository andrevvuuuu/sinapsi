import { useEffect, useRef, useState } from 'react'
import { IconMap, IconPlan, IconReview, IconStudy, IconToday } from './icons'
import './signature.css'

export type Destination = 'Oggi' | 'Studia' | 'Ripassa' | 'Mappa' | 'Piano'

/*
 * Liquid dock (reference: «Using this menu is just so satisfying»).
 * A glass bar whose top edge swells into a tall dome over the active item; the item's icon rises
 * into the dome, lit from inside, and its label appears in the bar below. Choosing another item
 * deflates the dome into a low wide wave that travels across the bar and swells again at the
 * target, changing colour on the way; a ring ripples out from the item pressed.
 */

const ITEMS: { id: Destination; icon: React.JSX.Element; color: string }[] = [
  { id: 'Oggi', icon: <IconToday />, color: 'var(--sg-c-oggi)' },
  { id: 'Studia', icon: <IconStudy />, color: 'var(--sg-c-studia)' },
  { id: 'Ripassa', icon: <IconReview />, color: 'var(--sg-c-ripassa)' },
  { id: 'Mappa', icon: <IconMap />, color: 'var(--sg-c-mappa)' },
  { id: 'Piano', icon: <IconPlan />, color: 'var(--sg-c-piano)' }
]

// Geometry (px).
const PAD = 18
const ITEM = 72
const W = PAD * 2 + ITEM * ITEMS.length
const BAR = 60 // bar height
const DOME = 26 // dome height at rest
const TOP = DOME + 6 // room above the bar for the dome
const H = TOP + BAR
const R = 22 // bar corner radius
const SIGMA_REST = 25
const SIGMA_WAVE = 52
const H_WAVE = 6

const centre = (i: number): number => PAD + ITEM / 2 + i * ITEM

/** The whole glass shape: a rounded bar whose top edge carries a Gaussian dome. */
function shapePath(cx: number, h: number, sigma: number): string {
  const pts: string[] = []
  const step = 3
  for (let x = R; x <= W - R; x += step) {
    // Fade the dome out where the top edge turns into the corners.
    const edge = Math.min(1, (x - R) / 14, (W - R - x) / 14)
    const y = TOP - h * Math.exp(-(Math.abs((x - cx) / sigma) ** 3)) * Math.max(0, edge)
    pts.push(`${x.toFixed(1)} ${y.toFixed(2)}`)
  }
  return [
    `M0 ${TOP + R}`,
    `Q0 ${TOP} ${R} ${TOP}`,
    `L${pts.join(' L')}`,
    `L${W - R} ${TOP}`,
    `Q${W} ${TOP} ${W} ${TOP + R}`,
    `L${W} ${H - R}`,
    `Q${W} ${H} ${W - R} ${H}`,
    `L${R} ${H}`,
    `Q0 ${H} 0 ${H - R}`,
    'Z'
  ].join(' ')
}

type Ripple = { id: number; x: number }

export function LiquidDock({
  active,
  onChange
}: {
  active: Destination
  onChange: (id: Destination) => void
}): React.JSX.Element {
  const index = Math.max(
    0,
    ITEMS.findIndex((x) => x.id === active)
  )
  const [geo, setGeo] = useState(() => ({ cx: centre(index), h: DOME, sigma: SIGMA_REST }))
  const s = useRef({ cx: centre(index), vx: 0, h: DOME, vh: 0, sigma: SIGMA_REST, vs: 0 })
  const [ripples, setRipples] = useState<Ripple[]>([])
  const rippleId = useRef(0)

  useEffect(() => {
    const target = centre(index)
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    const tick = (): void => {
      const st = s.current
      if (still) {
        Object.assign(st, { cx: target, h: DOME, sigma: SIGMA_REST, vx: 0, vh: 0, vs: 0 })
        setGeo({ cx: target, h: DOME, sigma: SIGMA_REST })
        return
      }
      const far = Math.abs(target - st.cx) > 6
      // Travel: flatten and widen into a wave; arrival: swell back into a dome.
      const hT = far ? H_WAVE : DOME
      const sT = far ? SIGMA_WAVE : SIGMA_REST
      // Wait for the dome to flatten a little before it starts to travel.
      const go = st.h < DOME * 0.7 || !far ? 1 : 0.15
      st.vx = (st.vx + (target - st.cx) * 0.055 * go) * 0.8
      st.cx += st.vx
      st.vh = (st.vh + (hT - st.h) * (far ? 0.16 : 0.07)) * (far ? 0.7 : 0.8)
      st.h += st.vh
      st.vs = (st.vs + (sT - st.sigma) * 0.12) * 0.72
      st.sigma += st.vs
      setGeo({ cx: st.cx, h: st.h, sigma: st.sigma })
      const settled =
        !far &&
        Math.abs(st.vx) < 0.05 &&
        Math.abs(st.h - DOME) < 0.05 &&
        Math.abs(st.vh) < 0.05 &&
        Math.abs(st.sigma - SIGMA_REST) < 0.05
      if (settled) {
        Object.assign(st, { cx: target, h: DOME, sigma: SIGMA_REST })
        setGeo({ cx: target, h: DOME, sigma: SIGMA_REST })
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [index])

  const d = shapePath(geo.cx, geo.h, geo.sigma)
  const lift = Math.max(0, Math.min(1, geo.h / DOME))
  const color = ITEMS[index].color

  return (
    <nav
      className="sh-dock-wrap sg-dock"
      aria-label="Sezioni principali"
      style={
        {
          width: W,
          height: H,
          '--sg-dock-color': color,
          '--sh-dock-color': color,
          '--sg-cx': `${geo.cx}px`,
          '--sg-dome-top': `${TOP - geo.h}px`
        } as React.CSSProperties
      }
    >
      <div className="sg-dock-ambient" aria-hidden="true" />
      <div className="sg-dock-glass" style={{ clipPath: `path('${d}')` }} aria-hidden="true">
        <span className="sg-dock-light" />
      </div>
      <svg
        className="sg-dock-edge"
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="sg-dock-stroke" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--sg-dock-edge-a)" />
            <stop offset="0.55" stopColor="var(--sg-dock-edge-b)" />
            <stop
              offset="1"
              stopColor="color-mix(in srgb, var(--sg-dock-color) 55%, transparent)"
            />
          </linearGradient>
        </defs>
        <path d={d} />
      </svg>
      {ripples.map((r) => (
        <span
          key={r.id}
          className="sg-dock-ripple"
          style={{ left: r.x, top: TOP + BAR / 2 }}
          aria-hidden="true"
          onAnimationEnd={() => setRipples((rs) => rs.filter((x) => x.id !== r.id))}
        />
      ))}
      <div className="sg-dock-items" style={{ top: TOP, height: BAR, left: PAD, right: PAD }}>
        {ITEMS.map((it, i) => {
          const on = i === index
          // The active icon rises into the dome as it swells.
          const near = Math.max(0, 1 - Math.abs(geo.cx - centre(i)) / (ITEM * 0.5))
          const rise = on ? lift * near : 0
          return (
            <button
              key={it.id}
              type="button"
              className={`sg-dock-item ${on ? 'is-active' : ''}`}
              aria-current={on ? 'page' : undefined}
              aria-label={it.id}
              style={{ '--rise': rise } as React.CSSProperties}
              onClick={() => {
                rippleId.current += 1
                setRipples((rs) => [...rs, { id: rippleId.current, x: centre(i) }])
                onChange(it.id)
              }}
            >
              <span className="sg-dock-icon">{it.icon}</span>
              <small aria-hidden="true">{it.id}</small>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
