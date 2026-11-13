import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import './signature.css'

const MODES = ['Studia', 'Esercitati', 'Ripassa'] as const
export type Mode = (typeof MODES)[number]

const H = 38 // chip and main pill height

/** Analytical damped harmonic oscillator over arbitrary time step dt. */
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

type Pos = { left: number; width: number }
type AnimSnapshot = {
  main: Pos
  active: Pos
  chips: Record<Mode, Pos | null>
  fromMode: Mode
  toMode: Mode
  otherMode: Mode
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
  const gooId = `sg-goo-${useId().replace(/:/g, '')}`

  const containerRef = useRef<HTMLDivElement>(null)
  const mainElRef = useRef<HTMLDivElement>(null)
  const activeBtnRef = useRef<HTMLButtonElement>(null)
  const inactiveBtnRefs = useRef<Record<Mode, HTMLButtonElement | null>>({
    Studia: null,
    Esercitati: null,
    Ripassa: null
  })

  const mainShapeRef = useRef<SVGRectElement>(null)
  const incomingBlobRef = useRef<SVGRectElement>(null)
  const outgoingBlobRef = useRef<SVGRectElement>(null)

  const [isAnimating, setIsAnimating] = useState(false)
  const [mainWidth, setMainWidth] = useState<number>(0)

  const animRef = useRef<AnimSnapshot | null>(null)
  const currentModeRef = useRef<Mode>(mode)
  const rafRef = useRef<number>(0)

  // Current count and label for the active mode
  const count = mode === 'Ripassa' ? due : mode === 'Esercitati' ? practiceCount : studyCount
  const countText = count == null ? '—' : String(count)
  const label = mode === 'Ripassa' ? 'dovuti' : 'suggerimenti'

  // The other 2 modes displayed as inactive chips
  const inactiveModes = MODES.filter((m) => m !== mode)

  // Track main pill width via ResizeObserver and fonts.ready
  useLayoutEffect(() => {
    let mounted = true
    const updateWidth = (): void => {
      if (!mounted) return
      if (mainElRef.current) {
        const w = Math.ceil(mainElRef.current.getBoundingClientRect().width)
        if (w > 0) {
          setMainWidth(w)
          mainShapeRef.current?.setAttribute('width', String(w))
        }
      }
    }

    updateWidth()

    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (mounted) updateWidth()
      })
    }

    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined' && mainElRef.current) {
      ro = new ResizeObserver(() => {
        updateWidth()
      })
      ro.observe(mainElRef.current)
    }

    return () => {
      mounted = false
      if (ro) ro.disconnect()
    }
  }, [countText, label, mode])

  // Cleanup in-flight rAF on unmount
  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const handleSelect = (targetMode: Mode): void => {
    if (targetMode === mode) return

    const container = containerRef.current
    if (!container) {
      onChange(targetMode)
      return
    }

    // Cancel running animation before capturing snapshot
    cancelAnimationFrame(rafRef.current)
    rafRef.current = 0

    const cRect = container.getBoundingClientRect()
    const mainRect = mainElRef.current?.getBoundingClientRect()
    const activeRect = activeBtnRef.current?.getBoundingClientRect()

    const chipsPos: Record<Mode, Pos | null> = {
      Studia: null,
      Esercitati: null,
      Ripassa: null
    }

    for (const m of inactiveModes) {
      const btn = inactiveBtnRefs.current[m]
      if (btn) {
        const r = btn.getBoundingClientRect()
        chipsPos[m] = { left: r.left - cRect.left, width: r.width }
      }
    }

    const other = inactiveModes.find((m) => m !== targetMode) || MODES[0]

    animRef.current = {
      main: mainRect
        ? { left: mainRect.left - cRect.left, width: mainRect.width }
        : { left: 0, width: 0 },
      active: activeRect
        ? { left: activeRect.left - cRect.left, width: activeRect.width }
        : { left: 0, width: 0 },
      chips: chipsPos,
      fromMode: mode,
      toMode: targetMode,
      otherMode: other
    }

    onChange(targetMode)
  }

  // FLIP transition with SVG gooey metaball spring animation
  useLayoutEffect(() => {
    const anim = animRef.current
    if (!anim || anim.toMode !== mode) {
      currentModeRef.current = mode
      return
    }

    currentModeRef.current = mode
    animRef.current = null

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (prefersReduced) {
      return
    }

    cancelAnimationFrame(rafRef.current)

    const container = containerRef.current
    if (!container) return
    const cRect = container.getBoundingClientRect()
    const newMainRect = mainElRef.current?.getBoundingClientRect()
    const newActiveRect = activeBtnRef.current?.getBoundingClientRect()

    if (!newMainRect || !newActiveRect) return

    const newMain: Pos = { left: newMainRect.left - cRect.left, width: newMainRect.width }
    const newActive: Pos = { left: newActiveRect.left - cRect.left, width: newActiveRect.width }

    const prevBtn = inactiveBtnRefs.current[anim.fromMode]
    const prevRect = prevBtn?.getBoundingClientRect()
    const newPrev: Pos | null = prevRect
      ? { left: prevRect.left - cRect.left, width: prevRect.width }
      : null

    const otherBtn = inactiveBtnRefs.current[anim.otherMode]
    const otherRect = otherBtn?.getBoundingClientRect()
    const newOther: Pos | null = otherRect
      ? { left: otherRect.left - cRect.left, width: otherRect.width }
      : null

    const oldClicked = anim.chips[anim.toMode]
    const oldActive = anim.active
    const oldOther = anim.chips[anim.otherMode]
    const oldMain = anim.main

    if (!oldClicked || !newPrev) return

    // FLIP Deltas
    const dxIncoming = oldClicked.left - newActive.left
    const dxOutgoing = oldActive.left - newPrev.left
    const dxOther = oldOther && newOther ? oldOther.left - newOther.left : 0
    const dwMain = newMain.width - oldMain.width

    setIsAnimating(true)

    // Initial state at p = 0
    if (activeBtnRef.current) {
      activeBtnRef.current.style.transform = `translate3d(${dxIncoming.toFixed(2)}px, 0, 0)`
      activeBtnRef.current.style.color = 'var(--sh-text)'
      const label = activeBtnRef.current.firstElementChild as HTMLElement | null
      if (label) label.style.opacity = '0'
    }
    if (prevBtn) {
      prevBtn.style.transform = `translate3d(${dxOutgoing.toFixed(2)}px, 0, 0)`
      prevBtn.style.borderColor = 'transparent'
      prevBtn.style.color = 'var(--sg-ink-active-text, var(--sh-card-solid, #1C1F26))'
    }
    if (otherBtn && dxOther !== 0) {
      otherBtn.style.transform = `translate3d(${dxOther.toFixed(2)}px, 0, 0)`
    }

    if (mainShapeRef.current) {
      mainShapeRef.current.setAttribute('width', oldMain.width.toFixed(2))
    }

    if (incomingBlobRef.current) {
      incomingBlobRef.current.style.display = 'none'
      incomingBlobRef.current.setAttribute('x', oldClicked.left.toFixed(2))
      incomingBlobRef.current.setAttribute('width', '0')
    }

    if (outgoingBlobRef.current) {
      outgoingBlobRef.current.style.display = 'block'
      outgoingBlobRef.current.setAttribute('x', oldActive.left.toFixed(2))
      outgoingBlobRef.current.setAttribute('width', oldActive.width.toFixed(2))
      outgoingBlobRef.current.style.opacity = '1'
    }

    let p = 0
    let v = 0
    let lastTime = performance.now()
    const startTime = lastTime

    // Spring: stiffness 190, damping 22 -> ~450ms duration, slightly underdamped
    const tick = (now: number): void => {
      const dt = Math.min(Math.max((now - lastTime) / 1000, 0.001), 0.033)
      lastTime = now

      ;[p, v] = solveSpring(p, v, 1.0, 190, 22, dt)

      const progress = p
      const fillP = Math.min(1.0, Math.max(0, p))

      // The two labels slide across each other: each is faded out while they cross, so they never read as one word.
      const incLabel = activeBtnRef.current?.firstElementChild as HTMLElement | null | undefined
      const outLabel = prevBtn?.firstElementChild as HTMLElement | null | undefined
      if (incLabel) incLabel.style.opacity = Math.min(1, Math.max(0, (fillP - 0.5) / 0.3)).toFixed(3)
      if (outLabel) outLabel.style.opacity = Math.max(Math.min(1, Math.max(0, 1 - fillP / 0.3)), Math.min(1, Math.max(0, (fillP - 0.7) / 0.25))).toFixed(3)

      // 1. Incoming active button
      const curDxInc = dxIncoming * (1 - progress)
      if (activeBtnRef.current) {
        activeBtnRef.current.style.transform = `translate3d(${curDxInc.toFixed(2)}px, 0, 0)`
        const inkTextP = Math.min(1.0, Math.max(0, (fillP - 0.2) / 0.7))
        activeBtnRef.current.style.color = `color-mix(in srgb, var(--sg-ink-active-text, var(--sh-card-solid, #1C1F26)) ${(inkTextP * 100).toFixed(0)}%, var(--sh-text))`
      }

      // 2. Outgoing previous button
      const curDxOut = dxOutgoing * (1 - progress)
      if (prevBtn) {
        prevBtn.style.transform = `translate3d(${curDxOut.toFixed(2)}px, 0, 0)`
        const detachP = Math.min(1.0, Math.max(0, fillP * 1.4))
        prevBtn.style.borderColor = `color-mix(in srgb, var(--sh-send-bg, #7664c2) ${(detachP * 100).toFixed(0)}%, transparent)`
        prevBtn.style.color = `color-mix(in srgb, var(--sh-text) ${(detachP * 100).toFixed(0)}%, var(--sg-ink-active-text, var(--sh-card-solid, #1C1F26)))`
      }

      // 3. Other chip FLIP
      if (otherBtn && dxOther !== 0) {
        const curDxOth = dxOther * (1 - progress)
        otherBtn.style.transform = `translate3d(${curDxOth.toFixed(2)}px, 0, 0)`
      }

      // 4. Main pill shape
      const curMainW = oldMain.width + dwMain * fillP
      mainShapeRef.current?.setAttribute('width', curMainW.toFixed(2))

      // 5. Incoming blob: slides towards main pill, gooey neck forms at contact, ink fills inwards
      const curIncX = oldClicked.left + (newActive.left - oldClicked.left) * fillP
      const curIncW = oldClicked.width + (newActive.width - oldClicked.width) * fillP
      if (incomingBlobRef.current) {
        const inkFill = Math.min(1.0, Math.max(0, (fillP - 0.15) / 0.75))
        if (inkFill > 0) {
          incomingBlobRef.current.style.display = 'block'
          incomingBlobRef.current.setAttribute('x', curIncX.toFixed(2))
          incomingBlobRef.current.setAttribute('width', (curIncW * inkFill).toFixed(2))
          incomingBlobRef.current.style.opacity = '1'
        } else {
          incomingBlobRef.current.style.display = 'none'
        }
      }

      // 6. Outgoing blob: pulls out of main pill, neck snaps, fill fades
      const curOutX = oldActive.left + (newPrev.left - oldActive.left) * fillP
      const curOutW = oldActive.width + (newPrev.width - oldActive.width) * fillP
      if (outgoingBlobRef.current) {
        const outAlpha = Math.max(0, 1.0 - fillP * 1.5)
        if (outAlpha > 0.01) {
          outgoingBlobRef.current.style.display = 'block'
          outgoingBlobRef.current.setAttribute('x', curOutX.toFixed(2))
          outgoingBlobRef.current.setAttribute('width', curOutW.toFixed(2))
          outgoingBlobRef.current.style.opacity = outAlpha.toFixed(3)
        } else {
          outgoingBlobRef.current.style.display = 'none'
        }
      }

      const settled =
        (Math.abs(1.0 - p) < 0.002 && Math.abs(v) < 0.005) || now - startTime > 650

      if (!settled) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        if (activeBtnRef.current) {
          activeBtnRef.current.style.transform = ''
          activeBtnRef.current.style.color = ''
          ;(activeBtnRef.current.firstElementChild as HTMLElement | null)?.style.removeProperty('opacity')
        }
        if (prevBtn) {
          prevBtn.style.transform = ''
          prevBtn.style.borderColor = ''
          prevBtn.style.color = ''
          ;(prevBtn.firstElementChild as HTMLElement | null)?.style.removeProperty('opacity')
        }
        if (otherBtn) otherBtn.style.transform = ''
        if (incomingBlobRef.current) incomingBlobRef.current.style.display = 'none'
        if (outgoingBlobRef.current) outgoingBlobRef.current.style.display = 'none'
        mainShapeRef.current?.setAttribute('width', newMain.width.toFixed(2))
        setIsAnimating(false)
        rafRef.current = 0
      }
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [mode])

  return (
    <div
      ref={containerRef}
      className={`sg-ink ${isAnimating ? 'is-animating' : ''}`}
      role="radiogroup"
      aria-label="Modalità di studio"
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        e.preventDefault()
        const n = MODES[(MODES.indexOf(mode) + (e.key === 'ArrowRight' ? 1 : 2)) % 3]
        handleSelect(n)
      }}
    >
      {/* Background SVG shape layer behind text: feGaussianBlur + feColorMatrix for metaball gooey */}
      <svg className="sg-ink-shapes" aria-hidden="true">
        <defs>
          <filter id={gooId} x="-20%" y="-40%" width="140%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9"
            />
          </filter>
        </defs>
        <g filter={`url(#${gooId})`} className="sg-ink-fill">
          <rect
            ref={mainShapeRef}
            x={0}
            y={0}
            width={mainWidth || 0}
            height={H}
            rx={H / 2}
          />
          <rect
            ref={incomingBlobRef}
            x={0}
            y={0}
            width={0}
            height={H}
            rx={H / 2}
            style={{ display: 'none' }}
          />
          <rect
            ref={outgoingBlobRef}
            x={0}
            y={0}
            width={0}
            height={H}
            rx={H / 2}
            style={{ display: 'none' }}
          />
        </g>
      </svg>

      {/* Main purple pill on the left: counter, divider, active mode in normal flow */}
      <div ref={mainElRef} className="sg-ink-main">
        <span className="sg-ink-count">
          <b>
            <Odometer value={countText} />
          </b>
          <span>{label}</span>
        </span>
        <span className="sg-ink-divider" aria-hidden="true" />
        <button
          ref={activeBtnRef}
          type="button"
          role="radio"
          aria-checked="true"
          aria-pressed="true"
          tabIndex={0}
          aria-label={mode}
          className="sg-chip-active"
        >
          <span>{mode}</span>
        </button>
      </div>

      {/* The 2 inactive mode chips on the right */}
      {inactiveModes.map((m) => (
        <button
          key={m}
          ref={(el) => {
            inactiveBtnRefs.current[m] = el
          }}
          type="button"
          role="radio"
          aria-checked="false"
          aria-pressed="false"
          tabIndex={-1}
          aria-label={m}
          className="sg-chip-inactive"
          onClick={() => handleSelect(m)}
        >
          <span>{m}</span>
        </button>
      ))}
    </div>
  )
}
