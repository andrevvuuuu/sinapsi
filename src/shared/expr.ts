/**
 * A tiny, safe expression language for declarative figures. Model output is parsed into a closure
 * tree; nothing is ever passed to eval or Function, and only whitelisted names resolve.
 */
export type Scope = { vars: Record<string, number>; fns: Record<string, (x: number) => number> }
export type CompiledExpr = { eval(scope: Scope): number; src: string }
type Node = (s: Scope) => number

export class ExprError extends Error {}

const UNARY: Record<string, (v: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
  sqrt: Math.sqrt,
  abs: Math.abs,
  sign: Math.sign,
  floor: Math.floor
}
const BINARY: Record<string, (a: number, b: number) => number> = { min: Math.min, max: Math.max }
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E }
const H = 1e-5
const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k)

type Tok = { k: 'num'; v: number; at: number } | { k: 'id'; v: string; at: number } | { k: 'op'; v: string; at: number }

function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) {
      i++
    } else if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i))
      if (!m) throw new ExprError(`numero non valido alla posizione ${i + 1}`)
      out.push({ k: 'num', v: Number(m[0]), at: i })
      i += m[0].length
    } else if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!
      out.push({ k: 'id', v: m[0], at: i })
      i += m[0].length
    } else if ('+-*/^(),\''.includes(c)) {
      out.push({ k: 'op', v: c, at: i })
      i++
    } else throw new ExprError(`carattere «${c}» non ammesso alla posizione ${i + 1}`)
  }
  return out
}

export function compileExpr(src: string, known: { vars: string[]; fns: string[] }): CompiledExpr {
  const toks = tokenize(src)
  let p = 0
  const peek = (): Tok | undefined => toks[p]
  const isOp = (v: string): boolean => peek()?.k === 'op' && peek()!.v === v
  const expect = (v: string): void => {
    if (!isOp(v)) throw new ExprError(`atteso «${v}» ${where()}`)
    p++
  }
  const where = (): string => (peek() ? `alla posizione ${peek()!.at + 1}` : 'alla fine')

  // expr := term (('+'|'-') term)*
  function expr(): Node {
    let left = term()
    while (isOp('+') || isOp('-')) {
      const op = toks[p++].v
      const a = left
      const b = term()
      left = op === '+' ? (s) => a(s) + b(s) : (s) => a(s) - b(s)
    }
    return left
  }
  // term := unary (('*'|'/') unary)*
  function term(): Node {
    let left = unary()
    while (isOp('*') || isOp('/')) {
      const op = toks[p++].v
      const a = left
      const b = unary()
      left = op === '*' ? (s) => a(s) * b(s) : (s) => a(s) / b(s)
    }
    return left
  }
  // unary := '-' unary | power   (so -x^2 = -(x^2))
  function unary(): Node {
    if (isOp('-')) {
      p++
      const a = unary()
      return (s) => -a(s)
    }
    if (isOp('+')) {
      p++
      return unary()
    }
    return power()
  }
  // power := atom ('^' unary)?   (right-associative)
  function power(): Node {
    const base = atom()
    if (isOp('^')) {
      p++
      const ex = unary()
      return (s) => Math.pow(base(s), ex(s))
    }
    return base
  }
  function args(): Node[] {
    expect('(')
    const list = [expr()]
    while (isOp(',')) {
      p++
      list.push(expr())
    }
    expect(')')
    return list
  }
  function atom(): Node {
    const t = peek()
    if (!t) throw new ExprError('espressione incompleta')
    if (t.k === 'num') {
      p++
      const v = t.v
      return () => v
    }
    if (t.k === 'op' && t.v === '(') {
      p++
      const inner = expr()
      expect(')')
      return inner
    }
    if (t.k === 'id') {
      p++
      const name = t.v
      const prime = isOp("'")
      if (prime) p++
      if (isOp('(')) {
        const a = args()
        if (known.fns.includes(name)) {
          if (a.length !== 1) throw new ExprError(`${name} vuole un solo argomento`)
          const arg = a[0]
          if (prime)
            return (s) => {
              const f = s.fns[name]
              const x = arg(s)
              return (f(x + H) - f(x - H)) / (2 * H)
            }
          return (s) => s.fns[name](arg(s))
        }
        if (prime) throw new ExprError(`«${name}'» non è una funzione della figura`)
        if (has(UNARY, name)) {
          if (a.length !== 1) throw new ExprError(`${name} vuole un solo argomento`)
          const fn = UNARY[name]
          const arg = a[0]
          return (s) => fn(arg(s))
        }
        if (has(BINARY, name)) {
          if (a.length !== 2) throw new ExprError(`${name} vuole due argomenti`)
          const fn = BINARY[name]
          const [x, y] = a
          return (s) => fn(x(s), y(s))
        }
        throw new ExprError(`funzione sconosciuta «${name}»`)
      }
      if (prime) throw new ExprError(`«${name}'» senza argomento`)
      if (known.vars.includes(name)) return (s) => s.vars[name] ?? NaN
      if (has(CONSTS, name)) {
        const v = CONSTS[name]
        return () => v
      }
      throw new ExprError(`nome sconosciuto «${name}»`)
    }
    throw new ExprError(`simbolo inatteso «${t.v}» ${where()}`)
  }

  if (!toks.length) throw new ExprError('espressione vuota')
  const root = expr()
  if (p < toks.length) throw new ExprError(`simbolo inatteso «${String(toks[p].v)}» ${where()}`)
  return {
    src,
    eval(scope) {
      try {
        return root(scope)
      } catch {
        return NaN
      }
    }
  }
}
