import { describe, expect, it } from 'vitest'
import { findRoots, fmt, makeScope, samplePath } from '../../src/renderer/src/nota/figure/plot'
import type { Figure } from '../../src/shared/nota-schema'

const id = (x: number, y: number): [number, number] => [x, y]
const subpaths = (d: string): number => (d.match(/M/g) ?? []).length

describe('samplePath', () => {
  it('breaks the curve at an asymptote', () => {
    const d = samplePath((x) => 1 / x, [-2, 2], [-5, 5], id)
    expect(subpaths(d)).toBe(2)
  })
  it('breaks tan at each asymptote', () => {
    const d = samplePath(Math.tan, [-4, 4], [-3, 3], id)
    expect(subpaths(d)).toBe(3)
  })
  it('skips where the function is undefined', () => {
    const d = samplePath(Math.log, [-1, 2], [-3, 3], id)
    expect(subpaths(d)).toBe(1)
    expect(Number(d.slice(1).split(',')[0])).toBeGreaterThanOrEqual(0)
    expect(d).not.toMatch(/[ML]-/)
  })
  it('returns an empty path when nothing is defined', () => {
    expect(samplePath(() => NaN, [0, 1], [0, 1], id)).toBe('')
  })
})

describe('findRoots', () => {
  it('finds sign changes', () => {
    const r = findRoots((x) => x * x - 1, [-2, 2])
    expect(r).toHaveLength(2)
    expect(r[0]).toBeCloseTo(-1, 6)
    expect(r[1]).toBeCloseTo(1, 6)
  })
  it('finds a tangency (double root)', () => {
    const r = findRoots((x) => (x - 1) ** 2, [-2, 3])
    expect(r).toHaveLength(1)
    expect(r[0]).toBeCloseTo(1, 3)
  })
  it('returns nothing when there is no root', () => {
    expect(findRoots((x) => x * x + 1, [-2, 2])).toEqual([])
  })
  it('does not report a pole as a root', () => {
    expect(findRoots((x) => 1 / x, [-1, 1])).toEqual([])
  })
})

describe('fmt', () => {
  it('uses the Italian decimal comma and a real minus', () => {
    expect(fmt(-0.5)).toBe('−0,50')
    expect(fmt(1.23456, 3)).toBe('1,235')
    expect(fmt(-0.0001)).toBe('0,00')
  })
  it('shows a dash for non-finite values', () => {
    expect(fmt(NaN)).toBe('—')
    expect(fmt(Infinity)).toBe('—')
  })
})

describe('makeScope', () => {
  it('compiles functions that use params and each other', () => {
    const fig = {
      type: 'figure',
      title: 't',
      x: [-1, 1],
      y: [-1, 1],
      functions: { f: 'x^2 + k', g: 'f(x) - 1' },
      params: [{ id: 'k', label: 'k', min: 0, max: 2, step: 0.1, value: 1 }],
      elements: [{ kind: 'curve', fn: 'f' }]
    } as Figure
    const s = makeScope(fig, { k: 2 })
    expect(s.fns.f(1)).toBe(3)
    expect(s.fns.g(1)).toBe(2)
    expect(s.vars.k).toBe(2)
  })
})
