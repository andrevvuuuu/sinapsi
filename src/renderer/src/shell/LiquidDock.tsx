import { useEffect, useRef, useState } from 'react'
import { IconMap, IconPlan, IconReview, IconStudy, IconToday } from './icons'

export type Destination = 'Oggi' | 'Studia' | 'Ripassa' | 'Mappa' | 'Piano'

const ITEMS = [
  { id: 'Oggi' as const, icon: <IconToday /> },
  { id: 'Studia' as const, icon: <IconStudy /> },
  { id: 'Ripassa' as const, icon: <IconReview /> },
  { id: 'Mappa' as const, icon: <IconMap /> },
  { id: 'Piano' as const, icon: <IconPlan /> }
]

const ITEM_COLORS: Record<Destination, string> = {
  Oggi: 'var(--sh-violet)',
  Studia: 'var(--sh-study)',
  Ripassa: 'var(--sh-review)',
  Mappa: 'var(--sh-map)',
  Piano: 'var(--sh-plan)'
}

const DW = 364,
  DH = 64,
  TOP = 10,
  PAD = 12,
  ITEM = (DW - PAD * 2) / 5,
  R = 22,
  BW = 28

const centre = (i: number): number => PAD + ITEM / 2 + i * ITEM

const dockPath = (x: number): string => {
  const cx = Math.min(Math.max(x, R + BW), DW - R - BW)
  return [
    `M0 ${TOP + R} Q0 ${TOP} ${R} ${TOP}`,
    `L${cx - BW} ${TOP}`,
    `C${cx - BW * 0.45} ${TOP} ${cx - BW * 0.5} 0 ${cx} 0`,
    `C${cx + BW * 0.5} 0 ${cx + BW * 0.45} ${TOP} ${cx + BW} ${TOP}`,
    `L${DW - R} ${TOP} Q${DW} ${TOP} ${DW} ${TOP + R}`,
    `L${DW} ${DH - R} Q${DW} ${DH} ${DW - R} ${DH}`,
    `L${R} ${DH} Q0 ${DH} 0 ${DH - R} Z`
  ].join(' ')
}

export function LiquidDock({
  active,
  onChange
}: {
  active: Destination
  onChange: (id: Destination) => void
}): React.JSX.Element {
  const index = ITEMS.findIndex((x) => x.id === active),
    [x, setX] = useState(() => centre(index)),
    pos = useRef(centre(index)),
    vel = useRef(0)

  useEffect(() => {
    const target = centre(index),
      still = matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    const tick = (): void => {
      vel.current = (vel.current + (target - pos.current) * 0.09) * 0.74
      pos.current += vel.current
      if (still || (Math.abs(target - pos.current) < 0.2 && Math.abs(vel.current) < 0.2)) {
        pos.current = target
        setX(target)
        return
      }
      setX(pos.current)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [index])

  return (
    <nav
      className="sh-dock-wrap"
      aria-label="Sezioni principali"
      style={{ '--sh-dock-color': ITEM_COLORS[active] } as React.CSSProperties}
    >
      <div className="sh-dock">
        <span className="sh-dock-halo" style={{ left: x }} aria-hidden="true" />
        <svg className="sh-dock-shape" viewBox={`0 0 ${DW} ${DH}`} aria-hidden="true">
          <path d={dockPath(x)} />
        </svg>
        <div className="sh-dock-items">
          {ITEMS.map((d) => (
            <button
              key={d.id}
              type="button"
              className={`sh-dock-item ${d.id === active ? 'is-active' : ''}`}
              aria-current={d.id === active ? 'page' : undefined}
              aria-label={d.id}
              onClick={() => onChange(d.id)}
            >
              {d.icon}
              {d.id === active && <small aria-hidden="true">{d.id}</small>}
            </button>
          ))}
        </div>
      </div>
    </nav>
  )
}
