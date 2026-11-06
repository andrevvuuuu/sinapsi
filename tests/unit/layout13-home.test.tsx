// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Composer } from '../../src/renderer/src/home/Composer'
import { clampLayout, DEFAULT_LAYOUT, LIMITS } from '../../src/renderer/src/home/layout'

afterEach(cleanup)
const css = (p: string): string => readFileSync(p, 'utf8')
const tokens = css('src/renderer/src/styles/tokens.css')
const home = css('src/renderer/src/home/home.css')
const graph = css('src/renderer/src/graph/graph.css')

describe('size and spacing tokens', () => {
  it('exist once, for every theme', () => {
    expect(tokens).toMatch(/:root\{[^}]*--ctl:44px;--ctl-sm:36px;--hit-min:28px;--topbar-h:72px;--space-label:8px;--space-group:20px/)
  })
})

describe('home layout', () => {
  it('the left panel is never narrower than the session filter (272 px)', () => {
    expect(LIMITS.left[0]).toBe(272)
    expect(clampLayout({ ...DEFAULT_LAYOUT, left: 220 }, 1280, 800).left).toBe(272)
  })
  it('the zoom controls sit above the composer, whatever its height', () => {
    expect(graph).toMatch(/\.graph \.gzoom \{[^}]*bottom: calc\(var\(--composer-h, 128px\) \+ 38px\)/)
  })
  it('the composer tells its container how tall it is', () => {
    let cb: ResizeObserverCallback = () => undefined
    vi.stubGlobal('ResizeObserver', class { constructor(c: ResizeObserverCallback) { cb = c } observe() {} disconnect() {} })
    const { container } = render(<main className="center"><Composer onSubmit={vi.fn()} /></main>)
    const box = container.querySelector('.composer') as HTMLElement
    Object.defineProperty(box, 'offsetHeight', { value: 190 })
    cb([], {} as ResizeObserver)
    expect((container.querySelector('.center') as HTMLElement).style.getPropertyValue('--composer-h')).toBe('190px')
    vi.unstubAllGlobals()
  })
  it('section buttons in the panels are 44 px to hit, with room before the form they open', () => {
    expect(home).toMatch(/\.mini\{min-height:var\(--ctl\);min-width:var\(--ctl\)/)
    expect(home).toMatch(/\.nb-new\{display:flex;gap:var\(--s-2\);padding:var\(--s-3\) var\(--s-2\);flex:none\}/)
  })
  it('a short notebook section scrolls its text instead of spilling over the next one', () => {
    expect(home).toMatch(/\.nb-sec \.empty\{padding:var\(--s-1\) var\(--s-2\);overflow:auto;min-height:0\}/)
  })
  it('the session list keeps its last row clear of the divider', () => {
    expect(home).toMatch(/\.app aside\.left \.psec\[aria-label="Sessioni"\] \.sessions\{overflow:auto;min-height:0;padding-bottom:12px\}/)
  })
  it('the composer gives up side margin in a narrow centre', () => {
    expect(home).toMatch(/\.composer\{[^}]*width:min\(620px,max\(calc\(100% - 64px\),min\(calc\(100% - 32px\),488px\)\)\)/)
  })
})

describe('graph menu', () => {
  it('its segmented filter is 44 outside, like the others', () => {
    expect(graph).toMatch(/\.graph \.gseg button \{\s*flex: 1;\s*min-height: calc\(var\(--ctl\) - 6px\);/)
  })
})
