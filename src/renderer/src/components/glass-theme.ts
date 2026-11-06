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
