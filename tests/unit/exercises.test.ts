import { describe, expect, it } from 'vitest'
import { buildVariantsPrompt, fallbackExercise, parseVariants } from '../../src/main/memory/variants'
import type { Concept } from '../../src/shared/graph-types'

const ok = {
  open: { type: 'open', prompt: 'Che cosa garantisce Rolle?', answer: 'Un punto a derivata nulla.' },
  mc: { type: 'mc', prompt: 'Quale ipotesi manca?', options: ['Continuità', 'Monotonia'], correct: 0, answer: 'La continuità.' },
  truefalse: { type: 'truefalse', prompt: 'Vero o falso?', statement: 'Rolle dà un solo punto.', value: false, answer: 'Falso: almeno uno.' },
  order: { type: 'order', prompt: 'Riordina', steps: ['Weierstrass', 'Fermat', 'Conclusione'], answer: 'In quest’ordine.' },
  fill: { type: 'fill', prompt: 'Completa', text: 'Serve f continua su {{(a,b)|*[a,b]}}.', answer: 'Sul chiuso.' },
  match: { type: 'match', prompt: 'Abbina', pairs: [['Weierstrass', 'max e min'], ['Fermat', 'derivata nulla']], answer: 'Così.' },
  counterexample: { type: 'counterexample', prompt: 'Quale funzione viola Rolle?', options: ['|x| su [-1,1]', 'x^2 su [-1,1]'], correct: 0, answer: 'Lo spigolo.' },
  estimate: { type: 'estimate', prompt: 'Quanto vale c per x^2-4x+3 su [1,5]?', value: 3, tolerance: 0.1, answer: 'c = 3.' },
  spoterror: { type: 'spoterror', prompt: 'Trova il passo sbagliato', steps: ['g(a)=0', 'g(b)=1', 'Rolle su g'], wrong: 1, why: 'g(b)=0.', answer: 'Il secondo.' },
  graph: {
    type: 'graph',
    prompt: 'Trova il punto a tangente orizzontale',
    figure: { type: 'figure', title: 'Fig', x: [-2, 2], y: [-1, 3], functions: { f: 'x^2' }, params: [{ id: 'p', label: 'p', min: -1.5, max: 1.5, step: 0.05, value: -1 }], elements: [{ kind: 'curve', fn: 'f' }, { kind: 'point', x: 'p', y: 'f(p)', drag: 'p' }] },
    param: 'p',
    target: "f'(p)",
    answer: 'In 0.'
  }
}
const reply = (exercises: unknown[], id = 'n_a') => ({ concepts: [{ id, exercises }] })
const ids = new Set(['n_a'])

describe('parseVariants', () => {
  it('accepts one valid exercise of each type', () => {
    const { variants, dropped } = parseVariants(reply(Object.values(ok)), ids, () => 5)
    expect(dropped).toBe(0)
    expect(variants.map((v) => v.exercise.type)).toEqual(Object.keys(ok))
    expect(variants[0]).toMatchObject({ conceptId: 'n_a', at: 5 })
    expect(variants[0].id).toMatch(/^v_[0-9a-f]{12}$/)
  })
  it.each([
    ['mc with correct out of range', { ...ok.mc, correct: 2 }],
    ['counterexample with correct out of range', { ...ok.counterexample, correct: -1 }],
    ['fill without a starred option', { ...ok.fill, text: 'Serve f continua su {{(a,b)|[a,b]}}.' }],
    ['fill with two starred options', { ...ok.fill, text: 'Serve {{*a|*b}}.' }],
    ['fill without any blank', { ...ok.fill, text: 'Niente da completare.' }],
    ['order with duplicate steps', { ...ok.order, steps: ['a', 'a', 'b'] }],
    ['spoterror with wrong out of range', { ...ok.spoterror, wrong: 3 }],
    ['estimate with negative tolerance', { ...ok.estimate, tolerance: -1 }],
    ['graph with an unknown param', { ...ok.graph, param: 'q' }],
    ['graph whose target does not compile', { ...ok.graph, target: "f'(p" }],
    ['graph whose figure does not compile', { ...ok.graph, figure: { ...ok.graph.figure, functions: { f: 'x^^2' } } }],
    ['unknown type', { type: 'voce', prompt: 'Dillo', answer: 'x' }]
  ])('drops %s', (_name, bad) => {
    const { variants, dropped } = parseVariants(reply([ok.open, bad]), ids, () => 1)
    expect(dropped).toBe(1)
    expect(variants).toHaveLength(1)
  })
  it('drops exercises for concepts that were not asked for', () => {
    const r = parseVariants(reply([ok.open], 'n_other'), ids, () => 1)
    expect(r.variants).toEqual([])
    expect(r.dropped).toBe(1)
  })
  it('throws when the reply has no concepts list', () => {
    expect(() => parseVariants({ nope: 1 }, ids, () => 1)).toThrow()
  })
})

const concept: Concept = { id: 'n_a', name: 'Teorema di Rolle', statement: 'Se $f(a)=f(b)$ esiste $c$ con $f\'(c)=0$.', aliases: [], birth: '/v/Rolle.md', notes: ['/v/Rolle.md'], sections: {}, depth: 1 }

describe('variants prompt and fallback', () => {
  it('lists the concepts and the format', () => {
    const p = buildVariantsPrompt({ noteTitle: 'Teorema di Rolle', noteText: '## 1. Enunciato', concepts: [concept] })
    expect(p).toContain("n_a | Teorema di Rolle | Se $f(a)=f(b)$ esiste $c$ con $f'(c)=0$.")
    expect(p).toContain('"concepts"')
    expect(p).toContain('"exercises"')
    expect(p).toContain('Non usare strumenti')
    expect(p).toContain('## 1. Enunciato')
  })
  it('falls back to an open recall question built from the statement', () => {
    expect(fallbackExercise(concept)).toEqual({ type: 'open', prompt: 'Senza guardare: che cosa dice «Teorema di Rolle»?', answer: concept.statement })
  })
})
