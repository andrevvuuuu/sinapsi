import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/** Controls take their outline, states and type from the tokens, not from numbers of their own. */

const read = (p: string): string => readFileSync(resolve(__dirname, '../../src/renderer/src', p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
/** The body of the rule whose selector is exactly `selector`, at the start of a line. */
const rule = (css: string, selector: string): string => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`).exec(css)
  if (!m) throw new Error(`missing ${selector}`)
  return m[1]
}

describe('«← Home»', () => {
  const css = read('styles/tokens.css')
  const base = rule(css, 'button.back-btn.back-btn.back-btn')
  it('has the control outline, the button transition and a type-scale font', () => {
    expect(base).toContain('border:1px solid var(--ctl-edge)')
    expect(base).toContain('transition:var(--btn-transition)')
    expect(base).toMatch(/font:var\(--fw-medium\) var\(--fs-[a-z]+\)/)
    expect(base).not.toMatch(/\b\d+px\/1\b/)
  })
  it('has a pressed state', () => {
    expect(css).toContain('button.back-btn.back-btn.back-btn:active{')
  })
})

describe('the in-field microphone', () => {
  const css = read('components/mic.css')
  it('uses spacing, radius and type tokens, no bare pixel values', () => {
    for (const sel of ['.mic', '.mic.mic-sm', '.mic-time', '.mic-status', '.mic-err']) {
      const body = rule(css, sel)
      // 1px borders and the 16px icon are the only literal sizes left.
      expect(body.replace(/1px solid/g, ''), sel).not.toMatch(/(?<![\w-])\d+px/)
    }
  })
  it('has hover, pressed and focus states', () => {
    for (const state of [':hover', ':active', ':focus-visible']) expect(css).toContain(`.mic${state} {`)
  })
})
