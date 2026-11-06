// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Exercise } from '../../src/renderer/src/nota/blocks/Practice'
import { BlockView } from '../../src/renderer/src/nota/BlockView'
import { renderMd } from '../../src/renderer/src/session/render-md'
import { buildNotePrompt } from '../../src/main/notes/prompt'
import { clozeParts } from '../../src/shared/exercise-schema'
import { normalizeMath, plainMathIssues } from '../../src/shared/math-text'
import { NotaWriteSchema, notaMathIssues } from '../../src/shared/nota-math'
import { NotaSchema, parseNota, type LeafBlock } from '../../src/shared/nota-schema'

afterEach(cleanup)

const lagrange = JSON.parse(readFileSync('tests/fixtures/nota-lagrange.json', 'utf8')) as { nota: unknown }
const guided = parseNota(lagrange.nota).nota.sections.flatMap((s) => s.blocks).find((b) => b.type === 'exercise' && b.level === 'completa') as Extract<LeafBlock, { type: 'exercise' }>

/** What the reader sees: the text without the MathML copy that only screen readers get. */
function visible(el: Element): string {
  const c = el.cloneNode(true) as Element
  c.querySelectorAll('.katex-mathml').forEach((m) => m.remove())
  return c.textContent ?? ''
}
const html = (md: string, inline = true): Element => {
  const d = document.createElement('div')
  d.innerHTML = renderMd(md, { inline, normalize: true })
  return d
}
const RAW = /\$|\\[A-Za-z]|_\{|y_sec/

describe('clozeParts: math balanced across the blanks', () => {
  it('uses the real steps of the guided exercise', () => {
    expect(guided.steps[0]).toBe("Calcola i valori agli estremi dell'intervallo: $f(1) = {{ -2 | *0 | 1 }}$ e $f(5) = {{ 6 | *8 | 10 }}.")
  })

  it('closes the formula before a blank and drops the $ the model never closed', () => {
    const c = clozeParts(guided.steps[0])
    expect(c.parts).toEqual(["Calcola i valori agli estremi dell'intervallo: $f(1) =$ ", ' e $f(5) =$ ', '.'])
    expect(c.blanks.map((b) => b.options)).toEqual([
      ['$-2$', '$0$', '$1$'],
      ['$6$', '$8$', '$10$']
    ])
    expect(c.blanks.map((b) => b.correct)).toEqual([1, 1])
  })

  it('keeps \\frac inside the formula of the secant step', () => {
    const c = clozeParts(guided.steps[1])
    expect(c.parts[0]).toBe('Determina la pendenza della retta secante: $m_{\\text{sec}} = \\frac{f(5) - f(1)}{5 - 1} =$ ')
    expect(c.blanks[0]).toMatchObject({ options: ['$1$', '$2$', '$4$'], math: true })
  })

  it('turns options inside a formula into formulas, and leaves word options as words', () => {
    expect(clozeParts(guided.steps[2]).blanks[0].options).toEqual(['$2x$', '$2x - 4$', '$x - 4$'])
    expect(clozeParts(guided.steps[4]).blanks[0]).toMatchObject({ options: ["l'estremo sinistro", "il punto medio dell'intervallo", 'il vertice'], math: false })
  })

  it('reopens a formula that continues after the blank', () => {
    expect(clozeParts('$m = {{1|*2}} \\cdot x$ ok').parts).toEqual(['$m =$ ', ' $\\cdot x$ ok'])
    expect(clozeParts('$a = {{1|*2}} + {{3|*4}}$').parts).toEqual(['$a =$ ', ' $+$ ', ''])
    expect(clozeParts('testo ${{1|*2}}$ fine').parts).toEqual(['testo ', ' fine'])
  })

  it('drops a $ opened after the last blank and never closed', () => {
    expect(clozeParts('Scegli {{a|*b}} e poi $x').parts).toEqual(['Scegli ', ' e poi x'])
  })

  it.each([0, 1, 2, 3, 4])('step %i renders with no $ and no LaTeX command in sight', (i) => {
    const { parts, blanks } = clozeParts(guided.steps[i])
    for (const p of parts) expect(visible(html(p))).not.toMatch(RAW)
    for (const b of blanks) for (const o of b.options) expect(visible(html(o))).not.toMatch(RAW)
  })

  it('the guided exercise on screen: no raw math in the text or in the open options', () => {
    const { container } = render(<Exercise block={guided} mode="leggi" />)
    expect(visible(container)).not.toMatch(RAW)
    expect(container.querySelectorAll('.katex').length).toBeGreaterThan(4)
    fireEvent.click(screen.getAllByRole('combobox', { name: 'Scegli' })[3])
    const options = screen.getAllByRole('option')
    expect(options.map((o) => visible(o).replace(/\s+/g, ''))).toEqual(['2x', '2x−4', 'x−4'])
    expect(options.every((o) => o.querySelector('.katex'))).toBe(true)
  })
})

describe('normalizeMath', () => {
  it.each([
    ['La dimostrazione poggia su Rolle attraverso la funzione scarto g(x) = f(x) - y_sec(x), che misura', 'La dimostrazione poggia su Rolle attraverso la funzione scarto $g(x) = f(x) - y_{\\mathrm{sec}}(x)$, che misura'],
    ['Esercizio Guidato · Applicazione di Lagrange a f(x) = x² - 4x + 3 su [1, 5]', 'Esercizio Guidato · Applicazione di Lagrange a $f(x) = x^{2} - 4x + 3$ su $[1, 5]$'],
    ['Pendenza secante m_sec', 'Pendenza secante $m_{\\mathrm{sec}}$'],
    ["Discrepanza f'(p) - m_sec", "Discrepanza $f'(p) - m_{\\mathrm{sec}}$"],
    ['Verifica della continuità e derivabilità di g(x)', 'Verifica della continuità e derivabilità di $g(x)$'],
    ['c = 2', '$c = 2$'],
    ['dominio sconnesso A = (1, 2) U (3, 4)', 'dominio sconnesso $A = (1, 2) \\cup (3, 4)$'],
    ['identità arcsin(x) + arccos(x) = pi/2 e trappola', 'identità $\\arcsin(x) + \\arccos(x) = \\pi /2$ e trappola'],
    ['per x che tende a 0 e x → 0', 'per x che tende a 0 e $x \\to 0$'],
    ['su R\\{0}', 'su $\\mathbb{R} \\setminus \\{0\\}$']
  ])('%s', (input, out) => {
    expect(normalizeMath(input)).toBe(out)
  })

  it.each([
    'Tutti i test operativi dello studio di funzione (costanza, primitive, monotonia, lipschitzianità) discendono direttamente da Lagrange.',
    'Il Teorema di Lagrange (Teorema 3.8 / Teorema 33) formalizza le condizioni.',
    "L'ipotesi di connessione del dominio (intervallo) è categorica: c'è una lacuna.",
    'Un casello A e un casello B distanti 100 km, percorsi in un\'ora: 100 km/h di media.',
    'Esplora i 5 corollari fondamentali tramite le schede (Corollario 1, Corollario 2).',
    'Sezione 7.5 (Criterio di derivabilità via limite): vedi il punto 2 e il punto 3.',
    'Analisi 1 · Calcolo differenziale · Teorema',
    'intervallo chiuso e limitato da a a b, con f continua su [a, b]',
    'Nel caso a) e nel caso b) la tesi vale.'
  ])('leaves prose alone: %s', (text) => {
    expect(normalizeMath(text)).toBe(text)
  })

  it('never touches existing math, code, blanks or links', () => {
    const t = 'Già $f(x) = x^2$, codice `y_sec(x)`, scelta {{ 2x | *x_1 }} e https://ex.it/a_b(x)'
    expect(normalizeMath(t)).toBe(t)
    const fence = 'Prima\n\n```mermaid\nflowchart TD\n  A["g(x) = f(x) - y_sec(x)"]\n```\n'
    expect(normalizeMath(fence)).toBe(fence)
  })

  it('drops a lone $ the model never closed', () => {
    expect(normalizeMath('il punto $c = 3')).toBe('il punto $c = 3$')
  })

  it('every plain-text formula of the real note comes out typeset', () => {
    for (const t of ['Pendenza secante m_sec', 'Esercizio Svolto · Calcolo del punto di Lagrange per f(x) = x³ - 3x² + 2x su [0, 3]', 'Figura 6 · Il salto nel dominio disconnesso: g(x) = arctan(x) + arctan(1/x)'])
      expect(visible(html(t))).not.toMatch(RAW)
  })
})

describe('plainMathIssues and the write check', () => {
  it('finds plain-text math and unbalanced $', () => {
    expect(plainMathIssues('Pendenza secante m_sec')).toHaveLength(1)
    expect(plainMathIssues('f(x) = x² - 4x')[0]).toMatch(/x²/)
    expect(plainMathIssues('$f(5) = 8.')).toEqual(['un $ senza chiusura'])
    expect(plainMathIssues('$f(x) = x^2$ e $m_{\\text{sec}}$, codice `a_b`')).toEqual([])
    expect(plainMathIssues('(costanza, primitive, monotonia)')).toEqual([])
  })

  it('rejects the real note, naming the fields and the blanks inside formulas', () => {
    const issues = notaMathIssues(parseNota(lagrange.nota).nota)
    expect(issues.some((i) => i.startsWith('recap.ideas[1]'))).toBe(true)
    expect(issues.some((i) => /readouts\[0\]\.label/.test(i))).toBe(true)
    expect(issues.some((i) => /steps\[0\]: una scelta \{\{…\}\} dentro \$…\$/.test(i))).toBe(true)
    // Figure expressions use ^ on purpose: never reported.
    expect(issues.some((i) => /functions|expr/.test(i))).toBe(false)
    const r = NotaWriteSchema.safeParse(lagrange.nota)
    expect(r.success).toBe(false)
    expect(r.error?.issues[0].message).toMatch(/^matematica da sistemare/)
  })

  it('lets a clean note through, the same as NotaSchema', () => {
    const min = JSON.parse(readFileSync('tests/fixtures/nota-min.json', 'utf8'))
    expect(NotaSchema.safeParse(min).success).toBe(true)
    expect(NotaWriteSchema.safeParse(min).success).toBe(true)
  })
})

describe('note writer prompt', () => {
  const p = buildNotePrompt({ noteTitle: 'Lagrange', noteText: '## 1. Enunciato\ntesto' })
  it('asks for $…$ around every formula, titles included', () => {
    expect(p).toMatch(/FORMULE OVUNQUE TRA \$…\$/)
    expect(p).toMatch(/anche titoli/)
    expect(p).toContain('non "Pendenza m_sec" ma "Pendenza $m_{\\text{sec}}$"')
  })
  it('keeps cloze blanks outside formulas', () => {
    expect(p).toMatch(/Scelte \{\{…\}\}.*SEMPRE fuori dalle formule/)
    expect(p).toContain('"$f(1) =$ {{$-2$|*$0$|$1$}}')
  })
  it('asks for readable plain text in Mermaid labels', () => {
    expect(p).toMatch(/Diagrammi Mermaid.*testo semplice e leggibile/)
  })
})

describe('every text field of a nota goes through the math renderer', () => {
  it('figure title, readout labels and caption', () => {
    const fig = parseNota(lagrange.nota).nota.sections[8].blocks.find((b) => b.type === 'figure')!
    const { container } = render(<BlockView block={fig} mode="leggi" />)
    expect(visible(container.querySelector('.fighead')!)).not.toMatch(RAW)
    expect(visible(container.querySelector('.readout')!)).not.toMatch(RAW)
    expect(container.querySelector('.fighead .katex')).toBeTruthy()
  })
  it('exercise titles', () => {
    const { container } = render(<Exercise block={guided} mode="leggi" />)
    expect(container.querySelector('.h .title .katex')).toBeTruthy()
  })
})
