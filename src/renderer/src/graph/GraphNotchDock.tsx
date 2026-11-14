import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ExtractorStatus } from '../../../shared/graph-types'
import type { VaultIndex } from '../../../shared/vault-types'
import { DictationError, MicButton } from '../components/MicButton'
import { useDictation } from '../components/dictation'
import type { Lens } from './draw'
import type { LayoutMode } from './layout'
import type { GraphModel, SearchHit } from './model'

export type NotchSection = 'search' | 'lens' | 'layout' | 'status'

export type GraphNotchDockProps = {
  model: GraphModel | null
  counts: { due: number; never: number; fragile: number }
  multi: number

  query: string
  setQuery: (q: string) => void
  hits: SearchHit[]
  hi: number
  setHi: (hi: number) => void
  go: (h: SearchHit) => void
  searchMic: ReturnType<typeof useDictation>
  searchField: React.RefObject<HTMLInputElement | null>

  lens: Lens
  setLens: (lens: Lens) => void

  mode: LayoutMode
  changeMode: (m: LayoutMode) => void
  modes: [LayoutMode, string, string][]
  show: { regions: boolean; wikilinks: boolean; frontier: boolean }
  setShow: React.Dispatch<React.SetStateAction<{ regions: boolean; wikilinks: boolean; frontier: boolean }>>

  status: ExtractorStatus
  index: VaultIndex
  onRetry: (path: string) => void
  extractError: string | null

  initialSection?: NotchSection | null
  onOpenChange?: (open: boolean) => void
}

const CLOSED_WIDTH = 58
const MAX_OPEN_WIDTH = 300
const DEFAULT_OPEN_WIDTH = 260
const CLOSED_HEIGHT = 296
const RF = 18
const R = 22

const isReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const isTest = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test'

export function GraphNotchDock({
  model,
  counts,
  multi,
  query,
  setQuery,
  hits,
  hi,
  setHi,
  go,
  searchMic,
  searchField,
  lens,
  setLens,
  mode,
  changeMode,
  modes,
  show,
  setShow,
  status,
  index,
  onRetry,
  extractError,
  initialSection = null,
  onOpenChange
}: GraphNotchDockProps): React.JSX.Element {
  const [activeSection, setActiveSection] = useState<NotchSection | null>(initialSection)
  const dockRef = useRef<HTMLDivElement>(null)
  const searchBtnRef = useRef<HTMLButtonElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLElement>(null)

  const [contentDims, setContentDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [railH, setRailH] = useState(260)

  useEffect(() => {
    onOpenChange?.(activeSection !== null)
  }, [activeSection, onOpenChange])

  // Focus search input when search section opens
  useEffect(() => {
    if (activeSection === 'search') {
      searchField.current?.focus()
    }
  }, [activeSection, searchField])

  // Measure section content and rail column with ResizeObserver
  const measureContent = useCallback(() => {
    if (contentRef.current) {
      setContentDims({
        w: Math.ceil(contentRef.current.offsetWidth),
        h: Math.ceil(contentRef.current.offsetHeight)
      })
    } else {
      setContentDims({ w: 0, h: 0 })
    }
    if (railRef.current) {
      setRailH(Math.ceil(railRef.current.offsetHeight))
    }
  }, [])

  useEffect(() => {
    measureContent()

    if (typeof ResizeObserver === 'undefined') return

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === contentRef.current) {
          const borderBox = Array.isArray(entry.borderBoxSize)
            ? entry.borderBoxSize[0]
            : (entry.borderBoxSize as unknown as ResizeObserverSize | undefined)
          const w = borderBox ? borderBox.inlineSize : entry.contentRect.width
          const h = borderBox ? borderBox.blockSize : entry.contentRect.height
          setContentDims({ w: Math.ceil(w), h: Math.ceil(h) })
        } else if (entry.target === railRef.current) {
          const borderBox = Array.isArray(entry.borderBoxSize)
            ? entry.borderBoxSize[0]
            : (entry.borderBoxSize as unknown as ResizeObserverSize | undefined)
          const h = borderBox ? borderBox.blockSize : entry.contentRect.height
          setRailH(Math.ceil(h))
        }
      }
    })

    if (contentRef.current) ro.observe(contentRef.current)
    if (railRef.current) ro.observe(railRef.current)

    return () => ro.disconnect()
  }, [activeSection, measureContent])

  // Click outside to collapse
  useEffect(() => {
    if (!activeSection) return
    const onPointerDown = (e: PointerEvent): void => {
      if (!dockRef.current?.contains(e.target as Node)) {
        setActiveSection(null)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [activeSection])

  // Escape key handling
  useEffect(() => {
    if (!activeSection) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        const isInsideDock = e.target instanceof Node && Boolean(dockRef.current?.contains(e.target))
        if (isInsideDock) {
          if (activeSection === 'search' && query) {
            e.preventDefault()
            e.stopPropagation()
            setQuery('')
            setHi(-1)
            return
          }
          e.preventDefault()
          e.stopPropagation()
          setActiveSection(null)
          searchBtnRef.current?.focus()
          return
        }
        // If Escape occurred outside the dock (e.g. window/canvas), close dock
        // without preventing default so card/dialog can also handle it.
        setActiveSection(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeSection, query, setQuery, setHi])

  const closedHeight = Math.max(CLOSED_HEIGHT, railH + 20)

  // Expanded width adapts to content up to MAX_OPEN_WIDTH (300px)
  const targetW = activeSection
    ? Math.min(
        MAX_OPEN_WIDTH,
        Math.max(
          CLOSED_WIDTH,
          contentDims.w > 0 ? contentDims.w + CLOSED_WIDTH + 16 : DEFAULT_OPEN_WIDTH
        )
      )
    : CLOSED_WIDTH

  // Expanded height: max(closed icon column height, real section content height + padding)
  const fallbackH =
    activeSection === 'search' && hits.length > 0
      ? closedHeight + Math.min(220, hits.length * 36)
      : closedHeight
  const targetContentH = contentDims.h > 0 ? contentDims.h + 24 : fallbackH
  const maxH = typeof window !== 'undefined' ? Math.max(closedHeight, window.innerHeight - 48) : 720
  const targetH = activeSection ? Math.min(maxH, Math.max(closedHeight, targetContentH)) : closedHeight

  const animRef = useRef({
    currentW: initialSection ? DEFAULT_OPEN_WIDTH : CLOSED_WIDTH,
    currentH: CLOSED_HEIGHT,
    vx: 0,
    vy: 0,
    lastTime: 0,
    rafId: 0
  })

  const [dims, setDims] = useState(() => ({
    w: initialSection ? DEFAULT_OPEN_WIDTH : CLOSED_WIDTH,
    h: CLOSED_HEIGHT,
    isHalfway: !!initialSection
  }))

  // Spring physics integrator (stiffness ~320, damping ~26)
  useEffect(() => {
    const anim = animRef.current
    if (isReducedMotion() || isTest) {
      anim.currentW = targetW
      anim.currentH = targetH
      anim.vx = 0
      anim.vy = 0
      // Reduced motion: snap to the target at once, no animation frame to wait for.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDims({ w: targetW, h: targetH, isHalfway: targetW > CLOSED_WIDTH })
      return
    }

    const loop = (now: number): void => {
      if (!anim.lastTime) anim.lastTime = now
      const dt = Math.min((now - anim.lastTime) / 1000, 0.032)
      anim.lastTime = now

      const stiffness = 320
      const damping = 26

      const ax = -stiffness * (anim.currentW - targetW) - damping * anim.vx
      const ay = -stiffness * (anim.currentH - targetH) - damping * anim.vy

      anim.vx += ax * dt
      anim.vy += ay * dt

      anim.currentW += anim.vx * dt
      anim.currentH += anim.vy * dt

      const isExpanded = targetW > CLOSED_WIDTH
      const halfwayThreshold = CLOSED_WIDTH + (targetW - CLOSED_WIDTH) * 0.45
      const isHalfway = isExpanded && anim.currentW >= halfwayThreshold

      const settled =
        Math.abs(anim.currentW - targetW) < 0.2 &&
        Math.abs(anim.vx) < 0.2 &&
        Math.abs(anim.currentH - targetH) < 0.2 &&
        Math.abs(anim.vy) < 0.2

      if (settled) {
        anim.currentW = targetW
        anim.currentH = targetH
        anim.vx = 0
        anim.vy = 0
        anim.lastTime = 0
        anim.rafId = 0
        setDims({ w: targetW, h: targetH, isHalfway: targetW > CLOSED_WIDTH })
        return
      }

      setDims({ w: anim.currentW, h: anim.currentH, isHalfway })
      anim.rafId = requestAnimationFrame(loop)
    }

    anim.lastTime = performance.now()
    if (anim.rafId) cancelAnimationFrame(anim.rafId)
    anim.rafId = requestAnimationFrame(loop)

    return () => {
      if (anim.rafId) cancelAnimationFrame(anim.rafId)
      anim.rafId = 0
      anim.lastTime = 0
    }
  }, [targetW, targetH])

  const W = Math.max(RF + R, dims.w)
  const H = Math.max(1, dims.h)

  const { pathD, strokeD } = useMemo(() => {
    // Mirrored notch docked on the right border (x = W)
    // Fillets above and below fuse with right edge, rounded corners (r=22) on the left side
    const p = `M ${W} 0 A ${RF} ${RF} 0 0 1 ${W - RF} ${RF} L ${R} ${RF} A ${R} ${R} 0 0 0 0 ${RF + R} L 0 ${RF + H - R} A ${R} ${R} 0 0 0 ${R} ${RF + H} L ${W - RF} ${RF + H} A ${RF} ${RF} 0 0 1 ${W} ${H + 2 * RF} Z`
    const s = `M ${W} 0 A ${RF} ${RF} 0 0 1 ${W - RF} ${RF} L ${R} ${RF} A ${R} ${R} 0 0 0 0 ${RF + R} L 0 ${RF + H - R} A ${R} ${R} 0 0 0 ${R} ${RF + H} L ${W - RF} ${RF + H} A ${RF} ${RF} 0 0 1 ${W} ${H + 2 * RF}`
    return { pathD: p, strokeD: s }
  }, [W, H])

  const toggleSection = useCallback((sec: NotchSection) => {
    setActiveSection((curr) => (curr === sec ? null : sec))
  }, [])

  const totalConcepts = model?.concepts.length ?? 0
  const duePct = totalConcepts > 0 ? Math.round((counts.due / totalConcepts) * 100) : 0
  const neverPct = totalConcepts > 0 ? Math.round((counts.never / totalConcepts) * 100) : 0
  const fragilePct = totalConcepts > 0 ? Math.round((counts.fragile / totalConcepts) * 100) : 0
  const chainsCount = model ? new Set(model.arrows.map((a) => a.chain)).size : 0
  const metaString = model
    ? `${model.concepts.length} concetti da ${model.regions.length} note · ${chainsCount} catene · ${multi} in più note`
    : 'Carico il grafo…'

  const lensOptions = useMemo(
    () => [
      { value: 'all' as Lens, label: 'Tutto' },
      { value: 'due' as Lens, label: `Da ripassare (${counts.due})` },
      { value: 'never' as Lens, label: `Mai visti (${counts.never})` },
      { value: 'fragile' as Lens, label: `Basi fragili (${counts.fragile})` }
    ],
    [counts.due, counts.never, counts.fragile]
  )

  const sectionLabel =
    activeSection === 'search'
      ? 'Ricerca nel grafo'
      : activeSection === 'lens'
        ? 'Evidenzia concetti'
        : activeSection === 'layout'
          ? 'Disposizione e strati'
          : 'Stato del grafo'

  return (
    <div
      ref={dockRef}
      className={`gnotch-dock${activeSection ? ' open' : ''}`}
      style={{ width: `${dims.w}px`, height: `${dims.h}px` }}
    >
      {/* Dynamic continuous SVG boundary with inverse fillets extending RF above and below */}
      <svg
        className="gnotch-svg"
        width={W}
        height={H + 2 * RF}
        viewBox={`0 0 ${W} ${H + 2 * RF}`}
        fill="none"
        style={{ overflow: 'visible' }}
        aria-hidden="true"
      >
        <path d={pathD} fill="#0B0C0E" />
        <path d={strokeD} fill="none" stroke="rgba(255, 255, 255, 0.09)" strokeWidth="1" />
      </svg>

      {/* Right rail: 4 compact icon buttons (36px, white stroke 1.6) */}
      <nav ref={railRef} className="gnotch-rail" aria-label="Controlli del grafo">
        {/* a) Ricerca */}
        <button
          ref={searchBtnRef}
          type="button"
          className={`gnotch-btn gmenu-btn${activeSection === 'search' ? ' on' : ''}`}
          aria-label="Vista del grafo"
          title="Vista del grafo"
          aria-expanded={activeSection === 'search'}
          aria-controls="gnotch-section-search"
          onClick={() => toggleSection('search')}
        >
          <svg
            viewBox="0 0 20 20"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="8.5" cy="8.5" r="5" />
            <path d="M12.5 12.5L16.5 16.5" />
          </svg>
        </button>

        {/* b) Evidenzia / Filtri + 3 progress rings */}
        <div className="gnotch-rail-group">
          <button
            type="button"
            className={`gnotch-btn${activeSection === 'lens' ? ' on' : ''}`}
            aria-label="Evidenzia concetti"
            aria-expanded={activeSection === 'lens'}
            aria-controls="gnotch-section-lens"
            onClick={() => toggleSection('lens')}
          >
            <svg
              viewBox="0 0 20 20"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="6" cy="7" r="2" />
              <circle cx="14" cy="13" r="2" />
              <path d="M8 7h9M3 7h1M3 13h9M16 13h1" />
            </svg>
          </button>
          <div className="gnotch-rings" aria-label="Stato memoria concetti">
            {/* Da ripassare (ambra #f2b84b) */}
            <button
              type="button"
              className="gnotch-ring-btn"
              title={`Da ripassare: ${counts.due} (${duePct}%)`}
              aria-label={`Da ripassare: ${counts.due} (${duePct}%)`}
              onClick={() => {
                setLens('due')
                setActiveSection('lens')
              }}
            >
              <svg className="gnotch-ring" viewBox="0 0 24 24" width="22" height="22">
                <circle
                  className={`gnotch-ring-track${duePct === 0 ? ' zero' : ''}`}
                  cx="12"
                  cy="12"
                  r="10"
                  stroke={duePct === 0 ? '#2A2E38' : '#23262F'}
                  strokeWidth="2.2"
                  fill="none"
                />
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="#f2b84b"
                  strokeWidth="2.2"
                  fill="none"
                  strokeDasharray="62.83"
                  strokeDashoffset={62.83 * (1 - duePct / 100)}
                  strokeLinecap="round"
                  transform="rotate(-90 12 12)"
                  style={{ opacity: duePct === 0 ? 0 : 1 }}
                />
              </svg>
              <span className="gnotch-ring-pct">{duePct}%</span>
            </button>
            {/* Mai visti (viola #a58bff) */}
            <button
              type="button"
              className="gnotch-ring-btn"
              title={`Mai visti: ${counts.never} (${neverPct}%)`}
              aria-label={`Mai visti: ${counts.never} (${neverPct}%)`}
              onClick={() => {
                setLens('never')
                setActiveSection('lens')
              }}
            >
              <svg className="gnotch-ring" viewBox="0 0 24 24" width="22" height="22">
                <circle
                  className={`gnotch-ring-track${neverPct === 0 ? ' zero' : ''}`}
                  cx="12"
                  cy="12"
                  r="10"
                  stroke={neverPct === 0 ? '#2A2E38' : '#23262F'}
                  strokeWidth="2.2"
                  fill="none"
                />
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="#a58bff"
                  strokeWidth="2.2"
                  fill="none"
                  strokeDasharray="62.83"
                  strokeDashoffset={62.83 * (1 - neverPct / 100)}
                  strokeLinecap="round"
                  transform="rotate(-90 12 12)"
                  style={{ opacity: neverPct === 0 ? 0 : 1 }}
                />
              </svg>
              <span className="gnotch-ring-pct">{neverPct}%</span>
            </button>
            {/* Basi fragili (corallo #ed9572) */}
            <button
              type="button"
              className="gnotch-ring-btn"
              title={`Basi fragili: ${counts.fragile} (${fragilePct}%)`}
              aria-label={`Basi fragili: ${counts.fragile} (${fragilePct}%)`}
              onClick={() => {
                setLens('fragile')
                setActiveSection('lens')
              }}
            >
              <svg className="gnotch-ring" viewBox="0 0 24 24" width="22" height="22">
                <circle
                  className={`gnotch-ring-track${fragilePct === 0 ? ' zero' : ''}`}
                  cx="12"
                  cy="12"
                  r="10"
                  stroke={fragilePct === 0 ? '#2A2E38' : '#23262F'}
                  strokeWidth="2.2"
                  fill="none"
                />
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="#ed9572"
                  strokeWidth="2.2"
                  fill="none"
                  strokeDasharray="62.83"
                  strokeDashoffset={62.83 * (1 - fragilePct / 100)}
                  strokeLinecap="round"
                  transform="rotate(-90 12 12)"
                  style={{ opacity: fragilePct === 0 ? 0 : 1 }}
                />
              </svg>
              <span className="gnotch-ring-pct">{fragilePct}%</span>
            </button>
          </div>
        </div>

        {/* c) Disposizione e strati */}
        <button
          type="button"
          className={`gnotch-btn${activeSection === 'layout' ? ' on' : ''}`}
          aria-label="Disposizione e strati"
          aria-expanded={activeSection === 'layout'}
          aria-controls="gnotch-section-layout"
          onClick={() => toggleSection('layout')}
        >
          <svg
            viewBox="0 0 20 20"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="5" cy="6" r="2" />
            <circle cx="15" cy="6" r="2" />
            <circle cx="10" cy="14" r="2" />
            <path d="M6.5 7.5L8.5 12.5M13.5 7.5L11.5 12.5" />
          </svg>
        </button>

        {/* d) Stato del grafo */}
        <div className="gnotch-rail-group">
          <button
            type="button"
            className={`gnotch-btn${activeSection === 'status' ? ' on' : ''}`}
            aria-label="Stato del grafo"
            aria-expanded={activeSection === 'status'}
            aria-controls="gnotch-section-status"
            onClick={() => toggleSection('status')}
          >
            <svg
              viewBox="0 0 20 20"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 10h3l2.5-5 3 10 2.5-5h3" />
            </svg>
          </button>
          <button
            type="button"
            className="gnotch-mini-badge"
            title={metaString}
            aria-label={metaString}
            onClick={() => toggleSection('status')}
          >
            <span>{totalConcepts}c</span>
            <span className="sep">·</span>
            <span>{chainsCount}k</span>
            <span className="gnotch-sr-only">{metaString}</span>
          </button>
        </div>
      </nav>

      {/* Expanded contextual content */}
      {activeSection && (
        <div
          ref={contentRef}
          className={`gnotch-content${dims.isHalfway ? ' enter' : ''}`}
          role="region"
          id={`gnotch-section-${activeSection}`}
          aria-label={activeSection === 'status' ? metaString : sectionLabel}
          style={{
            opacity: dims.isHalfway ? 1 : 0,
            transform: dims.isHalfway ? 'translateX(0)' : 'translateX(-6px)',
            pointerEvents: dims.isHalfway ? 'auto' : 'none'
          }}
        >
          <h2 className="sr">Il tuo grafo</h2>
          {activeSection === 'search' && (
            <div className="gnotch-section-body">
              <div className="gsearch">
                <div className="mic-field">
                  <input
                    ref={searchField}
                    readOnly={searchMic.state !== 'idle'}
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
                      else if (e.key === 'Enter' && hits.length) {
                        e.preventDefault()
                        go(hits[Math.max(0, hi)])
                        return
                      } else if (e.key === 'Escape' && query) {
                        e.preventDefault()
                        e.stopPropagation()
                        setQuery('')
                        setHi(-1)
                        return
                      } else return
                      e.preventDefault()
                    }}
                  />
                  <MicButton dictation={searchMic} size="sm" />
                </div>
                <DictationError dictation={searchMic} />
                {hits.length > 0 && (
                  <ul role="listbox" id="graph-results" className="gresults">
                    {hits.map((h, i) => (
                      <li
                        key={`${h.kind}:${h.id}`}
                        id={`gr-${i}`}
                        role="option"
                        aria-selected={i === hi}
                        onClick={() => {
                          go(h)
                        }}
                      >
                        <span>{h.label}</span>
                        <small>{h.kind === 'concept' ? 'concetto' : 'nota'}</small>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {activeSection === 'lens' && (
            <div className="gnotch-section-body">
              <div className="gsec">
                <h3>Evidenzia</h3>
                <div className="gnotch-menu-list" role="tablist" aria-label="Evidenzia">
                  {lensOptions.map((opt) => {
                    const isSelected = lens === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="tab"
                        aria-selected={isSelected}
                        aria-checked={isSelected}
                        className={`gnotch-menu-row${isSelected ? ' active' : ''}`}
                        onClick={() => {
                          setLens(opt.value)
                          setActiveSection('lens')
                        }}
                      >
                        <span className="gnotch-menu-label">{opt.label}</span>
                        {isSelected && <span className="gnotch-menu-dot" aria-hidden="true" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {activeSection === 'layout' && (
            <div className="gnotch-section-body">
              <div className="gsec">
                <h3>Disposizione</h3>
                <div className="gnotch-menu-list" role="tablist" aria-label="Disposizione">
                  {modes.map(([m, label]) => {
                    const isSelected = mode === m
                    return (
                      <button
                        key={m}
                        type="button"
                        role="tab"
                        aria-selected={isSelected}
                        aria-checked={isSelected}
                        className={`gnotch-menu-row${isSelected ? ' active' : ''}`}
                        onClick={() => changeMode(m)}
                      >
                        <span className="gnotch-menu-label">{label}</span>
                        {isSelected && <span className="gnotch-menu-dot" aria-hidden="true" />}
                      </button>
                    )
                  })}
                </div>
                <div className="gnotch-sr-only" role="radiogroup" aria-label="Disposizione">
                  {modes.map(([m, label]) => (
                    <input
                      key={m}
                      type="radio"
                      name="gnotch-layout-mode"
                      value={m}
                      checked={mode === m}
                      onChange={() => changeMode(m)}
                      aria-label={label}
                    />
                  ))}
                </div>
                <p className="hint">{modes.find((m) => m[0] === mode)?.[2]}</p>
              </div>
              <div className="gsec gtoggles">
                <h3>Strati</h3>
                <div className="gnotch-menu-list">
                  {(
                    [
                      ['regions', 'Regioni'],
                      ['wikilinks', 'Link di Obsidian'],
                      ['frontier', `Frontiera${model ? ` (${model.frontier.length})` : ''}`]
                    ] as const
                  ).map(([key, label]) => {
                    const isPressed = show[key]
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={isPressed}
                        className={`gnotch-menu-row${isPressed ? ' active' : ''}`}
                        onClick={() => setShow({ ...show, [key]: !show[key] })}
                      >
                        <span className="gnotch-menu-label">{label}</span>
                        {isPressed && <span className="gnotch-menu-dot" aria-hidden="true" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {activeSection === 'status' && (
            <div className="gnotch-section-body">
              <div className="gsec">
                <h3>Stato del grafo</h3>
                <div className="gnotch-status-rows">
                  {model ? (
                    <>
                      <div className="gnotch-status-row">
                        <span>Concetti</span><strong>{totalConcepts}</strong>
                      </div>
                      <div className="gnotch-status-row"><span>Note</span><strong>{model.regions.length}</strong></div>
                      <div className="gnotch-status-row"><span>Catene</span><strong>{chainsCount}</strong></div>
                      <div className="gnotch-status-row"><span>In più note</span><strong>{multi}</strong></div>
                    </>
                  ) : (
                    <div className="gnotch-status-row">Carico il grafo…</div>
                  )}
                </div>
                {model && totalConcepts > 0 && (
                  <span className="gnotch-sr-only">{metaString}</span>
                )}
                <StatusLine
                  status={status}
                  index={index}
                  onRetry={onRetry}
                  error={extractError}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Persistent Lens section fallback - accessible hidden when lens is not active */}
      {activeSection !== 'lens' && (
        <div
          className="gnotch-hidden-lens"
          id="gnotch-section-lens"
          aria-label="Evidenzia concetti"
        >
          <div className="gnotch-section-body">
            <div className="gsec">
              <h3>Evidenzia</h3>
              <div role="tablist" aria-label="Evidenzia">
                {lensOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="tab"
                    aria-selected={lens === opt.value}
                    onClick={() => setLens(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Live status banner for background extraction & error notification */}
      {activeSection !== 'status' && (status.running || status.lastError || extractError) && (
        <div className="gnotch-live-status">
          <StatusLine
            status={status}
            index={index}
            onRetry={onRetry}
            error={extractError}
          />
        </div>
      )}
    </div>
  )
}

export function StatusLine({
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
  const noteTitle = (path: string): string =>
    index.notes.find((n) => n.path === path)?.title ?? path.split('/').pop()!.replace(/\.md$/, '')

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
        Sto estraendo «{noteTitle(status.running)}»…
        {status.queued.length > 0 ? ` (${status.queued.length} in coda)` : ''}
      </p>
    )
  if (status.lastError)
    return (
      <p className="gstatus err" role="alert">
        «{noteTitle(status.lastError.notePath)}»: {status.lastError.message}{' '}
        <button type="button" onClick={() => onRetry(status.lastError!.notePath)}>
          Riprova
        </button>
      </p>
    )
  return null
}
