import { useSyncExternalStore } from 'react'

/** The <html> attributes the glass follows: the theme (data-theme) and «Riduci trasparenza» (data-glass, glass.tsx). */
function watchRoot(cb: () => void): () => void {
  if (typeof MutationObserver === 'undefined') return () => {}
  const mo = new MutationObserver(cb)
  mo.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'data-glass']
  })
  return () => mo.disconnect()
}

/** The library's appearance for the app theme: lavagna is dark, trattato is light. */
export function useGlassAppearance(): 'light' | 'dark' {
  return useSyncExternalStore(
    watchRoot,
    () => (document.documentElement.dataset.theme === 'trattato' ? 'light' : 'dark'),
    () => 'dark'
  )
}

/** True while the glass is transparent: macOS allows it (data-glass="on"). */
export function useGlassOn(): boolean {
  return useSyncExternalStore(
    watchRoot,
    () => document.documentElement.dataset.glass === 'on',
    () => false
  )
}

/**
 * Focuses `el` as soon as it can take the focus. A library glass surface stays hidden (visibility) until it has
 * measured its outline, a frame or two after it mounts, and a hidden element refuses the focus: so the focus is
 * tried again on the next frames, for up to a second. Returns the cancel, for an effect's cleanup.
 */
export function focusWhenShown(el: HTMLElement | null | undefined): () => void {
  if (!el) return () => {}
  let frame = 0
  let tries = 0
  const go = (): void => {
    el.focus()
    if (document.activeElement !== el && el.isConnected && tries++ < 60) frame = requestAnimationFrame(go)
  }
  go()
  return () => cancelAnimationFrame(frame)
}
