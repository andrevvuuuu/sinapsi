import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import type { EngineStatus as Status } from '../../../shared/api'
import type { Engine } from '../../../shared/settings-schema'
import './ai-status.css'

// TODO: Wire this to real quota IPC (e.g. window.sinapsi.ai.quota()) once backend quota endpoint lands.
export interface EngineRemainingQuota {
  sessioni: number
  noteVive: number
  ripassi: number
  pratiche: number
}

export interface EngineQuotaData {
  weekly: number
  session5h: number
  resetHint: string
  remaining: EngineRemainingQuota
}

export type AIQuotaData = EngineQuotaData

const CLAUDE_QUOTA: EngineQuotaData = {
  weekly: 62,
  session5h: 84,
  resetHint: 'si azzera tra 2 h 14 min',
  remaining: {
    sessioni: 3,
    noteVive: 12,
    ripassi: 5,
    pratiche: 2
  }
}

const GEMINI_QUOTA: EngineQuotaData = {
  weekly: 35,
  session5h: 48,
  resetHint: 'si azzera tra 4 h 30 min',
  remaining: {
    sessioni: 8,
    noteVive: 24,
    ripassi: 15,
    pratiche: 6
  }
}

export const MOCK_QUOTA_DATA: Record<Engine | 'gemini', EngineQuotaData> = {
  claude: CLAUDE_QUOTA,
  agy: GEMINI_QUOTA,
  gemini: GEMINI_QUOTA
}

const ENGINES: readonly { key: Engine; name: string }[] = [
  { key: 'claude', name: 'Claude' },
  { key: 'agy', name: 'Gemini' }
]

function getEngineStatusColor(s: Status | undefined | null): string {
  if (!s) return 'var(--muted, #8E95A5)'
  switch (s) {
    case 'idle':
      return 'var(--good, #5fd38a)'
    case 'busy':
      return 'var(--warn, #f2b84b)'
    case 'auth':
    case 'missing':
    case 'error':
    default:
      return 'var(--bad, #f08080)'
  }
}

function getEngineStatusLabel(s: Status | undefined | null): string {
  switch (s) {
    case 'idle':
      return 'Pronto'
    case 'busy':
      return 'Occupato'
    case 'auth':
    case 'missing':
    case 'error':
    default:
      return 'Non disponibile'
  }
}

function getQuotaColor(percent: number): string {
  if (percent < 60) return 'var(--good, #5fd38a)'
  if (percent <= 85) return 'var(--warn, #f2b84b)'
  return 'var(--bad, #f08080)'
}

function getDefaultEngine(status: Record<Engine, Status> | null): Engine {
  for (const e of ENGINES) {
    if (status?.[e.key] === 'idle') {
      return e.key
    }
  }
  return 'claude'
}

interface CrossfadeProps {
  children: React.ReactNode
  idKey: string
  className?: string
  style?: React.CSSProperties
  shouldReduce: boolean | null
  block?: boolean
}

function Crossfade({
  children,
  idKey,
  className,
  style,
  shouldReduce,
  block = false
}: CrossfadeProps): React.JSX.Element {
  if (shouldReduce) {
    return (
      <span className={className} style={style}>
        {children}
      </span>
    )
  }

  return (
    <span className={block ? 'ai-status-crossfade-block' : 'ai-status-crossfade'}>
      <AnimatePresence initial={false}>
        <motion.span
          key={idKey}
          className={`ai-status-crossfade-cell ${className ?? ''}`}
          style={style}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

export function AIStatusPopover({
  status
}: {
  status: Record<Engine, Status> | null
}): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const [coords, setCoords] = useState<{ left: number; bottom: number }>({ left: 0, bottom: 0 })
  const [userEngine, setUserEngine] = useState<Engine | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Record<Engine, HTMLButtonElement | null>>({
    claude: null,
    agy: null
  })
  const shouldReduce = useReducedMotion()

  const selectedEngine: Engine = userEngine ?? getDefaultEngine(status)

  const selectEngine = useCallback((engine: Engine): void => {
    setUserEngine(engine)
  }, [])

  const updatePosition = useCallback((): void => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    // Anchor to the right of the trigger with an 8px offset, bottom-aligned with trigger's bottom, clamped to viewport
    const left = Math.max(8, Math.min(window.innerWidth - 288, Math.round(rect.right + 8)))
    const bottom = Math.max(8, Math.round(window.innerHeight - rect.bottom))
    setCoords({ left, bottom })
  }, [])

  const handleToggle = (): void => {
    if (isOpen) {
      setIsOpen(false)
      triggerRef.current?.focus()
    } else {
      updatePosition()
      setIsOpen(true)
    }
  }

  const handleTabKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const currentIndex = ENGINES.findIndex((eng): boolean => eng.key === selectedEngine)
      const nextIndex =
        e.key === 'ArrowRight'
          ? (currentIndex + 1) % ENGINES.length
          : (currentIndex - 1 + ENGINES.length) % ENGINES.length
      const nextEngine = ENGINES[nextIndex].key
      selectEngine(nextEngine)
      tabRefs.current[nextEngine]?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      const firstEngine = ENGINES[0].key
      selectEngine(firstEngine)
      tabRefs.current[firstEngine]?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      const lastEngine = ENGINES[ENGINES.length - 1].key
      selectEngine(lastEngine)
      tabRefs.current[lastEngine]?.focus()
    }
  }

  // Handle outside click and Escape key
  useEffect((): (() => void) | void => {
    if (!isOpen) return

    updatePosition()

    const handlePointerDown = (e: PointerEvent): void => {
      const target = e.target as Node | null
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setIsOpen(false)
        triggerRef.current?.focus()
      }
    }

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setIsOpen(false)
        triggerRef.current?.focus()
      }
    }

    const handleReposition = (): void => {
      updatePosition()
    }

    window.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleReposition)
    window.addEventListener('scroll', handleReposition, true)

    return (): void => {
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleReposition)
      window.removeEventListener('scroll', handleReposition, true)
    }
  }, [isOpen, updatePosition])

  const claudeColor = getEngineStatusColor(status?.claude)
  const geminiColor = getEngineStatusColor(status?.agy)

  const selectedQuota = MOCK_QUOTA_DATA[selectedEngine]
  const weeklyColor = getQuotaColor(selectedQuota.weekly)
  const sessionColor = getQuotaColor(selectedQuota.session5h)

  const selectedStatus = status ? status[selectedEngine] : null
  const selectedStatusColor = getEngineStatusColor(selectedStatus)
  const selectedStatusLabel = getEngineStatusLabel(selectedStatus)

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="ai-status-trigger"
        aria-label="Stato dei motori AI"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={handleToggle}
        title="Stato dei motori AI"
      >
        <span
          className="ai-status-trigger-dot"
          style={{ backgroundColor: claudeColor }}
          aria-hidden="true"
        />
        <span
          className="ai-status-trigger-dot"
          style={{ backgroundColor: geminiColor }}
          aria-hidden="true"
        />
      </button>

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              <motion.div
                ref={popoverRef}
                className="ai-status-popover"
                role="dialog"
                aria-modal="false"
                aria-label="Stato dei motori AI e quota"
                tabIndex={-1}
                style={{
                  position: 'fixed',
                  left: `${coords.left}px`,
                  bottom: `${coords.bottom}px`,
                  originX: 0,
                  originY: 1,
                  transformOrigin: 'bottom left',
                  zIndex: 1000
                }}
                initial={shouldReduce ? { opacity: 0 } : { opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={shouldReduce ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
                transition={
                  shouldReduce
                    ? { duration: 0.1 }
                    : { type: 'spring', stiffness: 420, damping: 28, mass: 0.7 }
                }
              >
                <div className="ai-status-shell">
                  <div className="ai-status-core">
                    {/* 1. Header + Folded Engine Selector */}
                    <div className="ai-status-section">
                      <div className="ai-status-header">
                        <span className="ai-status-title">Motori AI</span>
                      </div>

                      <div
                        role="tablist"
                        aria-label="Selezione motore AI"
                        className="ai-status-segmented-control"
                      >
                        {ENGINES.map((e): React.JSX.Element => {
                          const isSelected = selectedEngine === e.key
                          const engineState = status ? status[e.key] : null
                          const dotColor = getEngineStatusColor(engineState)
                          return (
                            <button
                              key={e.key}
                              id={`ai-engine-tab-${e.key}`}
                              ref={(el): void => {
                                tabRefs.current[e.key] = el
                              }}
                              type="button"
                              role="tab"
                              aria-selected={isSelected}
                              aria-controls="ai-engine-tabpanel"
                              tabIndex={isSelected ? 0 : -1}
                              className={`ai-status-segment ${isSelected ? 'is-selected' : ''}`}
                              onClick={(): void => selectEngine(e.key)}
                              onKeyDown={handleTabKeyDown}
                            >
                              {isSelected && (
                                <motion.div
                                  layoutId={shouldReduce ? undefined : 'ai-status-active-pill'}
                                  className="ai-status-segment-pill"
                                  transition={
                                    shouldReduce
                                      ? { duration: 0 }
                                      : { type: 'spring', stiffness: 500, damping: 40, mass: 0.8 }
                                  }
                                />
                              )}
                              <span className="ai-status-segment-content">
                                <span
                                  className="ai-status-dot"
                                  style={{ backgroundColor: dotColor }}
                                  aria-hidden="true"
                                />
                                <span className="ai-status-segment-label">{e.name}</span>
                              </span>
                            </button>
                          )
                        })}
                      </div>

                      {/* Selected Engine Status Row */}
                      <div className="ai-status-engine-status-row">
                        <span className="ai-status-engine-status-label">Stato</span>
                        <div className="ai-status-engine-pill">
                          <span
                            className="ai-status-dot"
                            style={{ backgroundColor: selectedStatusColor }}
                            aria-hidden="true"
                          />
                          <Crossfade
                            idKey={selectedEngine}
                            shouldReduce={shouldReduce}
                            className="ai-status-engine-status-text"
                          >
                            {selectedStatusLabel}
                          </Crossfade>
                        </div>
                      </div>
                    </div>

                    {/* Tabpanel wrapping Quota & Rimangono */}
                    <div
                      id="ai-engine-tabpanel"
                      role="tabpanel"
                      aria-labelledby={`ai-engine-tab-${selectedEngine}`}
                      tabIndex={0}
                      className="ai-status-tabpanel"
                    >
                      <div className="ai-status-divider" />

                      {/* 2. Quota Section */}
                      <div className="ai-status-section">
                        <div className="ai-status-header">
                          <span className="ai-status-title">Quota</span>
                        </div>
                        <div className="ai-status-meters">
                          {/* Meter 1: Settimana */}
                          <div className="ai-status-meter-item">
                            <div className="ai-status-meter-info">
                              <span className="ai-status-meter-name">Settimana</span>
                              <Crossfade
                                idKey={selectedEngine}
                                shouldReduce={shouldReduce}
                                className="ai-status-meter-val"
                                style={{ color: weeklyColor }}
                              >
                                {selectedQuota.weekly}%
                              </Crossfade>
                            </div>
                            <div className="ai-status-progress-track">
                              <motion.div
                                className="ai-status-progress-fill"
                                initial={false}
                                animate={{
                                  width: `${selectedQuota.weekly}%`,
                                  backgroundColor: weeklyColor
                                }}
                                transition={
                                  shouldReduce
                                    ? { duration: 0 }
                                    : {
                                        width: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
                                        backgroundColor: { duration: 0.25, ease: 'easeOut' }
                                      }
                                }
                              />
                            </div>
                          </div>

                          {/* Meter 2: Sessione 5h */}
                          <div className="ai-status-meter-item">
                            <div className="ai-status-meter-info">
                              <span className="ai-status-meter-name">Sessione 5h</span>
                              <Crossfade
                                idKey={selectedEngine}
                                shouldReduce={shouldReduce}
                                className="ai-status-meter-val"
                                style={{ color: sessionColor }}
                              >
                                {selectedQuota.session5h}%
                              </Crossfade>
                            </div>
                            <div className="ai-status-progress-track">
                              <motion.div
                                className="ai-status-progress-fill"
                                initial={false}
                                animate={{
                                  width: `${selectedQuota.session5h}%`,
                                  backgroundColor: sessionColor
                                }}
                                transition={
                                  shouldReduce
                                    ? { duration: 0 }
                                    : {
                                        width: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
                                        backgroundColor: { duration: 0.25, ease: 'easeOut' }
                                      }
                                }
                              />
                            </div>
                            <Crossfade
                              idKey={selectedEngine}
                              shouldReduce={shouldReduce}
                              block
                              className="ai-status-reset-hint"
                            >
                              {selectedQuota.resetHint}
                            </Crossfade>
                          </div>
                        </div>
                      </div>

                      <div className="ai-status-divider" />

                      {/* 3. Rimangono Section */}
                      <div className="ai-status-section">
                        <div className="ai-status-header">
                          <span className="ai-status-title">Rimangono</span>
                        </div>
                        <div className="ai-status-rem-grid">
                          <div className="ai-status-rem-cell">
                            <Crossfade
                              idKey={selectedEngine}
                              shouldReduce={shouldReduce}
                              className="ai-status-rem-num"
                            >
                              {selectedQuota.remaining.sessioni}
                            </Crossfade>
                            <span className="ai-status-rem-label">sessioni</span>
                          </div>
                          <div className="ai-status-rem-cell">
                            <Crossfade
                              idKey={selectedEngine}
                              shouldReduce={shouldReduce}
                              className="ai-status-rem-num"
                            >
                              {selectedQuota.remaining.noteVive}
                            </Crossfade>
                            <span className="ai-status-rem-label">note vive</span>
                          </div>
                          <div className="ai-status-rem-cell">
                            <Crossfade
                              idKey={selectedEngine}
                              shouldReduce={shouldReduce}
                              className="ai-status-rem-num"
                            >
                              {selectedQuota.remaining.ripassi}
                            </Crossfade>
                            <span className="ai-status-rem-label">ripassi</span>
                          </div>
                          <div className="ai-status-rem-cell">
                            <Crossfade
                              idKey={selectedEngine}
                              shouldReduce={shouldReduce}
                              className="ai-status-rem-num"
                            >
                              {selectedQuota.remaining.pratiche}
                            </Crossfade>
                            <span className="ai-status-rem-label">pratiche</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  )
}
