import { useEffect, useRef, useState } from 'react'
import type { EngineStatus } from '../../../shared/api'

export type WaitStage = 'preparing' | 'queued' | 'thinking' | 'writing' | 'slow'

const STAGE_LABELS: Record<WaitStage, string> = {
  preparing: 'Preparo…',
  queued: 'In coda: il motore sta finendo un altro lavoro',
  thinking: 'Ci sto ragionando',
  writing: 'Sto scrivendo',
  slow: 'Ci sta mettendo più del solito…'
}

export function useWaitStage({
  engine,
  active,
  writing
}: {
  engine: 'agy' | 'claude' | null
  active: boolean
  writing: boolean
}): {
  stage: WaitStage
  seconds: number
  label: string
} {
  const [seconds, setSeconds] = useState(0)
  const [baseStage, setBaseStage] = useState<WaitStage>('preparing')
  const [isSlow, setIsSlow] = useState(false)

  const secondsSinceSignalRef = useRef(0)
  const hasStartedWritingRef = useRef(false)
  const wasQueuedRef = useRef(false)
  const hasSeenIdleRef = useRef(false)

  // Track writing state
  useEffect(() => {
    if (!active) return
    if (writing) {
      hasStartedWritingRef.current = true
      wasQueuedRef.current = false
      secondsSinceSignalRef.current = 0
      setIsSlow(false)
      setBaseStage('writing')
    }
  }, [active, writing])

  // Lifecycle and subscriptions when active
  useEffect(() => {
    if (!active) {
      setSeconds(0)
      setBaseStage('preparing')
      setIsSlow(false)
      hasStartedWritingRef.current = false
      wasQueuedRef.current = false
      hasSeenIdleRef.current = false
      secondsSinceSignalRef.current = 0
      return
    }

    let mounted = true
    secondsSinceSignalRef.current = 0
    setSeconds(0)
    setIsSlow(false)
    hasSeenIdleRef.current = false
    wasQueuedRef.current = false
    hasStartedWritingRef.current = writing

    if (writing) {
      setBaseStage('writing')
    } else {
      setBaseStage('preparing')
    }

    const unsub = window.sinapsi?.ai?.onStatus?.((statuses: Record<string, EngineStatus>) => {
      if (!mounted) return
      secondsSinceSignalRef.current = 0
      setIsSlow(false)
      if (!engine) return
      const s = statuses?.[engine]
      if (!s) return
      if (hasStartedWritingRef.current) return

      if (wasQueuedRef.current) {
        if (s === 'idle') {
          wasQueuedRef.current = false
          hasSeenIdleRef.current = true
          setBaseStage('preparing')
        }
      } else {
        if (s === 'busy') {
          setBaseStage('thinking')
        } else if (s === 'idle') {
          hasSeenIdleRef.current = true
          setBaseStage('preparing')
        }
      }
    })

    window.sinapsi?.ai?.status?.()
      ?.then((statuses: Record<string, EngineStatus>) => {
        if (!mounted || !engine || !statuses) return
        secondsSinceSignalRef.current = 0
        setIsSlow(false)
        if (hasStartedWritingRef.current) return
        if (statuses[engine] === 'busy' && !hasSeenIdleRef.current) {
          wasQueuedRef.current = true
          setBaseStage('queued')
        }
      })
      ?.catch(() => {})

    const timer = setInterval(() => {
      setSeconds((sec) => sec + 1)
      secondsSinceSignalRef.current += 1
      if (secondsSinceSignalRef.current >= 20) {
        setIsSlow(true)
      }
    }, 1000)

    return () => {
      mounted = false
      clearInterval(timer)
      unsub?.()
    }
  }, [active, engine])

  const stage: WaitStage = isSlow ? 'slow' : baseStage
  const label = STAGE_LABELS[stage]

  return { stage, seconds, label }
}
