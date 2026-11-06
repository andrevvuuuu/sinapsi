import { useLayoutEffect, useRef } from 'react'

/**
 * The «lens» of a segmented control: one element under the buttons that slides to the pressed one
 * (tokens.css .seg-lens). Put it inside the track (.seg-track), after the buttons; it follows
 * aria-pressed and the buttons' size, and hides when nothing is pressed.
 */
export function SegLens(): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const lens = ref.current
    const track = lens?.parentElement
    if (!lens || !track) return
    let placed = false
    const buttons = (): HTMLElement[] => [...track.querySelectorAll<HTMLElement>(':scope > button')]
    const place = (): void => {
      const b = buttons().find((x) => x.getAttribute('aria-pressed') === 'true')
      if (!b) {
        lens.style.opacity = '0'
        return
      }
      // A track that mounts hidden has no layout yet: wait for the first visible placement.
      if (!b.offsetWidth && !b.offsetHeight) return
      // The first placement jumps: the lens slides only from one option to another.
      if (!placed) lens.style.transition = 'none'
      lens.style.opacity = ''
      lens.style.width = `${b.offsetWidth}px`
      lens.style.height = `${b.offsetHeight}px`
      lens.style.transform = `translate(${b.offsetLeft}px, ${b.offsetTop}px)`
      if (!placed) {
        void lens.offsetWidth
        lens.style.transition = ''
        placed = true
      }
    }
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place)
    const watch = (): void => {
      ro?.disconnect()
      ro?.observe(track)
      buttons().forEach((b) => ro?.observe(b))
    }
    const mo = new MutationObserver(() => {
      watch()
      place()
    })
    mo.observe(track, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-pressed']
    })
    watch()
    place()
    return () => {
      mo.disconnect()
      ro?.disconnect()
    }
  }, [])
  return <span ref={ref} className="seg-lens" aria-hidden="true" />
}
