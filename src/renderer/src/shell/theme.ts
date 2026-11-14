import type { Settings } from '../../../shared/settings-schema'

const themeKey = 'sinapsi.theme'
let preference: Settings['theme'] = 'system'

function resolveTheme(theme: Settings['theme']): 'lavagna' | 'trattato' {
  const dark =
    typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
  return theme === 'system' ? (dark ? 'lavagna' : 'trattato') : theme
}

function suppressTransitions(): void {
  const root = document.documentElement
  root.classList.add('theme-instant')
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-instant')))
}

export function applyTheme(theme: Settings['theme'], instant = false): void {
  preference = theme
  const resolved = resolveTheme(theme)
  if (document.documentElement.dataset.theme === resolved) {
    try {
      localStorage.setItem(themeKey, resolved)
    } catch {
      // Storage unavailable
    }
    return
  }
  if (instant) suppressTransitions()
  document.documentElement.dataset.theme = resolved
  try {
    localStorage.setItem(themeKey, resolved)
  } catch {
    // Theme application still works when storage is unavailable.
  }
}

export function applyThemeAnimated(
  theme: Settings['theme'],
  origin?: { x: number; y: number }
): void {
  preference = theme
  const resolved = resolveTheme(theme)
  if (document.documentElement.dataset.theme === resolved) {
    try {
      localStorage.setItem(themeKey, resolved)
    } catch {
      // Storage unavailable
    }
    return
  }

  const prefersReduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const doc = document as Document & {
    startViewTransition?: (callback: () => void | Promise<void>) => {
      finished: Promise<void>
      ready: Promise<void>
    }
  }

  if (!origin || prefersReduced || typeof doc.startViewTransition !== 'function') {
    applyTheme(theme, true)
    return
  }

  const x = origin.x
  const y = origin.y
  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  )

  const root = document.documentElement
  root.style.setProperty('--vt-x', `${x.toFixed(1)}px`)
  root.style.setProperty('--vt-y', `${y.toFixed(1)}px`)
  root.style.setProperty('--vt-r', `${Math.ceil(endRadius)}px`)

  const transition = doc.startViewTransition(() => {
    root.dataset.theme = resolved
    try {
      localStorage.setItem(themeKey, resolved)
    } catch {
      // Storage unavailable: the theme still applies for this session.
    }
  })

  void transition.finished
    .catch(() => undefined)
    .finally(() => {
      root.style.removeProperty('--vt-x')
      root.style.removeProperty('--vt-y')
      root.style.removeProperty('--vt-r')
    })
}

export function applyCachedTheme(): void {
  let cached: string | null = null
  try {
    cached = localStorage.getItem(themeKey)
  } catch {
    // Fall back to the system preference when storage is unavailable.
  }
  const resolved = cached === 'lavagna' || cached === 'trattato' ? cached : resolveTheme('system')
  document.documentElement.dataset.theme = resolved
  const media = matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', () => {
    if (preference === 'system') applyTheme('system', true)
  })
}
