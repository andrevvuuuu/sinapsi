// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderMd } from '../../src/renderer/src/session/render-md'

describe('renderMd', () => {
  it('renders inline math with KaTeX', () => {
    expect(renderMd("Se $f'(c)=0$ allora")).toContain('class="katex"')
  })
  it('renders display math', () => {
    expect(renderMd('$$\\int_a^b f$$')).toContain('katex-display')
  })
  it('renders markdown', () => {
    expect(renderMd('**grassetto**')).toContain('<strong>grassetto</strong>')
  })
  it('removes scripts and event handlers', () => {
    const html = renderMd('<img src=x onerror=alert(1)> <script>alert(2)</script> ciao')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('<script')
  })
  it('keeps underscores inside math away from markdown', () => {
    const html = renderMd('$a_1 + b_2$ e $x_i$')
    expect(html).not.toContain('<em>')
  })
})
