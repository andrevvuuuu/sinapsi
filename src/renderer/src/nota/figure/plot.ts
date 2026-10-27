import { compileExpr, type CompiledExpr, type Scope } from '../../../../shared/expr'
import type { Figure } from '../../../../shared/nota-schema'

type Fn = (x: number) => number
const compiled = new WeakMap<Figure, { fns: Record<string, CompiledExpr>; exprs: Map<string, CompiledExpr> }>()

function compiledFor(fig: Figure): { fns: Record<string, CompiledExpr>; exprs: Map<string, CompiledExpr> } {
  let c = compiled.get(fig)
  if (!c) {
    const names = Object.keys(fig.functions)
    const vars = ['x', ...fig.params.map((p) => p.id)]
    c = { fns: Object.fromEntries(names.map((n) => [n, compileExpr(fig.functions[n], { vars, fns: names })])), exprs: new Map() }
    compiled.set(fig, c)
  }
  return c
}

/** The figure's functions closed over the current parameter values. */
export function makeScope(fig: Figure, params: Record<string, number>): Scope {
  const c = compiledFor(fig)
  const fns: Record<string, Fn> = {}
  for (const [name, body] of Object.entries(c.fns)) fns[name] = (t) => body.eval({ vars: { ...params, x: t }, fns })
  return { vars: { ...params }, fns }
}

/** Evaluates one of the figure's expressions (validated at parse time; cached per figure). */
export function evalIn(fig: Figure, src: string, scope: Scope): number {
  const c = compiledFor(fig)
  let e = c.exprs.get(src)
  if (!e) {
    try {
      e = compileExpr(src, { vars: ['x', ...fig.params.map((p) => p.id)], fns: Object.keys(fig.functions) })
    } catch {
      return NaN
    }
    c.exprs.set(src, e)
  }
  return e.eval(scope)
}

/**
 * SVG path of y = fn(x). A new subpath starts where the function is undefined or discontinuous
 * (a pole or a jump), so the curve is never joined across the break by a vertical line.
 */
export function samplePath(fn: Fn, [x0, x1]: [number, number], [y0, y1]: [number, number], toPx: (x: number, y: number) => [number, number], n = 400): string {
  const span = y1 - y0
  const lo = y0 - 3 * span
  const hi = y1 + 3 * span
  let d = ''
  let prev: number | null = null
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n
    const y = fn(x)
    if (!Number.isFinite(y)) {
      prev = null
      continue
    }
    const jump = prev !== null && Math.abs(y - prev) > 0.02 * span && isBreak(fn, x - (x1 - x0) / n, x, prev, y, 0.02 * span, (x1 - x0) * 1e-9)
    const [px, py] = toPx(x, Math.min(hi, Math.max(lo, y)))
    d += `${prev === null || jump ? 'M' : 'L'}${px.toFixed(2)},${py.toFixed(2)}`
    prev = y
  }
  return d
}

/**
 * True when fn is discontinuous between a and b: bisect towards the half holding the larger change;
 * a continuous curve's change shrinks with the interval, a jump or a pole keeps it.
 */
function isBreak(fn: Fn, a: number, b: number, ya: number, yb: number, tol: number, minWidth: number): boolean {
  for (let k = 0; k < 60; k++) {
    if (Math.abs(yb - ya) <= tol) return false
    if (b - a <= minWidth) return true
    const m = (a + b) / 2
    const ym = fn(m)
    if (!Number.isFinite(ym)) return true
    if (Math.abs(ym - ya) >= Math.abs(yb - ym)) [b, yb] = [m, ym]
    else [a, ya] = [m, ym]
  }
  return true
}

/** Zeros of g on [a, b]: sign changes refined by bisection, plus tangencies (|g| touching 0). Poles are not zeros. */
export function findRoots(g: Fn, [a, b]: [number, number], n = 400): number[] {
  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i <= n; i++) {
    const x = a + ((b - a) * i) / n
    xs.push(x)
    ys.push(g(x))
  }
  const finite = ys.filter(Number.isFinite).map(Math.abs).sort((p, q) => p - q)
  const scale = Math.max(1, finite[Math.floor(finite.length / 2)] ?? 1)
  const tol = 1e-6 * scale
  const roots: number[] = []
  const push = (r: number): void => {
    if (Math.abs(g(r)) <= tol && !roots.some((x) => Math.abs(x - r) < (b - a) / n)) roots.push(r)
  }
  for (let i = 0; i < n; i++) {
    const [ya, yb] = [ys[i], ys[i + 1]]
    if (!Number.isFinite(ya) || !Number.isFinite(yb)) continue
    if (ya === 0) push(xs[i])
    else if (ya * yb < 0) {
      let [lo, hi, glo] = [xs[i], xs[i + 1], ya]
      for (let k = 0; k < 80 && hi - lo > 1e-12; k++) {
        const mid = (lo + hi) / 2
        const gm = g(mid)
        if (gm === 0) {
          lo = hi = mid
          break
        }
        if (Math.sign(gm) === Math.sign(glo)) [lo, glo] = [mid, gm]
        else hi = mid
      }
      push((lo + hi) / 2)
    }
  }
  if (Number.isFinite(ys[n]) && ys[n] === 0) push(xs[n])
  // Tangency: a local minimum of |g| that reaches (almost) zero without a sign change.
  for (let i = 1; i < n; i++) {
    const [p, c, q] = [Math.abs(ys[i - 1]), Math.abs(ys[i]), Math.abs(ys[i + 1])]
    if (!(c <= p && c <= q) || !Number.isFinite(p + c + q)) continue
    let [lo, hi] = [xs[i - 1], xs[i + 1]]
    const phi = (Math.sqrt(5) - 1) / 2
    for (let k = 0; k < 100; k++) {
      const m1 = hi - phi * (hi - lo)
      const m2 = lo + phi * (hi - lo)
      if (Math.abs(g(m1)) < Math.abs(g(m2))) hi = m2
      else lo = m1
    }
    push((lo + hi) / 2)
  }
  return roots.sort((p, q) => p - q)
}

/** Italian number: decimal comma, real minus sign, "—" when undefined. */
export function fmt(v: number, d = 2): string {
  if (!Number.isFinite(v)) return '—'
  const r = Math.abs(v) < 0.5 * 10 ** -d ? 0 : v
  return r.toFixed(d).replace('.', ',').replace('-', '−')
}
