// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { asMath } from '../../src/renderer/src/nota/math'
import { Glossary } from '../../src/renderer/src/nota/blocks/Glossary'
import { BlockView } from '../../src/renderer/src/nota/BlockView'
import { NOTA_FORMAT } from '../../src/shared/nota-schema'

afterEach(cleanup)

describe('asMath', () => {
  it.each([
    ['(a, b) \\text{ oppure } ]a, b[', '$(a, b) \\text{ oppure } ]a, b[$'],
    ['f \\in C^0([a, b])', '$f \\in C^0([a, b])$'],
    ['x_1', '$x_1$'],
    ['$f$ continua', '$f$ continua'],
    ['continuità', 'continuità'],
    ['', '']
  ])('%s → %s', (input, out) => {
    expect(asMath(input)).toBe(out)
  })
  it('uses display math when asked', () => {
    expect(asMath('\\frac{a}{b}', true)).toBe('$$\\frac{a}{b}$$')
  })
})

describe('math fields render as formulas', () => {
  it('glossary symbols without $', () => {
    const { container } = render(<Glossary block={{ type: 'glossary', rows: [{ symbol: '\\frac{f(b) - f(a)}{b - a}', read: 'rapporto incrementale', meaning: 'pendenza della secante' }] }} />)
    expect(container.querySelector('td .katex')).toBeTruthy()
    // The TeX source only survives inside the hidden MathML annotation, never as visible text.
    const visible = container.querySelector('td')!.cloneNode(true) as HTMLElement
    visible.querySelectorAll('annotation').forEach((a) => a.remove())
    expect(visible.textContent).not.toContain('\\frac')
  })
  it('the formal side of a decode block', () => {
    const { container } = render(<BlockView mode="leggi" block={{ type: 'decode', formal: '\\forall f \\in C^0([a, b]) \\implies \\exists c', read: 'per ogni', meaning: 'esiste' }} />)
    expect(container.querySelector('.katex')).toBeTruthy()
  })
  it('the note format asks for $ around symbols and formal notation', () => {
    expect(NOTA_FORMAT).toMatch(/symbol[^\n]*\$/)
    expect(NOTA_FORMAT).toMatch(/formal[^\n]*\$/)
  })
})
