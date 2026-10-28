// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Layout lives in CSS; these pin the rules the requests asked for.
const css = readFileSync('src/renderer/src/home/home.css', 'utf8')
describe('suggestion chips', () => {
  it('stay on one line and share the width, truncating instead of wrapping', () => {
    expect(css).toMatch(/\.composer \.suggest\{[^}]*flex-wrap:nowrap/)
    expect(css).toMatch(/\.composer \.sg-chip\{[^}]*flex:1 1 0;min-width:0/)
    expect(css).toMatch(/\.composer \.sg-label,\.composer \.sg-why\{[^}]*text-overflow:ellipsis;white-space:nowrap/)
  })
})
