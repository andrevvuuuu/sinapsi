import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import type { EngineStatus as Status } from '../../../shared/api'
import type { Engine } from '../../../shared/settings-schema'
import './ai-status.css'

// TODO: Wire this to real quota IPC (e.g. window.sinapsi.ai.quota()) once backend quota endpoint lands.
interface AIQuotaData {
  weeklyPercent: number
  sessionPercent: number
  sessionResetHint: string
  remaining: {
    sessions: number
    livingNotes: number
    reviews: number
    practices: number
  }
}

const MOCK_QUOTA_DATA: AIQuotaData = {
  weeklyPercent: 62,
  sessionPercent: 84,
  sessionResetHint: 'si azzera tra 2 h 14 min',
  remaining: {
    sessions: 3,
    livingNotes: 12,
    reviews: 5,
    practices: 2
  }
}

const ENGINES: { key: Engine; name: string }[] = [
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

export function AIStatusPopover({
  status
}: {
  status: Record<Engine, Status> | null
}): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const [coords, setCoords] = useState<{ left: number; bottom: number }>({ left: 0, bottom: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const shouldReduce = useReducedMotion()

  const updatePosition = useCallback(() => {
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

  // Handle outside click and Escape key
  useEffect(() => {
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

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleReposition)
      window.removeEventListener('scroll', handleReposition, true)
    }
  }, [isOpen, updatePosition])

  const claudeColor = getEngineStatusColor(status?.claude)
  const geminiColor = getEngineStatusColor(status?.agy)

  const weeklyColor = getQuotaColor(MOCK_QUOTA_DATA.weeklyPercent)
  const sessionColor = getQuotaColor(MOCK_QUOTA_DATA.sessionPercent)

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
                    {/* 1. Header + Engine Status Rows */}
                    <div className="ai-status-section">
                      <div className="ai-status-header">
                        <span className="ai-status-title">Motori AI</span>
                      </div>
                      <div className="ai-status-engines">
                        {ENGINES.map((e) => {
                          const engineState = status ? status[e.key] : null
                          const color = getEngineStatusColor(engineState)
                          const label = getEngineStatusLabel(engineState)
                          return (
                            <div key={e.key} className="ai-status-engine-row">
                              <span className="ai-status-engine-name">{e.name}</span>
                              <div className="ai-status-engine-pill">
                                <span
                                  className="ai-status-dot"
                                  style={{ backgroundColor: color }}
                                  aria-hidden="true"
                                />
                                <span className="ai-status-engine-status-text">{label}</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

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
                            <span
                              className="ai-status-meter-val"
                              style={{ color: weeklyColor }}
                            >
                              {MOCK_QUOTA_DATA.weeklyPercent}%
                            </span>
                          </div>
                          <div className="ai-status-progress-track">
                            <div
                              className="ai-status-progress-fill"
                              style={{
                                width: `${MOCK_QUOTA_DATA.weeklyPercent}%`,
                                backgroundColor: weeklyColor
                              }}
                            />
                          </div>
                        </div>

                        {/* Meter 2: Sessione 5h */}
                        <div className="ai-status-meter-item">
                          <div className="ai-status-meter-info">
                            <span className="ai-status-meter-name">Sessione 5h</span>
                            <span
                              className="ai-status-meter-val"
                              style={{ color: sessionColor }}
                            >
                              {MOCK_QUOTA_DATA.sessionPercent}%
                            </span>
                          </div>
                          <div className="ai-status-progress-track">
                            <div
                              className="ai-status-progress-fill"
                              style={{
                                width: `${MOCK_QUOTA_DATA.sessionPercent}%`,
                                backgroundColor: sessionColor
                              }}
                            />
                          </div>
                          <span className="ai-status-reset-hint">
                            {MOCK_QUOTA_DATA.sessionResetHint}
                          </span>
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
                          <span className="ai-status-rem-num">
                            {MOCK_QUOTA_DATA.remaining.sessions}
                          </span>
                          <span className="ai-status-rem-label">sessioni</span>
                        </div>
                        <div className="ai-status-rem-cell">
                          <span className="ai-status-rem-num">
                            {MOCK_QUOTA_DATA.remaining.livingNotes}
                          </span>
                          <span className="ai-status-rem-label">note vive</span>
                        </div>
                        <div className="ai-status-rem-cell">
                          <span className="ai-status-rem-num">
                            {MOCK_QUOTA_DATA.remaining.reviews}
                          </span>
                          <span className="ai-status-rem-label">ripassi</span>
                        </div>
                        <div className="ai-status-rem-cell">
                          <span className="ai-status-rem-num">
                            {MOCK_QUOTA_DATA.remaining.practices}
                          </span>
                          <span className="ai-status-rem-label">pratiche</span>
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
