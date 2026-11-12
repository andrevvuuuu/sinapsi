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
  if (instant) suppressTransitions()
  const resolved = resolveTheme(theme)
  document.documentElement.dataset.theme = resolved
  try {
    localStorage.setItem(themeKey, resolved)
  } catch {
    // Theme application still works when storage is unavailable.
  }
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
