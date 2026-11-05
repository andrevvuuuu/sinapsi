import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/** WCAG 2.2 AA contrast of the theme tokens in tokens.css, both themes. */

type RGBA = [number, number, number, number]
type Theme = 'lavagna' | 'trattato'

const css = readFileSync(resolve(__dirname, '../../src/renderer/src/styles/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** Every custom property of the theme: :root rules first, then the theme's own rules (later wins). */
function tokens(theme: Theme): Record<string, string> {
  const out: Record<string, string> = {}
  for (const sel of [':root', `[data-theme="${theme}"]`]) {
    const esc = sel.replace(/[[\]"]/g, (c) => `\\${c}`)
    for (const m of css.matchAll(new RegExp(`(?:^|\\n)${esc}\\{([^}]*)\\}`, 'g')))
      for (const d of m[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) out[d[1]] = d[2].trim()
  }
  return out
}

/** A token's value as a colour; var() references are followed, other forms throw. */
function color(t: Record<string, string>, name: string): RGBA {
  let v = t[name]
  if (v === undefined) throw new Error(`missing ${name}`)
  for (let guard = 0; v.startsWith('var('); guard++) {
    if (guard > 8) throw new Error(`var() loop at ${name}`)
    const ref = v.match(/^var\((--[\w-]+)\)$/)?.[1]
    if (!ref || t[ref] === undefined) throw new Error(`unresolved ${v}`)
    v = t[ref]
  }
  const hex = v.match(/^#([0-9a-f]{6})$/i)?.[1]
  if (hex) return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(1) as RGBA
  const rgba = v.match(/^rgba?\(([^)]+)\)$/)?.[1]
  if (rgba) {
    const p = rgba.split(/[ ,/]+/).filter(Boolean).map(Number)
    return [p[0], p[1], p[2], p[3] ?? 1]
  }
  throw new Error(`${name} is not a plain colour: ${v}`)
}

/** `top` painted over an opaque `base`. */
function over(top: RGBA, base: RGBA): RGBA {
  const a = top[3]
  return [0, 1, 2].map((i) => top[i] * a + base[i] * (1 - a)).concat(1) as RGBA
}

function luminance([r, g, b]: RGBA): number {
  const lin = (c: number): number => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG contrast ratio; a translucent foreground is composited over the background first. */
function ratio(fg: RGBA, bg: RGBA): number {
  const [a, b] = [luminance(over(fg, bg)), luminance(bg)]
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

const GROUNDS = ['--bg', '--surface', '--panel'] as const

describe.each<Theme>(['lavagna', 'trattato'])('contrast in %s', (theme) => {
  const t = tokens(theme)
  const c = (n: string): RGBA => color(t, n)

  it('body text on the page', () => {
    expect(ratio(c('--ink'), c('--bg'))).toBeGreaterThanOrEqual(4.5)
  })

  it.each(GROUNDS)('secondary text (--muted) and placeholder on %s', (g) => {
    expect(ratio(c('--muted'), c(g)), '--muted').toBeGreaterThanOrEqual(4.5)
    expect(ratio(c('--placeholder'), c(g)), '--placeholder').toBeGreaterThanOrEqual(4.5)
  })

  it('accent on the page (large text, marks, focus ring)', () => {
    expect(ratio(c('--accent'), c('--bg'))).toBeGreaterThanOrEqual(3)
  })

  it('text on glass, worst case: the tint over --bg or over --surface', () => {
    const worst = Math.min(...['--bg', '--surface'].map((g) => ratio(c('--glass-ink'), over(c('--glass-tint'), c(g)))))
    expect(worst).toBeGreaterThanOrEqual(4.5)
  })

  it.each(GROUNDS)('control edges (--ctl-edge, disabled outline, focus ring) on %s', (g) => {
    expect(ratio(c('--ctl-edge'), c(g)), '--ctl-edge').toBeGreaterThanOrEqual(3)
    expect(ratio(c('--btn-disabled-border'), c(g)), '--btn-disabled-border').toBeGreaterThanOrEqual(3)
    expect(ratio(c('--btn-focus'), c(g)), '--btn-focus').toBeGreaterThanOrEqual(3)
  })

  // --hair is a deliberate decorative separator (WCAG 1.4.11 asks 3:1 only of what identifies a control: that is
  // --ctl-edge). Pinned between the 8a values, so it never fades back, and 3:1, so it never turns into an outline.
  it.each(GROUNDS)('the separator (--hair) stays quiet but visible on %s', (g) => {
    const alpha = { lavagna: 0.14, trattato: 0.16 }[theme]
    expect(c('--hair')[3]).toBeGreaterThanOrEqual(alpha)
    expect(ratio(c('--hair'), c(g))).toBeLessThan(3)
  })

  it.each(GROUNDS)('a disabled button stays readable on %s', (g) => {
    expect(ratio(c('--btn-disabled-ink'), c(g))).toBeGreaterThanOrEqual(4.5)
  })

  it.each(['', '-hover', '-pressed'])('primary button label on its fill%s', (state) => {
    const fill = over(c(`--btn-primary-bg${state}`), c('--bg'))
    expect(ratio(c('--btn-primary-ink'), fill)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(['', '-hover', '-pressed'])('secondary and text button labels on their fill%s', (state) => {
    for (const kind of ['secondary', 'text']) {
      for (const g of GROUNDS) {
        const fill = over(c(`--btn-${kind}-bg${state}`), c(g))
        expect(ratio(c(`--btn-${kind}-ink`), fill), `${kind} on ${g}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})
