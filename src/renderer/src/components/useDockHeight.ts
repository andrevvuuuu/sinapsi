import { useCallback, useEffect, type RefObject } from 'react'

/**
 * Keeps `--dock-h` on the scroller equal to the real height of the dock floating over its bottom,
 * so the conversation can reserve that room and its last message is always readable above the dock.
 * `mounted` is true once both elements are on screen. Returns `measure`, to call when the dock has
 * just changed and the scroll position depends on it.
 */
export function useDockHeight(
  scroller: RefObject<HTMLElement | null>,
  dock: RefObject<HTMLElement | null>,
  mounted: boolean
): () => void {
  const measure = useCallback(() => {
    const s = scroller.current
    const d = dock.current
    if (!s || !d) return
    const h = `${Math.ceil(d.getBoundingClientRect().height)}px`
    if (s.style.getPropertyValue('--dock-h') === h) return
    // Reading the end of the conversation: stay at the end, so a taller dock does not cover it.
    const atEnd = s.scrollHeight - s.scrollTop - s.clientHeight <= 4
    s.style.setProperty('--dock-h', h)
    if (atEnd) s.scrollTop = s.scrollHeight
  }, [scroller, dock])
  useEffect(() => {
    const d = dock.current
    measure()
    if (!d || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(d)
    return () => ro.disconnect()
  }, [measure, mounted])
  return measure
}
