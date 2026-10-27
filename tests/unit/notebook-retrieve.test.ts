import { describe, expect, it } from 'vitest'
import { chunk, selectExcerpts, tokens } from '../../src/main/notebook/retrieve'

describe('chunk', () => {
  it('keeps short segments whole and splits long ones at sentence ends, keeping the label', () => {
    const long = Array.from({ length: 40 }, (_, i) => `Frase numero ${i} sul teorema.`).join(' ')
    const c = chunk('s1', 'Dispensa', { segments: [{ label: 'p. 1', text: 'Breve.' }, { label: 'p. 2', text: long }], warnings: [] }, 300)
    expect(c[0]).toMatchObject({ sourceId: 's1', title: 'Dispensa', label: 'p. 1', text: 'Breve.', order: 0 })
    const p2 = c.filter((x) => x.label === 'p. 2')
    expect(p2.length).toBeGreaterThan(2)
    for (const x of p2) {
      expect(x.text.length).toBeLessThanOrEqual(300)
      expect(x.text.endsWith('.')).toBe(true)
    }
    expect(p2.map((x) => x.text).join(' ')).toBe(long)
    expect(c.map((x) => x.order)).toEqual(c.map((_, i) => i))
  })
  it('cuts a sentence longer than the limit at a space', () => {
    const c = chunk('s', 'T', { segments: [{ label: 'x', text: 'parola '.repeat(100).trim(), start: 5 }], warnings: [] }, 120)
    expect(c.every((x) => x.text.length <= 120 && x.start === 5)).toBe(true)
  })
})

describe('tokens', () => {
  it('lowercases, strips accents and stopwords, and stems', () => {
    expect(tokens('La derivabilità della funzione è nel Teorema')).toEqual(['deriva', 'funzio', 'teorem'])
    expect(tokens('derivabile')).toEqual(['deriva'])
  })
})

describe('selectExcerpts', () => {
  const filler = (i: number): string => `Pagina ${i}: discussione generale di limiti, successioni e serie numeriche con esempi. `.repeat(12)
  const chunks = [
    ...Array.from({ length: 200 }, (_, i) => ({ sourceId: 'a', title: 'A', label: `p. ${i + 1}`, text: filler(i), order: i })),
    { sourceId: 'b', title: 'B', label: 'p. 7', text: 'Nel corso chiamiamo il teorema di Rolle lemma del cammello.', order: 200 }
  ]
  it('passes everything, in order, when it fits', () => {
    const small = chunks.slice(0, 3)
    expect(selectExcerpts(small, 'qualsiasi cosa')).toEqual({ excerpts: small, full: true })
  })
  it('over budget, finds the passage with the rare words and stays under the cap', () => {
    const r = selectExcerpts(chunks, 'come si chiama il lemma del cammello?', 50_000)
    expect(r.full).toBe(false)
    expect(r.excerpts.some((c) => c.sourceId === 'b')).toBe(true)
    expect(r.excerpts.reduce((n, c) => n + c.text.length, 0)).toBeLessThanOrEqual(40_000)
    const orders = r.excerpts.map((c) => c.order)
    expect(orders).toEqual([...orders].sort((x, y) => x - y))
  })
  it('over budget with no matching words still returns something to answer from', () => {
    const r = selectExcerpts(chunks, 'zzz', 50_000)
    expect(r.excerpts.length).toBeGreaterThan(0)
  })
})
