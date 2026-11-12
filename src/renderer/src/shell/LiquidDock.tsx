import { useCallback, useEffect, useRef, useState } from 'react'
import { IconMap, IconPlan, IconToday } from './icons'
import './signature.css'

export type Destination = 'Oggi' | 'Mappa' | 'Piano'

/*
 * Liquid dock (reference: «Using this menu is just so satisfying»).
 * A glass bar whose top edge swells into a tall dome over the active item; the item's icon rises
 * into the dome, lit from inside, and its label appears in the bar below. Choosing another item
 * deflates the dome into a low wide wave that travels across the bar and swells again at the
 * target, changing colour on the way; a ring ripples out from the item pressed.
 */

interface ItemConfig {
  id: Destination
  icon: React.JSX.Element
  colorVar: string
  rgbDark: [number, number, number]
  rgbLight: [number, number, number]
}

const ITEMS: ItemConfig[] = [
  {
    id: 'Oggi',
    icon: <IconToday />,
    colorVar: '--sg-c-oggi',
    rgbDark: [155, 123, 255],
    rgbLight: [122, 92, 240]
  },
  {
    id: 'Mappa',
    icon: <IconMap />,
    colorVar: '--sg-c-mappa',
    rgbDark: [242, 184, 75],
    rgbLight: [184, 117, 3]
  },
  {
    id: 'Piano',
    icon: <IconPlan />,
    colorVar: '--sg-c-piano',
    rgbDark: [79, 209, 139],
    rgbLight: [29, 138, 84]
  }
]

// Geometry (px) — scaled for 3 items.
const PAD = 16
const ITEM_W = 72
const COUNT = ITEMS.length
const W = PAD * 2 + ITEM_W * COUNT // 248px
const BAR = 56 // bar height
const DOME = 24 // dome height at rest
const TOP = DOME + 6 // 30px room above bar for dome
const H = TOP + BAR // 86px total dock height
const R = 20 // bar corner radius
const SIGMA_REST = 26
const SIGMA_WAVE = 46
const H_WAVE = 6
const H_HOVER = 4
const SIGMA_HOVER = 22

const centre = (i: number): number => PAD + ITEM_W / 2 + i * ITEM_W

/**
 * Generates the SVG path for the entire glass dock shape:
 * a rounded rectangle whose top edge carries a smooth liquid dome and/or hover swell.
 */
function shapePath(
  cx: number,
  h: number,
  sigma: number,
  hoverCx: number,
  hoverH: number,
  hoverSigma: number
): string {
  const pts: string[] = []
  const step = 2

  for (let x = R; x <= W - R; x += step) {
    // Fade bumps out where the top edge turns into the corners.
    const edge = Math.min(1, Math.max(0, (x - R) / 12), Math.max(0, (W - R - x) / 12))

    let bump = 0
    if (h > 0.01) {
      const activeDist = Math.abs((x - cx) / sigma)
      bump = h * Math.exp(-(activeDist ** 2.8))
    }

    if (hoverH > 0.01) {
      const hoverDist = Math.abs((x - hoverCx) / hoverSigma)
      const hBump = hoverH * Math.exp(-(hoverDist ** 2.4))
      bump = Math.max(bump, hBump)
    }

    const y = TOP - bump * edge
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

/**
 * Exact analytical damped harmonic oscillator solver over arbitrary time step dt.
 * Completely immune to refresh rate differences (60Hz, 120Hz, 144Hz) and seamlessly
 * interruptible at any moment without jerk or discontinuity.
 */
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
    const cosVal = Math.cos(omegaD * dt)
    const sinVal = Math.sin(omegaD * dt)

    const nextX = decay * (x * cosVal + ((velocity + zeta * omega0 * x) / omegaD) * sinVal)
    const nextV =
      decay *
      (velocity * (cosVal - ((zeta * omega0) / omegaD) * sinVal) -
        x * ((omega0 * omega0) / omegaD) * sinVal)
    return [target + nextX, nextV]
  } else {
    const decay = Math.exp(-omega0 * dt)
    const nextX = decay * (x + (velocity + omega0 * x) * dt)
    const nextV = decay * (velocity * (1 - omega0 * dt) - x * (omega0 * omega0) * dt)
    return [target + nextX, nextV]
  }
}

type Ripple = { id: number; x: number; colorVar: string }

export function LiquidDock({
  active,
  onChange
}: {
  /** null on screens that are not a dock destination: the dome settles flat and nothing is lit. */
  active: Destination | null
  onChange: (id: Destination) => void
}): React.JSX.Element {
  const index = active ? ITEMS.findIndex((x) => x.id === active) : -1
  const [ripples, setRipples] = useState<Ripple[]>([])
  const rippleIdRef = useRef(0)

  // Direct DOM references for frame-by-frame updates without React re-renders.
  const navRef = useRef<HTMLElement | null>(null)
  const glassRef = useRef<HTMLDivElement | null>(null)
  const pathRef = useRef<SVGPathElement | null>(null)
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Continuous physics and animation state.
  const initCx = centre(Math.max(0, index))
  const initH = index < 0 ? 0 : DOME
  const isLightInit =
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'trattato'
  const initColor: [number, number, number] =
    index >= 0
      ? isLightInit
        ? ITEMS[index].rgbLight
        : ITEMS[index].rgbDark
      : isLightInit
        ? [100, 101, 106]
        : [165, 166, 174]

  const physics = useRef({
    targetIndex: index,
    cx: initCx,
    vx: 0,
    h: initH,
    vh: 0,
    sigma: SIGMA_REST,
    vs: 0,
    hoverIndex: -1,
    hoverH: 0,
    vHoverH: 0,
    hoverLift: [0, 0, 0] as [number, number, number],
    vHoverLift: [0, 0, 0] as [number, number, number],
    pressedIndex: -1,
    pressScale: [1, 1, 1] as [number, number, number],
    vPressScale: [0, 0, 0] as [number, number, number],
    labelOpacity: [index === 0 ? 1 : 0, index === 1 ? 1 : 0, index === 2 ? 1 : 0] as [
      number,
      number,
      number
    ],
    vLabelOpacity: [0, 0, 0] as [number, number, number],
    labelSlide: [index === 0 ? 0 : 4, index === 1 ? 0 : 4, index === 2 ? 0 : 4] as [
      number,
      number,
      number
    ],
    vLabelSlide: [0, 0, 0] as [number, number, number],
    glowOpacity: index >= 0 ? 1 : 0,
    vGlowOpacity: 0,
    colorRgb: [...initColor] as [number, number, number],
    lastTime: 0,
    isAnimating: false
  })

  // Core rAF loop trigger.
  const rafId = useRef<number>(0)

  const applyDomUpdates = useCallback(
    (d: string, cx: number, h: number, glow: number, rgb: [number, number, number]): void => {
      if (pathRef.current) {
        pathRef.current.setAttribute('d', d)
      }
      if (glassRef.current) {
        glassRef.current.style.clipPath = `path('${d}')`
      }
      if (navRef.current) {
        const colorStr = `rgb(${Math.round(rgb[0])} ${Math.round(rgb[1])} ${Math.round(rgb[2])})`
        navRef.current.style.setProperty('--sg-cx', `${cx.toFixed(2)}px`)
        navRef.current.style.setProperty('--sg-dome-top', `${(TOP - h).toFixed(2)}px`)
        navRef.current.style.setProperty('--sg-dock-color', colorStr)
        navRef.current.style.setProperty('--sh-dock-color', colorStr)
        navRef.current.style.setProperty('--sg-glow-opacity', glow.toFixed(3))
      }
    },
    []
  )

  const startAnimation = useCallback((): void => {
    const st = physics.current
    if (st.isAnimating) return
    st.isAnimating = true
    st.lastTime = 0

    const tick = (now: number): void => {
      const reducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches

      const tIdx = st.targetIndex
      const targetCx = tIdx >= 0 ? centre(tIdx) : st.cx
      const isLight =
        typeof document !== 'undefined' && document.documentElement.dataset.theme === 'trattato'
      const targetColor: [number, number, number] =
        tIdx >= 0
          ? isLight
            ? ITEMS[tIdx].rgbLight
            : ITEMS[tIdx].rgbDark
          : isLight
            ? [100, 101, 106]
            : [165, 166, 174]
      const targetGlow = tIdx >= 0 ? 1 : 0

      if (reducedMotion) {
        st.cx = targetCx
        st.vx = 0
        st.h = tIdx >= 0 ? DOME : 0
        st.vh = 0
        st.sigma = SIGMA_REST
        st.vs = 0
        st.hoverH = 0
        st.vHoverH = 0
        st.colorRgb = [...targetColor]
        st.glowOpacity = targetGlow
        st.hoverLift = [0, 0, 0]
        st.pressScale = [1, 1, 1]
        st.labelOpacity = [tIdx === 0 ? 1 : 0, tIdx === 1 ? 1 : 0, tIdx === 2 ? 1 : 0]
        st.labelSlide = [0, 0, 0]

        for (let i = 0; i < COUNT; i++) {
          const btn = buttonRefs.current[i]
          if (btn) {
            btn.style.setProperty('--rise', i === tIdx ? '1' : '0')
            btn.style.setProperty('--hover-lift', '0px')
            btn.style.setProperty('--press-scale', '1')
            btn.style.setProperty('--label-opacity', i === tIdx ? '1' : '0')
            btn.style.setProperty('--label-slide', '0px')
          }
        }
        const d = shapePath(st.cx, st.h, st.sigma, st.cx, 0, SIGMA_HOVER)
        applyDomUpdates(d, st.cx, st.h, st.glowOpacity, st.colorRgb)
        st.isAnimating = false
        return
      }

      if (st.lastTime === 0) {
        st.lastTime = now
      }
      const dt = Math.min(Math.max((now - st.lastTime) / 1000, 0.001), 0.04)
      st.lastTime = now

      // Distance from active destination
      const dist = Math.abs(targetCx - st.cx)

      // Dome / wave height & width targets
      let targetH: number
      let targetSigma: number
      if (tIdx >= 0) {
        // As the dome departs from an item, smoothstep into a traveling wave;
        // as it approaches target, swell back into the dome.
        const travelT = Math.max(0, Math.min(1, (dist - 6) / 16))
        const smoothT = travelT * travelT * (3 - 2 * travelT)
        targetH = DOME * (1 - smoothT) + H_WAVE * smoothT
        targetSigma = SIGMA_REST * (1 - smoothT) + SIGMA_WAVE * smoothT
      } else {
        targetH = 0
        targetSigma = SIGMA_REST
      }

      // 1. Solve dome motion springs
      ;[st.cx, st.vx] = solveSpring(st.cx, st.vx, targetCx, 240, 25, dt)
      const hStiffness = targetH < st.h ? 320 : 230
      const hDamping = targetH < st.h ? 28 : 24
      ;[st.h, st.vh] = solveSpring(st.h, st.vh, targetH, hStiffness, hDamping, dt)
      ;[st.sigma, st.vs] = solveSpring(st.sigma, st.vs, targetSigma, 220, 24, dt)

      // 2. Solve hover bump spring
      let targetHoverH = 0
      const hoverIndex = st.hoverIndex
      const hoverCx = hoverIndex >= 0 ? centre(hoverIndex) : centre(0)
      if (hoverIndex >= 0 && hoverIndex !== tIdx) {
        targetHoverH = H_HOVER
      }
      ;[st.hoverH, st.vHoverH] = solveSpring(st.hoverH, st.vHoverH, targetHoverH, 260, 26, dt)

      // 3. Solve per-item interactions (hover lift, press scale, label slide/opacity)
      for (let i = 0; i < COUNT; i++) {
        // Hover lift
        const targetLift = hoverIndex === i && i !== tIdx ? -3.5 : 0
        ;[st.hoverLift[i], st.vHoverLift[i]] = solveSpring(
          st.hoverLift[i],
          st.vHoverLift[i],
          targetLift,
          280,
          26,
          dt
        )

        // Press compression
        const targetPress = st.pressedIndex === i ? 0.94 : 1.0
        ;[st.pressScale[i], st.vPressScale[i]] = solveSpring(
          st.pressScale[i],
          st.vPressScale[i],
          targetPress,
          400,
          32,
          dt
        )

        // Label: enters with fade + slide as dome swells, exits fast before wave starts
        if (i === tIdx) {
          const nearTarget = Math.max(0, 1 - Math.abs(st.cx - centre(i)) / 14)
          const swellRatio = Math.max(0, Math.min(1, (st.h - H_WAVE) / (DOME - H_WAVE)))
          const targetOp = nearTarget > 0.5 && swellRatio > 0.35 ? 1.0 : 0.0
          const targetSl = (1 - targetOp) * 4.0
          ;[st.labelOpacity[i], st.vLabelOpacity[i]] = solveSpring(
            st.labelOpacity[i],
            st.vLabelOpacity[i],
            targetOp,
            240,
            25,
            dt
          )
          ;[st.labelSlide[i], st.vLabelSlide[i]] = solveSpring(
            st.labelSlide[i],
            st.vLabelSlide[i],
            targetSl,
            240,
            25,
            dt
          )
        } else {
          // Outgoing label: rapid exit
          ;[st.labelOpacity[i], st.vLabelOpacity[i]] = solveSpring(
            st.labelOpacity[i],
            st.vLabelOpacity[i],
            0.0,
            420,
            32,
            dt
          )
          ;[st.labelSlide[i], st.vLabelSlide[i]] = solveSpring(
            st.labelSlide[i],
            st.vLabelSlide[i],
            3.0,
            420,
            32,
            dt
          )
        }

        // Active icon rises inside the swelling dome
        const itemNear = Math.max(0, 1 - Math.abs(st.cx - centre(i)) / (ITEM_W * 0.45))
        const rise = i === tIdx ? Math.max(0, Math.min(1, (st.h / DOME) * itemNear)) : 0

        const btn = buttonRefs.current[i]
        if (btn) {
          btn.style.setProperty('--rise', rise.toFixed(3))
          btn.style.setProperty('--hover-lift', `${st.hoverLift[i].toFixed(2)}px`)
          btn.style.setProperty('--press-scale', st.pressScale[i].toFixed(3))
          btn.style.setProperty('--label-opacity', st.labelOpacity[i].toFixed(3))
          btn.style.setProperty('--label-slide', `${st.labelSlide[i].toFixed(2)}px`)
        }
      }

      // 4. Color & glow interpolation
      const colorBlend = 1 - Math.exp(-12 * dt)
      st.colorRgb[0] += (targetColor[0] - st.colorRgb[0]) * colorBlend
      st.colorRgb[1] += (targetColor[1] - st.colorRgb[1]) * colorBlend
      st.colorRgb[2] += (targetColor[2] - st.colorRgb[2]) * colorBlend
      ;[st.glowOpacity, st.vGlowOpacity] = solveSpring(
        st.glowOpacity,
        st.vGlowOpacity,
        targetGlow,
        220,
        25,
        dt
      )

      // 5. Update DOM path and variables
      const d = shapePath(st.cx, st.h, st.sigma, hoverCx, st.hoverH, SIGMA_HOVER)
      applyDomUpdates(d, st.cx, st.h, st.glowOpacity, st.colorRgb)

      // 6. Check settle condition
      const settled =
        Math.abs(targetCx - st.cx) < 0.08 &&
        Math.abs(st.vx) < 0.08 &&
        Math.abs(targetH - st.h) < 0.08 &&
        Math.abs(st.vh) < 0.08 &&
        Math.abs(targetSigma - st.sigma) < 0.08 &&
        Math.abs(targetHoverH - st.hoverH) < 0.08 &&
        Math.abs(targetGlow - st.glowOpacity) < 0.02 &&
        Math.abs(targetColor[0] - st.colorRgb[0]) < 1 &&
        Math.abs(targetColor[1] - st.colorRgb[1]) < 1 &&
        Math.abs(targetColor[2] - st.colorRgb[2]) < 1 &&
        st.hoverLift.every(
          (l, idx) => Math.abs(l - (hoverIndex === idx && idx !== tIdx ? -3.5 : 0)) < 0.05
        ) &&
        st.pressScale.every(
          (p, idx) => Math.abs(p - (st.pressedIndex === idx ? 0.94 : 1)) < 0.01
        ) &&
        st.labelOpacity.every((o, idx) => Math.abs(o - (idx === tIdx && tIdx >= 0 ? 1 : 0)) < 0.02)

      if (settled) {
        st.cx = targetCx
        st.vx = 0
        st.h = targetH
        st.vh = 0
        st.sigma = targetSigma
        st.vs = 0
        st.hoverH = targetHoverH
        st.vHoverH = 0
        st.colorRgb = [...targetColor]
        st.glowOpacity = targetGlow
        const finalD = shapePath(st.cx, st.h, st.sigma, hoverCx, st.hoverH, SIGMA_HOVER)
        applyDomUpdates(finalD, st.cx, st.h, st.glowOpacity, st.colorRgb)
        st.isAnimating = false
        return
      }

      rafId.current = requestAnimationFrame(tick)
    }

    rafId.current = requestAnimationFrame(tick)
  }, [applyDomUpdates])

  // Trigger animation whenever active index changes
  useEffect(() => {
    const physicsObj = physics.current
    physicsObj.targetIndex = index
    startAnimation()
    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current)
      physicsObj.isAnimating = false
    }
  }, [index, startAnimation])

  // Initial render path & variables
  const initialD = shapePath(initCx, initH, SIGMA_REST, initCx, 0, SIGMA_HOVER)
  const initialColor = `rgb(${initColor[0]} ${initColor[1]} ${initColor[2]})`

  // Keyboard navigation across items
  const handleKeyDown = (e: React.KeyboardEvent, i: number): void => {
    let next = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      next = (i + 1) % COUNT
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      next = (i - 1 + COUNT) % COUNT
    } else if (e.key === 'Home') {
      next = 0
    } else if (e.key === 'End') {
      next = COUNT - 1
    }

    if (next >= 0) {
      e.preventDefault()
      buttonRefs.current[next]?.focus()
      onChange(ITEMS[next].id)
    }
  }

  const handlePointerEnter = (i: number): void => {
    physics.current.hoverIndex = i
    startAnimation()
  }

  const handlePointerLeave = (i: number): void => {
    if (physics.current.hoverIndex === i) {
      physics.current.hoverIndex = -1
      physics.current.pressedIndex = -1
      startAnimation()
    }
  }

  const handlePointerDown = (i: number): void => {
    physics.current.pressedIndex = i
    startAnimation()
  }

  const handlePointerUp = (i: number): void => {
    if (physics.current.pressedIndex === i) {
      physics.current.pressedIndex = -1
      startAnimation()
    }
  }

  const handleItemClick = (id: Destination, i: number): void => {
    const reduced =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!reduced) {
      rippleIdRef.current += 1
      const newId = rippleIdRef.current
      const itemColor = ITEMS[i].colorVar
      setRipples((prev) => [...prev, { id: newId, x: centre(i), colorVar: itemColor }])
    }
    onChange(id)
  }

  return (
    <nav
      ref={navRef}
      className="sh-dock-wrap sg-dock"
      aria-label="Sezioni principali"
      role="navigation"
      style={
        {
          width: W,
          height: H,
          '--sg-dock-color': initialColor,
          '--sh-dock-color': initialColor,
          '--sg-cx': `${initCx}px`,
          '--sg-dome-top': `${TOP - initH}px`,
          '--sg-glow-opacity': index >= 0 ? '1' : '0'
        } as React.CSSProperties
      }
    >
      <div className="sg-dock-ambient" aria-hidden="true" />
      <div
        ref={glassRef}
        className="sg-dock-glass"
        style={{ clipPath: `path('${initialD}')` }}
        aria-hidden="true"
      >
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
              stopColor="color-mix(in srgb, var(--sg-dock-color) 60%, transparent)"
            />
          </linearGradient>
        </defs>
        <path ref={pathRef} d={initialD} />
      </svg>
      {ripples.map((r) => (
        <span
          key={r.id}
          className="sg-dock-ripple"
          style={
            {
              left: r.x,
              top: TOP + BAR / 2,
              '--ripple-color': `var(${r.colorVar})`
            } as React.CSSProperties
          }
          aria-hidden="true"
          onAnimationEnd={() => setRipples((rs) => rs.filter((x) => x.id !== r.id))}
        />
      ))}
      <div
        className="sg-dock-items"
        role="menubar"
        aria-orientation="horizontal"
        style={{ top: TOP, height: BAR, left: PAD, right: PAD }}
      >
        {ITEMS.map((it, i) => {
          const on = i === index
          return (
            <button
              key={it.id}
              ref={(el) => {
                buttonRefs.current[i] = el
              }}
              type="button"
              role="menuitem"
              className={`sg-dock-item ${on ? 'is-active' : ''}`}
              aria-current={on ? 'page' : undefined}
              aria-label={it.id}
              tabIndex={on || (index < 0 && i === 0) ? 0 : -1}
              style={
                {
                  '--rise': on ? '1' : '0',
                  '--hover-lift': '0px',
                  '--press-scale': '1',
                  '--label-opacity': on ? '1' : '0',
                  '--label-slide': '0px'
                } as React.CSSProperties
              }
              onPointerEnter={() => handlePointerEnter(i)}
              onPointerLeave={() => handlePointerLeave(i)}
              onPointerDown={() => handlePointerDown(i)}
              onPointerUp={() => handlePointerUp(i)}
              onPointerCancel={() => handlePointerUp(i)}
              onKeyDown={(e) => handleKeyDown(e, i)}
              onClick={() => handleItemClick(it.id, i)}
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
