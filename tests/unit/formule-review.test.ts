// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { prepareMermaid } from '../../src/renderer/src/nota/blocks/mermaid-theme'
import { plainText } from '../../src/renderer/src/nota/math'
import { renderMd } from '../../src/renderer/src/session/render-md'
import { clozeParts } from '../../src/shared/exercise-schema'
import { normalizeMath, plainMathIssues } from '../../src/shared/math-text'

/** What the reader sees of a text rendered as a nota field, and whether KaTeX choked on it. */
function seen(md: string): { text: string; errors: number } {
  const d = document.createElement('div')
  d.innerHTML = renderMd(md, { inline: true, normalize: true })
  const errors = d.querySelectorAll('.katex-error').length
  d.querySelectorAll('.katex-mathml').forEach((m) => m.remove())
  return { text: d.textContent ?? '', errors }
}

describe('exponents and subscripts longer than one character', () => {
  it.each([
    ['2^10 = 1024', '$2^{10} = 1024$'],
    ['x^12 + 1 = 0', '$x^{12} + 1 = 0$'],
    ['a_12 = 3', '$a_{12} = 3$'],
    ['x_10 + 1', '$x_{10} + 1$'],
    ['x^-1 = 1/x', '$x^{-1} = 1/x$'],
    ['e^(x) > 0', '$e^{x} > 0$'],
    ['f(x)=x^(n+1)', '$f(x)=x^{n+1}$'],
    ['f(x) = 3x^2 + 2', '$f(x) = 3x^2 + 2$']
  ])('%s → %s', (input, out) => {
    expect(normalizeMath(input)).toBe(out)
    expect(seen(input)).toMatchObject({ errors: 0 })
  })
})

describe('a formula written flush against an existing one', () => {
  it.each([
    ['$f$(x) = 2x^2', '$f(x) = 2x^2$'],
    ['$a$x^2 = 1', '$ax^2 = 1$'],
    ['Abbiamo $f$=2x qui', 'Abbiamo $f$=2x qui']
  ])('%s → %s, never $$', (input, out) => {
    expect(normalizeMath(input)).toBe(out)
    expect(seen(input).text).not.toContain('$')
  })
})

describe('LaTeX written without $', () => {
  it.each([
    ['con \\alpha > 0', 'con $\\alpha > 0$'],
    ['x \\in [a,b]', '$x \\in [a,b]$'],
    ['f(x) = \\sqrt{x}', '$f(x) = \\sqrt{x}$'],
    ['la derivata \\frac{f(b)-f(a)}{b-a} esiste', 'la derivata $\\frac{f(b)-f(a)}{b-a}$ esiste'],
    ['vale \\int_a^b f(x)\\,dx = F(b) - F(a)', 'vale $\\int_a^b f(x)\\,dx = F(b) - F(a)$']
  ])('%s → %s', (input, out) => {
    expect(normalizeMath(input)).toBe(out)
    const { text, errors } = seen(input)
    expect(errors).toBe(0)
    expect(text).not.toMatch(/\$|\\[A-Za-z]/)
  })
  it('never starts a formula right after {', () => {
    expect(normalizeMath('il gruppo {x = 1} resta')).toBe('il gruppo {x = 1} resta')
  })
  it('is reported for a retry', () => {
    expect(plainMathIssues('con \\alpha > 0')[0]).toMatch(/\\alpha/)
    expect(plainMathIssues('la derivata \\frac{a}{b}')[0]).toMatch(/\\frac/)
  })
})

describe('$ is never deleted where it means something', () => {
  it.each(['$ \\frac{1}{2} $ con spazi', 'Testo con $\\frac{1}{2}$5 dopo'])('%s: a formula, typeset', (t) => {
    expect(normalizeMath(t)).toBe(t)
    expect(seen(t).text).not.toMatch(/\$|\\frac/)
  })
  it('keeps money exactly as written', () => {
    for (const t of ['Costa $5 e poi $10.', 'Prezzo: 5$ o 10$ al mese.']) {
      expect(normalizeMath(t)).toBe(t)
      expect(seen(t).text).toBe(t)
    }
  })
  it('drops only the one $ that opens a formula and is never closed', () => {
    expect(normalizeMath('il punto $c = 3')).toBe('il punto $c = 3$')
    expect(normalizeMath('costa $5')).toBe('costa $5')
  })
})

describe('cloze balancing: review cases', () => {
  it('keeps a formula after the blank intact', () => {
    expect(clozeParts('$x {{1|*2}} $y$ z').parts).toEqual(['$x$ ', ' $y$ z'])
  })
  it('keeps display math as display math', () => {
    const c = clozeParts('$$x = {{1|*2}}$$')
    expect(c.parts).toEqual(['$$x =$$ ', ''])
    expect(c.blanks[0].math).toBe(true)
  })
  it('drops only a truly unmatched final $', () => {
    expect(clozeParts('{{*$a$|$b$}} e $c').parts).toEqual(['', ' e c'])
    expect(clozeParts('$f(1) = {{ -2 | *0 | 1 }}').parts).toEqual(['$f(1) =$ ', ''])
    expect(clozeParts('costa \\$5 e {{1|*2}}').parts).toEqual(['costa \\$5 e ', ''])
  })
})

describe('prose and units are not formulas', () => {
  it.each(['Vedi a pagina 5 > 3 esempi.', 'Versione 2.0 → 3.0 del software.', 'Q1 > Q2 nel bilancio.', 'm² di superficie', 'H2O = acqua.', 'Teorema 2.1 = corollario 3.4.'])('%s', (t) => {
    expect(normalizeMath(t)).toBe(t)
  })
  it.each(['Usa il file nota_finale.md per i dettagli.', 'Variabile snake_case nel codice.', "Il km^2 è un'unità.", 'Una stanza di 20 m² circa.'])('no retry for %s', (t) => {
    expect(plainMathIssues(t)).toEqual([])
  })
  it('still reports real plain-text math', () => {
    for (const t of ['g(x) = f(x) - y_sec(x)', 'x^2 - 1', 'x² - 4x']) expect(plainMathIssues(t)).not.toEqual([])
  })
})

describe('Mermaid labels and readable plain text', () => {
  it('prepares edge labels and leaves %%{init}%% alone', () => {
    const src = prepareMermaid('%%{init: {"theme_x": "a_b"}}%%\nflowchart TD\n  A -->|y_sec| B\n  %% nota_bene\n  B --> C["x^2"]')
    expect(src).toContain('%%{init: {"theme_x": "a_b"}}%%')
    expect(src).toContain('%% nota_bene')
    expect(src).toContain('|y<sub>sec</sub>|')
    expect(src).toContain('"x<sup>2</sup>"')
  })
  it.each([
    ['$y_{\\text{sec}}(x)$', 'y sec(x)'],
    ['$x^{2}$', 'x²'],
    ['$a_1 + x^{-1}$', 'a₁ + x⁻¹'],
    ['Pendenza $m_{\\mathrm{sec}}$', 'Pendenza m sec']
  ])('plainText(%s) = %s', (input, out) => {
    expect(plainText(input)).toBe(out)
  })
})

describe('performance', () => {
  it('normalizes a long note quickly and never blows up on nested brackets', () => {
    const para = "Sia f una funzione continua sull'intervallo chiuso; allora esiste c tale che f'(c) = (f(b) - f(a))/(b - a). "
    let t = performance.now()
    normalizeMath(para.repeat(400))
    expect(performance.now() - t).toBeLessThan(1000)
    t = performance.now()
    for (const s of ['('.repeat(30) + 'x' + ')'.repeat(29) + ' testo', '(x, '.repeat(20) + 'parola', '|'.repeat(14) + 'a parola', 'x' + '(1'.repeat(20) + ' parola']) normalizeMath(s)
    expect(performance.now() - t).toBeLessThan(200)
  })
})
