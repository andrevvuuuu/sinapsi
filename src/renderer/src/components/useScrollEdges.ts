import { useEffect, type RefObject } from 'react'

/**
 * Marks a scrolling area with `data-more-above` / `data-more-below` while part of its content is
 * hidden on that side, so CSS can show the scroll edge fade only where there is more to read.
 * Re-checks on every render of the owner, since that is when the content changes.
 */
export function useScrollEdges(area: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = area.current
    if (!el) return
    const update = (): void => {
      el.toggleAttribute('data-more-above', el.scrollTop > 1)
      el.toggleAttribute('data-more-below', el.scrollHeight - el.scrollTop - el.clientHeight > 1)
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    ro?.observe(el)
    for (const child of Array.from(el.children)) ro?.observe(child)
    return () => {
      el.removeEventListener('scroll', update)
      ro?.disconnect()
    }
  })
}
