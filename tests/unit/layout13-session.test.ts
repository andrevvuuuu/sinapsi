import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/renderer/src/session/session.css', 'utf8')
describe('session layout', () => {
  it('the top bar has the same height and padding as every other screen', () => {
    expect(css).toMatch(/\.sess \.top\{display:flex;align-items:center;gap:16px;padding:14px 24px 14px 88px;border-bottom:1px solid var\(--hair\);min-height:var\(--topbar-h\)\}/)
  })
  it('the question dock is as wide as the messages above it', () => {
    expect(css).toMatch(/\.dock\{max-width:712px;margin:0 auto\}/)
  })
  it('a tall dock scrolls its middle only: the question and its send button stay in view', () => {
    expect(css).not.toMatch(/\.dock \.inner\{[^}]*max-height/)
    expect(css).toMatch(/\.dock\{[^}]*max-height:max\(55vh,300px\)/)
    expect(css).toMatch(/\.inner\.has-scroll>\.dock-scroll\{flex:0 1 auto;min-height:0;overflow:auto/)
  })
  it('in a short window the dock uses tighter spacing', () => {
    expect(css).toMatch(/@media \(max-height:760px\)\{[^@]*\.sess \.inner\{padding:12px 14px\}[^@]*\.sess \.q\{margin:2px 0 8px\}[^@]*\.sess \.act\{margin-top:8px\}[^@]*\.dockwrap\{padding-bottom:12px\}/)
  })
})
