import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/renderer/src/practice/practice.css', 'utf8')
describe('practice layout', () => {
  it('top bar and its buttons use the shared sizes', () => {
    expect(css).toMatch(/\.pr-top\{[^}]*min-height:var\(--topbar-h\)/)
    expect(css).toMatch(/\.pr-top \.pill\{min-height:var\(--ctl\)/)
  })
  it('buttons and fields are 44, chips and filters 36 (segmented ones 36 outside)', () => {
    expect(css).toMatch(/\.pr \.ghost\{[^}]*min-height:var\(--ctl\)/)
    expect(css).toMatch(/\.pr \.pri\{min-height:var\(--ctl\)/)
    expect(css).toMatch(/\.pr \.startrow textarea\{[^}]*min-height:var\(--ctl\)/)
    expect(css).toMatch(/\.pr \.pr-ask input\{[^}]*min-height:var\(--ctl\)/)
    expect(css).toMatch(/\.pr \.mt-chip\{[^}]*min-height:var\(--ctl-sm\)/)
    expect(css).toMatch(/\.pr \.mt-filters button\{min-height:var\(--ctl-sm\)/)
    expect(css).toMatch(/\.pr \.mt-search input\{[^}]*min-height:calc\(var\(--ctl-sm\) - 2px\)/)
    expect(css).toMatch(/\.pr \.dur button\{min-height:calc\(var\(--ctl-sm\) - 6px\)/)
    expect(css).toMatch(/\.pr \.mt-tabs button\{min-height:calc\(var\(--ctl-sm\) - 6px\)/)
    expect(css).toMatch(/\.pr \.mt-x\{width:var\(--ctl\);height:var\(--ctl\)/)
  })
  it('the setup card has one rhythm: 8 from a label to its content, 20 between groups', () => {
    expect(css).toMatch(/\.pr \.mt-group\{margin-bottom:var\(--space-group\)\}/)
    expect(css).toMatch(/\.pr \.mt-group>\.lab\{display:block;margin-bottom:var\(--space-label\)/)
    expect(css).toMatch(/\.pr \.modes\{[^}]*margin:var\(--space-group\) 0 0\}/)
    expect(css).toMatch(/\.pr \.startrow\{[^}]*margin-top:var\(--space-group\)/)
  })
  it('a checkbox stays 18 px to the eye but is a 28 px target', () => {
    expect(css).toMatch(/\.pr \.mt-hit\{[^}]*width:var\(--hit-min\);height:var\(--hit-min\)/)
  })
  it('the problem dock is as wide as the messages, and tighter in a short window', () => {
    expect(css).toMatch(/\.pr \.dock\{max-width:712px;margin:0 auto\}/)
    expect(css).toMatch(/@media \(max-height:760px\)\{\.pr \.inner\{padding:12px 14px\}\.pr \.dockwrap\{padding-bottom:12px\}\}/)
  })
})
