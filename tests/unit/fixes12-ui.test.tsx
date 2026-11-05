// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Layout lives in CSS; these pin the rules the requests asked for.
const css = readFileSync('src/renderer/src/home/home.css', 'utf8')
describe('suggestion chips', () => {
  it('stay on one row, sized by their content; the title takes up to two lines before the ellipsis', () => {
    expect(css).toMatch(/\.composer \.suggest\{[^}]*flex-wrap:nowrap/)
    expect(css).toMatch(/\.composer \.sg-chip\{[^}]*flex:0 1 auto;min-width:0/)
    expect(css).toMatch(/\.composer \.sg-label\{[^}]*-webkit-line-clamp:2/)
    expect(css).toMatch(/\.composer \.sg-why\{[^}]*text-overflow:ellipsis;white-space:nowrap/)
  })
})
