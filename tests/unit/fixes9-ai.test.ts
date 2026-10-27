import { describe, expect, it } from 'vitest'
import { extractJson } from '../../src/main/ai/json'

describe('JSON inside mixed text, without a second call', () => {
  it.each([
    ['braces in the text before', 'Testo con {graffe} prima {"a":{"b":2}} e dopo.', { a: { b: 2 } }],
    ['an example before the answer: the largest object wins', 'Esempio {"x":0} e la risposta {"a":1,"b":[1,2]}', { a: 1, b: [1, 2] }],
    ['braces inside strings', 'Ecco: {"t":"usa {x} e }"} fine', { t: 'usa {x} e }' }],
    ['a fence followed by prose with braces', 'Ecco:\n```json\n{"a":1}\n```\nFine {nota}.', { a: 1 }]
  ])('%s', (_n, text, out) => {
    expect(extractJson(text)).toEqual(out)
  })
  it('still says when there is no JSON', () => {
    expect(() => extractJson('solo testo {non json}')).toThrow()
  })
})
