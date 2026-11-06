import { useEffect, useRef, type RefObject } from 'react'

type Subscription = { el: HTMLElement; update: () => void; stop: () => void }

/** Scroll, size and children of `el` keep its data-more-* marks current. */
function subscribe(el: HTMLElement): Subscription {
  const update = (): void => {
    el.toggleAttribute('data-more-above', el.scrollTop > 1)
    el.toggleAttribute('data-more-below', el.scrollHeight - el.scrollTop - el.clientHeight > 1)
  }
  el.addEventListener('scroll', update, { passive: true })
  const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
  const watch = (): void => {
    ro?.disconnect()
    ro?.observe(el)
    for (const child of Array.from(el.children)) ro?.observe(child)
  }
  // A child added or removed changes the content height and needs watching itself.
  const mo =
    typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(() => {
          watch()
          update()
        })
  mo?.observe(el, { childList: true })
  watch()
  return {
    el,
    update,
    stop: () => {
      el.removeEventListener('scroll', update)
      ro?.disconnect()
      mo?.disconnect()
    }
  }
}

/**
 * Marks a scrolling area with `data-more-above` / `data-more-below` while part of its content is
 * hidden on that side, so CSS can show the scroll edge fade only where there is more to read.
 * Subscribes once per element (again only if the ref moves to another element) and re-checks the
 * marks on every render of the owner, since that is when the content changes.
 */
export function useScrollEdges(area: RefObject<HTMLElement | null>): void {
  const sub = useRef<Subscription | null>(null)
  useEffect(() => {
    const el = area.current
    if (sub.current?.el !== el) {
      sub.current?.stop()
      sub.current = el ? subscribe(el) : null
    }
    sub.current?.update()
  })
  useEffect(
    () => () => {
      sub.current?.stop()
      sub.current = null
    },
    []
  )
}
