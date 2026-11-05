import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/renderer/src/home/home.css', 'utf8')
describe('settings layout', () => {
  it('the theme options are 44 px, like every other control', () => {
    expect(css).toMatch(/\.sd-body \.seg button\{min-height:var\(--ctl\)\}/)
  })
  it('sections keep the shared rhythm and the last row clears the footer', () => {
    expect(css).toMatch(/\.sd-body\{overflow:auto;padding:4px 22px 16px;display:flex;flex-direction:column;gap:var\(--space-group\)\}/)
    expect(css).toMatch(/\.sd-body h3\{[^}]*margin:0 0 var\(--space-label\)\}/)
  })
})
