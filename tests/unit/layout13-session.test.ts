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
  it('the dock never scrolls inside: its send button must stay in view', () => {
    expect(css).not.toMatch(/\.dock \.inner\{[^}]*max-height/)
  })
  it('in a short window the dock uses tighter spacing', () => {
    expect(css).toMatch(/@media \(max-height:760px\)\{[^@]*\.sess \.inner\{padding:12px 14px\}[^@]*\.sess \.q\{margin:2px 0 8px\}[^@]*\.sess \.act\{margin-top:8px\}[^@]*\.dockwrap\{padding-bottom:12px\}/)
  })
})
