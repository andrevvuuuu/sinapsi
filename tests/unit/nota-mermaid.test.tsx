// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  parse: vi.fn(async () => ({ diagramType: 'flowchart-v2' })),
  render: vi.fn(async (id: string) => ({
    svg: `<svg id="${id}" viewBox="0 0 520 900" style="max-width: 520px;" xmlns="http://www.w3.org/2000/svg"><style>#${id}{font-family:Geist}</style><script>window.hacked=1</script><g class="node" onclick="window.hacked=1"><rect width="10" height="10"/><foreignObject width="200" height="40"><div xmlns="http://www.w3.org/1999/xhtml"><span class="nodeLabel"><p>g(x) = f(x) - y<sub>sec</sub>(x)</p></span></div></foreignObject></g><a href="javascript:alert(1)"><text>x</text></a></svg>`
  }))
}))
vi.mock('mermaid', () => ({ default: mermaid }))

import { firstLabel, mermaidTheme, prepareMermaid, sanitizeSvg } from '../../src/renderer/src/nota/blocks/mermaid-theme'
import { SectionContext } from '../../src/renderer/src/nota/context'
import { Md } from '../../src/renderer/src/nota/Md'
import { splitMermaid } from '../../src/renderer/src/nota/math'

const lagrange = JSON.parse(readFileSync('tests/fixtures/nota-lagrange.json', 'utf8'))
const prose: string = lagrange.nota.sections[4].blocks[0].md

beforeEach(() => {
  document.documentElement.dataset.theme = 'lavagna'
  document.documentElement.style.setProperty('--surface', '#1a1b17')
  document.documentElement.style.setProperty('--faint', 'rgba(236,233,223,.05)')
  document.documentElement.style.setProperty('--ink', '#ece9df')
  document.documentElement.style.setProperty('--ctl-edge', 'rgba(236,233,223,.4)')
  document.documentElement.style.setProperty('--accent', '#ef7a42')
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  delete (window as { hacked?: number }).hacked
})

describe('splitMermaid and labels', () => {
  it('finds the diagram of §5 in the real note', () => {
    const parts = splitMermaid(prose)
    expect(parts).toHaveLength(2)
    expect('md' in parts[0] && parts[0].md).toMatch(/Il seguente diagramma/)
    expect('mermaid' in parts[1] && parts[1].mermaid).toMatch(/^flowchart TD/)
  })
  it('turns plain-text math in the labels into readable text, keeping <br/>', () => {
    const src = prepareMermaid('C["Costruzione funzione ausiliaria di scarto:<br/>g(x) = f(x) - y_sec(x)"] --> B["y = f(a) + m*(x - a), x^2"]')
    expect(src).toContain('g(x) = f(x) - y<sub>sec</sub>(x)')
    expect(src).toContain('<br/>')
    expect(src).toContain('m·(x - a), x<sup>2</sup>')
    expect(src).toContain('C["') // node ids untouched
  })
  it('names the diagram from its first node when there is no section', () => {
    expect(firstLabel('flowchart TD\n A["Funzione f continua<br/>e derivabile"] --> B["x"]')).toBe('Funzione f continua e derivabile')
  })
  it('strips scripts, handlers and javascript: links but keeps the labels', () => {
    const clean = sanitizeSvg('<svg><script>x()</script><g onclick="x()"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><p>y<sub>sec</sub></p></div></foreignObject></g><a href="javascript:x()"><text>t</text></a></svg>')
    expect(clean).not.toMatch(/script|onclick|javascript/)
    expect(clean).toContain('<sub>sec</sub>')
  })
  it('takes its colours from the tokens, as opaque hex', () => {
    const t = mermaidTheme()
    expect(t).toMatchObject({ primaryTextColor: '#ece9df', lineColor: '#ef7a42', darkMode: true })
    expect(String(t.fontFamily)).toMatch(/Geist/)
    expect(t.primaryBorderColor).toMatch(/^#[0-9a-f]{6}$/)
    expect(t.primaryColor).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('Mermaid block', () => {
  it('draws the diagram with strict security, sanitized, named after the section', async () => {
    const { container } = render(
      <SectionContext.Provider value="Architettura Logico-Deduttiva della Dimostrazione">
        <Md md={prose} />
      </SectionContext.Provider>
    )
    const img = await screen.findByRole('img', { name: 'Diagramma: Architettura Logico-Deduttiva della Dimostrazione' })
    expect(img.querySelector('svg')).toBeTruthy()
    expect(img.innerHTML).not.toMatch(/<script|onclick|javascript:/)
    expect(img.textContent).toContain('ysec(x)')
    expect(container.querySelector('pre')).toBeNull()
    expect(container.textContent).toContain('Il seguente diagramma')
    expect(mermaid.initialize).toHaveBeenCalledWith(expect.objectContaining({ securityLevel: 'strict', startOnLoad: false, theme: 'base' }))
    expect(mermaid.render.mock.calls[0][1]).toContain('y<sub>sec</sub>(x)')
    // Fits the column but never shrinks past the readable scale.
    expect((img.querySelector('svg') as SVGElement).style.minWidth).toBe(`${Math.round(520 * 0.62)}px`)
  })

  it('draws again with the other theme when the theme changes', async () => {
    render(<Md md={prose} />)
    await screen.findByRole('img', { name: /^Diagramma: Funzione f continua/ })
    expect(mermaid.initialize.mock.calls.at(-1)?.[0].themeVariables.darkMode).toBe(true)
    await act(async () => {
      document.documentElement.style.setProperty('--ink', '#221e19')
      document.documentElement.dataset.theme = 'trattato'
    })
    await waitFor(() => expect(mermaid.render).toHaveBeenCalledTimes(2))
    expect(mermaid.initialize.mock.calls.at(-1)?.[0].themeVariables).toMatchObject({ darkMode: false, primaryTextColor: '#221e19' })
  })

  it('shows the code with a note when the diagram cannot be parsed, never a crash', async () => {
    mermaid.parse.mockRejectedValueOnce(new Error('Parse error on line 2'))
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { container } = render(<Md md={'Testo\n\n```mermaid\nflowchart TD\n  A --> \n```\n'} />)
    expect(await screen.findByText(/non si è potuto disegnare/)).toBeTruthy()
    expect(container.querySelector('pre code')?.textContent).toContain('flowchart TD')
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('a block without diagrams never loads mermaid', () => {
    render(<Md md="Solo testo con $x^2$." />)
    expect(mermaid.initialize).not.toHaveBeenCalled()
  })
})
