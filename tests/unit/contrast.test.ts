import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { materials } from '@glass-sdk/liquid-glass/core'

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

/**
 * What @glass-sdk/liquid-glass's Regular material shows of a uniform ground, from the library's own constants: the
 * frost and fill blurs keep a uniform colour as it is, then the tone curve (a quadratic per channel, mixed with the
 * input by 0.9 dark / 0.8 light, as the library's filter does in sRGB) and a light saturation.
 */
function regular(c: RGBA, appearance: 'dark' | 'light'): RGBA {
  const [a, b, q, sat] = materials.regular[appearance].tone
  const mix = appearance === 'dark' ? 0.9 : 0.8
  const toned = [0, 1, 2].map((i) => {
    const s = c[i] / 255
    return (mix * (a + b * s + q * s * s) + (1 - mix) * s) * 255
  })
  const l = 0.2126 * toned[0] + 0.7152 * toned[1] + 0.0722 * toned[2]
  return toned.map((v) => Math.min(255, Math.max(0, l + (v - l) * sat))).concat(1) as RGBA
}
/** At the labels of a bar the scroll edge band (.edge-fade, opaque --bg down to 60 % of the bar's depth, then fading) leaves at most this much of the content under it visible. */
const UNDER_BAR = 0.3

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

  // Text and icons on Liquid Glass: the library's foreground (--lg-foreground) is the theme's --glass-ink; secondary text
  // --glass-ink-2; accent and pen labels (session phase, score, «Dalla tua nota») --glass-accent / --glass-pen. AA over what
  // the Regular material makes of the app's grounds and of the content under a bar, worst case the most contrasting app
  // colour (--ink) at the share the scroll edge band leaves visible.
  const appearance = theme === 'lavagna' ? 'dark' : 'light'
  const glassGrounds = (): RGBA[] => {
    const [ink, bg] = [c('--ink'), c('--bg')]
    const content: RGBA = [ink[0], ink[1], ink[2], UNDER_BAR]
    return [...GROUNDS.map((g) => c(g)), over(content, bg)].map((g) => regular(g, appearance))
  }
  it('the library foreground is the theme ink, and the scroll edge band is the one the model assumes', () => {
    expect(t['--lg-foreground']).toBe('var(--glass-ink)')
    expect(css).toMatch(/\.edge-fade::before\{[^}]*linear-gradient\(var\(--bg\) var\(--scroll-edge-solid,60%\),transparent\)/)
  })
  it.each(['--glass-ink', '--glass-ink-2', '--glass-accent', '--glass-pen'])('%s stays AA on the glass, worst case', (name) => {
    const worst = Math.min(...glassGrounds().map((g) => ratio(c(name), g)))
    expect(worst).toBeGreaterThanOrEqual(4.5)
  })

  it.each(GROUNDS)('control edges (--ctl-edge, disabled outline, focus ring) on %s', (g) => {
    expect(ratio(c('--ctl-edge'), c(g)), '--ctl-edge').toBeGreaterThanOrEqual(3)
    expect(ratio(c('--btn-disabled-border'), c(g)), '--btn-disabled-border').toBeGreaterThanOrEqual(3)
    expect(ratio(c('--btn-focus'), c(g)), '--btn-focus').toBeGreaterThanOrEqual(3)
  })

  // --hair is a deliberate decorative separator (WCAG 1.4.11 asks 3:1 only of what identifies a control: that is
  // --ctl-edge). Pinned between the 8a values, so it never fades back, and 3:1, so it never turns into an outline.
  // The range knob (Fiducia, the figures' sliders) is a bright glass lens: on the light surface it would vanish, so
  // its ring (--knob-edge, in --knob-shadow) carries the 3:1 of a control's edge against the surface it sits on
  // and against both tracks under it (--faint in the session, --hair in the nota viva).
  it.each(['--surface', '--panel'])('the range knob has a 3:1 edge on %s and on its tracks', (g) => {
    const ground = c(g)
    expect(t['--knob-shadow']).toContain('var(--knob-edge)')
    expect(ratio(c('--knob-edge'), ground), 'on the surface').toBeGreaterThanOrEqual(3)
    for (const track of ['--faint', '--hair']) {
      const under = over(c(track), ground)
      expect(ratio(c('--knob-edge'), under), `on ${track}`).toBeGreaterThanOrEqual(3)
    }
  })

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
