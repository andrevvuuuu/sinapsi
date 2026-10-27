import { describe, expect, it } from 'vitest'
import { compileExpr, ExprError, type Scope } from '../../src/shared/expr'

const known = { vars: ['x', 'p'], fns: ['f'] }
const scope = (x: number, fns: Scope['fns'] = {}): Scope => ({ vars: { x, p: 0 }, fns })
const ev = (src: string, x = 0, fns: Scope['fns'] = {}): number => compileExpr(src, known).eval(scope(x, fns))

describe('compileExpr', () => {
  it('evaluates arithmetic with precedence', () => {
    expect(ev('x^3/4 - x + 3/2', 2)).toBeCloseTo(1.5)
    expect(ev('-x^2', 3)).toBe(-9)
    expect(ev('2^3^2')).toBe(512)
    expect(ev('(1+2)*3')).toBe(9)
    expect(ev('2e-3*1000')).toBeCloseTo(2)
  })
  it('supports built-ins and constants', () => {
    expect(ev('max(1, x)', 5)).toBe(5)
    expect(ev('min(1, x)', 5)).toBe(1)
    expect(ev('pi')).toBeCloseTo(Math.PI)
    expect(ev('e')).toBeCloseTo(Math.E)
    expect(ev('sqrt(abs(-16)) + log(100) + sign(-3)')).toBeCloseTo(5)
    expect(ev('sin(pi/2) + cos(0) + exp(0) + ln(e)')).toBeCloseTo(4)
  })
  it('calls user functions and their derivative', () => {
    const fns = { f: (t: number) => t * t }
    expect(ev('f(3)', 0, fns)).toBe(9)
    expect(Math.abs(ev("f'(1)", 0, fns) - 2)).toBeLessThan(1e-6)
  })
  it('never throws while evaluating', () => {
    expect(ev('ln(-1)')).toBeNaN()
    expect(ev('1/0')).toBe(Infinity)
    expect(ev('sqrt(-1)')).toBeNaN()
  })
  it('rejects unknown identifiers and bad syntax', () => {
    expect(() => compileExpr('y + 1', known)).toThrow(ExprError)
    expect(() => compileExpr('y + 1', known)).toThrow(/y/)
    expect(() => compileExpr('2x', known)).toThrow(ExprError)
    expect(() => compileExpr('sin(', known)).toThrow(ExprError)
    expect(() => compileExpr('x^^2', known)).toThrow(ExprError)
    expect(() => compileExpr('', known)).toThrow(ExprError)
    expect(() => compileExpr("g'(x)", known)).toThrow(ExprError)
    expect(() => compileExpr('max(1)', known)).toThrow(ExprError)
  })
  it('rejects prototype and global names', () => {
    for (const bad of ['constructor', '__proto__', 'process', 'toString(x)', 'globalThis'])
      expect(() => compileExpr(bad, known)).toThrow(ExprError)
  })
})
