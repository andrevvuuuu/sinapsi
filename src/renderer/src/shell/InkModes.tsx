import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import './signature.css'

const MODES = ['Studia', 'Esercitati', 'Ripassa'] as const
export type Mode = (typeof MODES)[number]

/*
 * Ink chips: viscous metaball ink flow between modes.
 * Picking a chip causes ink to surge from the contact edge (facing the previous selection)
 * and flood the inside of the clicked chip with an underdamped spring curve, fusing seamlessly
 * through an SVG metaball filter (feGaussianBlur + feColorMatrix + feComposite atop).
 * The bar expands and chips translate via hardware-accelerated transform: translate3d and scaleX
 * with zero React re-renders per frame in a single rAF loop.
 */

const H = 38 // chip and bar height
const GAP = 8 // between bar and chips
const PADX = 16 // chip side padding
const BAR_PADL = 14
const DIV_GAP = 12

type Geo = { barW: number; chips: Record<Mode, { x: number; fill: number }> }
type Widths = { count: number; text: Record<Mode, number> }

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

/** Where everything sits when `mode` is the chosen one. */
function layoutFor(mode: Mode, w: Widths): Geo {
  const chipW = (m: Mode): number => w.text[m] + PADX * 2
  const inX = BAR_PADL + w.count + DIV_GAP + 1 + DIV_GAP
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

  const barRectRef = useRef<SVGRectElement>(null)
  const dividerLineRef = useRef<SVGLineElement>(null)
  const inkRectRefs = useRef<Record<Mode, SVGRectElement | null>>({
    Studia: null,
    Esercitati: null,
    Ripassa: null
  })
  const outlineRectRefs = useRef<Record<Mode, SVGRectElement | null>>({
    Studia: null,
    Esercitati: null,
    Ripassa: null
  })
  const labelInkRefs = useRef<Record<Mode, HTMLSpanElement | null>>({
    Studia: null,
    Esercitati: null,
    Ripassa: null
  })
  const chipBtn = useRef<Record<Mode, HTMLButtonElement | null>>({
    Studia: null,
    Esercitati: null,
    Ripassa: null
  })

  const [w, setW] = useState<Widths | null>(null)
  const [geo, setGeo] = useState<Geo | null>(null)
  const geoRef = useRef<Geo | null>(null)
  const shown = useRef<Mode>(mode)

  // The bar displays the count for the current mode
  const [barMode, setBarMode] = useState<Mode>(mode)
  const count = barMode === 'Ripassa' ? due : barMode === 'Esercitati' ? practiceCount : studyCount
  const countText = count == null ? '—' : String(count)
  const label = barMode === 'Ripassa' ? 'dovuti' : 'suggerimenti'

  // Measure label widths with real fonts and ResizeObserver
  useLayoutEffect(() => {
    let ro: ResizeObserver | null = null
    let mounted = true

    const measure = (): void => {
      if (!mounted) return
      const box = measureRef.current
      const c = countRef.current
      if (!box || !c) return
      const text = {} as Widths['text']
      box.querySelectorAll<HTMLElement>('[data-m]').forEach((el) => {
        text[el.dataset.m as Mode] = Math.ceil(el.getBoundingClientRect().width)
      })
      const countWidth = Math.ceil(c.getBoundingClientRect().width)
      if (countWidth > 0 && text.Studia && text.Esercitati && text.Ripassa) {
        setW((prev) => {
          if (
            prev &&
            prev.count === countWidth &&
            prev.text.Studia === text.Studia &&
            prev.text.Esercitati === text.Esercitati &&
            prev.text.Ripassa === text.Ripassa
          ) {
            return prev
          }
          return { count: countWidth, text }
        })
      }
    }

    measure()

    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (mounted) measure()
      })
    }

    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        measure()
      })
      if (countRef.current) ro.observe(countRef.current)
      if (measureRef.current) ro.observe(measureRef.current)
    }

    return () => {
      mounted = false
      if (ro) ro.disconnect()
    }
  }, [countText, label])

  // Recalculate layout whenever widths change
  useEffect(() => {
    if (!w) return
    const g = layoutFor(shown.current, w)
    geoRef.current = g
    setGeo(g)
  }, [w])

  const wRef = useRef<Widths | null>(null)
  const rafRef = useRef(0)
  useEffect(() => {
    wRef.current = w
  }, [w])
  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  // Ink-flow animation: spring curve from contact edge with direct DOM updates (no React re-render per frame)
  useEffect(() => {
    if (mode === shown.current || !geoRef.current || !wRef.current) return
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    const prevMode = shown.current
    shown.current = mode
    const ww = wRef.current
    const startGeo = geoRef.current
    const endGeo = layoutFor(mode, ww)

    if (still) {
      geoRef.current = endGeo
      setGeo(endGeo)
      setBarMode(mode)
      return
    }

    cancelAnimationFrame(rafRef.current)

    // Contact edge: if previous selection is to the left, ink enters from left (0% 50%), otherwise right (100% 50%)
    const prevIdx = MODES.indexOf(prevMode)
    const nextIdx = MODES.indexOf(mode)
    const fromLeft = prevIdx < nextIdx
    const contactOrigin = fromLeft ? '0% 50%' : '100% 50%'

    let inkP = 0
    let vInk = 0
    let slideP = 0
    let vSlide = 0
    let lastTime = performance.now()
    let swappedCount = false

    // Prepare incoming chip styles before animation starts
    const incomingRect = inkRectRefs.current[mode]
    if (incomingRect) {
      incomingRect.style.transformOrigin = contactOrigin
      incomingRect.style.transform = 'translate3d(0, 0, 0) scaleX(0)'
      incomingRect.style.opacity = '1'
    }
    const incomingOutline = outlineRectRefs.current[mode]
    if (incomingOutline) {
      incomingOutline.style.display = 'block'
      incomingOutline.style.opacity = '1'
    }
    const outgoingOutline = outlineRectRefs.current[prevMode]
    if (outgoingOutline) {
      outgoingOutline.style.display = 'block'
      outgoingOutline.style.opacity = '0'
    }

    const tick = (now: number): void => {
      const dt = Math.min(Math.max((now - lastTime) / 1000, 0.001), 0.04)
      lastTime = now

      // Solve ink spring: surges from contact edge into clicked chip
      ;[inkP, vInk] = solveSpring(inkP, vInk, 1.0, 240, 22, dt)
      // Slide follows smoothly as ink fills
      const slideTarget = inkP > 0.25 ? 1.0 : 0.0
      ;[slideP, vSlide] = solveSpring(slideP, vSlide, slideTarget, 210, 23, dt)

      const scaleX = Math.min(1.04, Math.max(0, inkP))
      const clampedSlide = Math.min(1.0, Math.max(0, slideP))

      // Direct DOM update: bar width
      const curBarW = startGeo.barW + (endGeo.barW - startGeo.barW) * clampedSlide
      barRectRef.current?.setAttribute('width', curBarW.toFixed(2))

      // Direct DOM update: divider line
      const divX = BAR_PADL + (ww?.count ?? 0) + DIV_GAP
      dividerLineRef.current?.setAttribute('x1', divX.toFixed(2))
      dividerLineRef.current?.setAttribute('x2', divX.toFixed(2))

      // Direct DOM update: chips translation and ink flow
      for (const m of MODES) {
        const startX = startGeo.chips[m].x
        const endX = endGeo.chips[m].x
        const transX = (endX - startX) * clampedSlide

        const btn = chipBtn.current[m]
        if (btn) {
          btn.style.transform = `translate3d(${transX.toFixed(2)}px, 0, 0)`
        }

        const outline = outlineRectRefs.current[m]
        if (outline) {
          outline.style.transform = `translate3d(${transX.toFixed(2)}px, 0, 0)`
          if (m === mode) {
            outline.style.opacity = Math.max(0, 1 - scaleX * 1.15).toFixed(3)
          } else if (m === prevMode) {
            outline.style.opacity = Math.min(1, clampedSlide * 1.3).toFixed(3)
          }
        }

        const inkRect = inkRectRefs.current[m]
        if (inkRect) {
          if (m === mode) {
            inkRect.style.transformOrigin = contactOrigin
            inkRect.style.transform = `translate3d(${transX.toFixed(2)}px, 0, 0) scaleX(${scaleX.toFixed(3)})`
            inkRect.style.opacity = '1'
          } else if (m === prevMode) {
            inkRect.style.transform = `translate3d(${transX.toFixed(2)}px, 0, 0)`
            inkRect.style.opacity = Math.max(0, 1 - clampedSlide * 1.4).toFixed(3)
          } else {
            inkRect.style.transform = `translate3d(${transX.toFixed(2)}px, 0, 0) scaleX(0)`
            inkRect.style.opacity = '0'
          }
        }

        const labelInk = labelInkRefs.current[m]
        if (labelInk) {
          if (m === mode) {
            const clipP = Math.max(0, Math.min(100, (1 - scaleX) * 100))
            labelInk.style.clipPath = fromLeft
              ? `inset(0 ${clipP.toFixed(1)}% 0 0)`
              : `inset(0 0 0 ${clipP.toFixed(1)}%)`
          } else if (m === prevMode) {
            const clipP = Math.max(0, Math.min(100, clampedSlide * 100))
            labelInk.style.clipPath = fromLeft
              ? `inset(0 0 0 ${clipP.toFixed(1)}%)`
              : `inset(0 ${clipP.toFixed(1)}% 0 0)`
          }
        }
      }

      if (!swappedCount && clampedSlide > 0.45) {
        swappedCount = true
        setBarMode(mode)
      }

      const settled =
        Math.abs(1.0 - inkP) < 0.005 &&
        Math.abs(vInk) < 0.008 &&
        Math.abs(1.0 - slideP) < 0.005 &&
        Math.abs(vSlide) < 0.008

      if (!settled) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        // Animation finished: clean up inline transforms and sync React state once
        for (const m of MODES) {
          const btn = chipBtn.current[m]
          if (btn) btn.style.transform = ''
          const outline = outlineRectRefs.current[m]
          if (outline) {
            outline.style.transform = ''
            outline.setAttribute('x', String(endGeo.chips[m].x + 0.75))
            outline.style.opacity = m === mode ? '0' : '1'
            outline.style.display = m === mode ? 'none' : 'block'
          }
          const inkRect = inkRectRefs.current[m]
          if (inkRect) {
            inkRect.style.transform =
              m === mode ? 'scaleX(1) translate3d(0, 0, 0)' : 'scaleX(0) translate3d(0, 0, 0)'
            inkRect.style.opacity = m === mode ? '1' : '0'
          }
          const labelInk = labelInkRefs.current[m]
          if (labelInk) {
            labelInk.style.clipPath = m === mode ? 'inset(0 0% 0 0)' : 'inset(0 100% 0 0)'
          }
        }
        geoRef.current = endGeo
        setGeo(endGeo)
        if (!swappedCount) setBarMode(mode)
        rafRef.current = 0
      }
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [mode])

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
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9"
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
        {geo && w && (
          <>
            <g filter={`url(#${goo})`} className="sg-ink-fill">
              <rect ref={barRectRef} x={0} y={4} width={geo.barW} height={H} rx={H / 2} />
              {MODES.map((m) => {
                const c = geo.chips[m]
                const cw = chipW(m)
                const isChosen = m === shown.current
                return (
                  <rect
                    key={m}
                    ref={(el) => {
                      inkRectRefs.current[m] = el
                    }}
                    x={c.x}
                    y={4}
                    width={cw}
                    height={H}
                    rx={H / 2}
                    style={{
                      transformOrigin: '0% 50%',
                      transform: isChosen
                        ? 'scaleX(1) translate3d(0, 0, 0)'
                        : 'scaleX(0) translate3d(0, 0, 0)',
                      opacity: isChosen ? 1 : 0
                    }}
                  />
                )
              })}
            </g>
            <g className="sg-ink-outline">
              {MODES.map((m) => {
                const c = geo.chips[m]
                const isCurrent = m === mode
                const cw = chipW(m)
                return (
                  <rect
                    key={m}
                    ref={(el) => {
                      outlineRectRefs.current[m] = el
                    }}
                    x={c.x + 0.75}
                    y={4.75}
                    width={Math.max(0, cw - 1.5)}
                    height={H - 1.5}
                    rx={(H - 1.5) / 2}
                    style={{
                      opacity: isCurrent ? 0 : 1,
                      display: isCurrent ? 'none' : 'block'
                    }}
                  />
                )
              })}
            </g>
            <line
              ref={dividerLineRef}
              className="sg-ink-divider"
              x1={divX}
              x2={divX}
              y1={4 + 11}
              y2={4 + H - 11}
            />
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
            const isChosen = m === mode
            return (
              <button
                key={m}
                ref={(el) => {
                  chipBtn.current[m] = el
                }}
                type="button"
                role="radio"
                aria-checked={isChosen}
                tabIndex={isChosen ? 0 : -1}
                className={`sg-chip ${isChosen ? 'is-active' : ''}`}
                style={{
                  left: c.x,
                  width: cw,
                  height: H,
                  top: 4,
                  zIndex: isChosen ? 2 : 1
                }}
                onClick={() => mode !== m && onChange(m)}
              >
                <span className="sg-chip-label">{m}</span>
                <span
                  ref={(el) => {
                    labelInkRefs.current[m] = el
                  }}
                  className="sg-chip-label sg-chip-label-ink"
                  aria-hidden="true"
                  style={{
                    clipPath: isChosen ? 'inset(0 0% 0 0)' : 'inset(0 100% 0 0)'
                  }}
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
