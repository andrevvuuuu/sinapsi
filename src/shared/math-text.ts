/**
 * Plain-text math in model text. Gemini sometimes writes formulas without $…$ («g(x) = f(x) - y_sec(x)»,
 * «x² - 4x + 3»): normalizeMath wraps the clear ones in $…$ so they are typeset, and plainMathIssues
 * finds them (and unbalanced $) so a new note can be sent back to be fixed.
 *
 * Conservative on purpose: a span is wrapped only when it parses as a formula (single-letter names,
 * numbers, known functions, operators, brackets) AND carries a sign of math (a relation, a subscript,
 * an exponent, a function call). Italian words never parse, so prose is never touched. Existing $…$,
 * code, cloze blanks, URLs and HTML tags are left exactly as they are.
 */

/** What renderMd treats as math, plus code, blanks, links and tags: never normalized. */
const PROTECTED = /```[\s\S]*?(?:```|$)|`[^`\n]*`|\$\$[\s\S]+?\$\$|(?<![\\$])\$(?=\S)[^$\n]+?(?<=\S)\$(?!\d)|\{\{[\s\S]*?\}\}|https?:\/\/\S+|\]\([^)\n]*\)|<\/?[A-Za-z][^>\n]*>/g

/** Applies fn to the text outside the protected spans. */
function outside(text: string, fn: (s: string) => string): string {
  let out = ''
  let last = 0
  for (const m of text.matchAll(PROTECTED)) {
    out += fn(text.slice(last, m.index)) + m[0]
    last = m.index + m[0].length
  }
  return out + fn(text.slice(last))
}

const FNS = ['arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'sqrt', 'sin', 'cos', 'tan', 'cot', 'exp', 'log', 'ln', 'max', 'min', 'sup', 'inf', 'lim']
const SUP: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-', ⁿ: 'n' }
const RELS = ['<=', '>=', '=', '<', '>', '≤', '≥', '≠', '∈', '≈', '≡', '→']
const OPS = [...RELS, '+', '-', '−', '*', '/', '·', '×', '±', '∪', '∩']

const isLetter = (c: string | undefined): boolean => !!c && /\p{L}/u.test(c)
const isAscii = (c: string | undefined): boolean => !!c && /[A-Za-z]/.test(c)
const isDigit = (c: string | undefined): boolean => !!c && c >= '0' && c <= '9'
const isSup = (c: string | undefined): boolean => !!c && c in SUP

type Flags = { rel: boolean; mark: boolean }

/** A recursive scanner: each parse returns the index after what it read, or -1. */
class Scanner {
  constructor(private s: string) {}

  private spaces(i: number): number {
    while (this.s[i] === ' ') i++
    return i
  }

  private braces(i: number): number {
    let depth = 0
    for (let j = i; j < this.s.length; j++) {
      if (this.s[j] === '{') depth++
      else if (this.s[j] === '}' && --depth === 0) return j + 1
      else if (this.s[j] === '\n') return -1
    }
    return -1
  }

  /** Comma-separated expressions up to the closer; returns the closer's index. */
  private list(i: number, closers: string, f: Flags, commas = true): number {
    let j = this.expr(this.spaces(i), f)
    if (j < 0) return -1
    for (;;) {
      const k = this.spaces(j)
      if (commas && this.s[k] === ',') {
        j = this.expr(this.spaces(k + 1), f)
        if (j < 0) return -1
      } else {
        j = k
        break
      }
    }
    return closers.includes(this.s[j]) ? j : -1
  }

  /** Exponents after an atom: ^2, ^{n+1}, ^(x), x², and a call right after a name: f(x). */
  private post(j: number, f: Flags, call: boolean): number {
    if (call && this.s[j] === '(') {
      const k = this.list(j + 1, ')', f)
      if (k < 0) return -1
      f.mark = true
      j = k + 1
    }
    for (;;) {
      if (isSup(this.s[j])) {
        f.mark = true
        while (isSup(this.s[j])) j++
      } else if (this.s[j] === '^') {
        let k = j + 1
        const c = this.s[k]
        if (c === '{') k = this.braces(k)
        else if (c === '(') k = this.list(k + 1, ')', f) + 1 || -1
        else if (c === '-' && isDigit(this.s[k + 1])) k = this.number(k + 1)
        else if (isDigit(c)) k = this.number(k)
        else if (isAscii(c) && !isLetter(this.s[k + 1])) k++
        else return -1
        if (k <= 0) return -1
        f.mark = true
        j = k
      } else return j
    }
  }

  private number(i: number): number {
    let j = i
    while (isDigit(this.s[j])) j++
    if (this.s[j] === '.' && isDigit(this.s[j + 1])) {
      j++
      while (isDigit(this.s[j])) j++
    }
    return j
  }

  private atom(i: number, f: Flags): number {
    const s = this.s
    const c = s[i]
    if (isDigit(c)) return this.post(this.number(i), f, false)
    if (c === '∞') return this.post(i + 1, f, false)
    if (c === '(' || c === '[') {
      const k = this.list(i + 1, ')]', f)
      return k < 0 ? -1 : this.post(k + 1, f, false)
    }
    if (c === '|') {
      const k = this.list(i + 1, '|', f, false)
      return k < 0 ? -1 : this.post(k + 1, f, false)
    }
    if (!isAscii(c)) return -1
    for (const fn of FNS) {
      if (s.startsWith(fn, i) && !isLetter(s[i + fn.length]) && s[i + fn.length] === '(') return this.post(i + fn.length, f, true)
    }
    if (s.startsWith('pi', i) && !isLetter(s[i + 2])) return this.post(i + 2, f, false)
    if (isLetter(s[i + 1])) return -1
    let j = i + 1
    while (s[j] === "'") j++
    if (j > i + 1 && isLetter(s[j])) return -1 // l'intervallo
    if (s[j] === '_') {
      let k = j + 1
      if (isAscii(s[k])) while (isAscii(s[k])) k++
      else if (isDigit(s[k])) while (isDigit(s[k])) k++
      else if (s[k] === '{') k = this.braces(k)
      else return -1
      if (k < 0) return -1
      f.mark = true
      j = k
    }
    return this.post(j, f, true)
  }

  /** Atoms written next to each other: 2x, 3c(c - 2), x³. */
  private term(i: number, f: Flags): number {
    let j = i
    if ('-−±+'.includes(this.s[j]) && this.s[j + 1] !== ' ') j++
    j = this.atom(j, f)
    if (j < 0) return -1
    for (;;) {
      const c = this.s[j]
      if (!(isDigit(c) || isAscii(c) || c === '(' || c === '[' || c === '∞')) return j
      const g: Flags = { ...f }
      const k = this.atom(j, g)
      if (k < 0) return j
      Object.assign(f, g)
      j = k
    }
  }

  private op(i: number): string | null {
    const s = this.s
    // "(1, 2) U (3, 4)": a capital U between two intervals is a union.
    if (s[i] === 'U' && s[i - 1] === ' ' && s[i + 1] === ' ' && '(['.includes(s[i + 2])) return 'U'
    return OPS.find((o) => s.startsWith(o, i)) ?? null
  }

  expr(i: number, f: Flags): number {
    let j = this.term(i, f)
    if (j < 0) return -1
    for (;;) {
      const k = this.spaces(j)
      const op = this.op(k)
      if (!op) return j
      const g: Flags = { ...f }
      const t = this.term(this.spaces(k + op.length), g)
      if (t < 0) return j
      if (RELS.includes(op)) g.rel = true
      Object.assign(f, g)
      j = t
    }
  }

  /** An interval right after an equation: «f(x) = x² su [1, 5]». */
  interval(i: number): number {
    if (this.s[i] !== '[' && this.s[i] !== '(') return -1
    const f: Flags = { rel: false, mark: false }
    const k = this.atom(i, f)
    return k > 0 && this.s.slice(i, k).includes(',') ? k : -1
  }
}

const NO_START = /[\p{L}\p{N}\\_'^]/u
const STARTS = /[A-Za-z0-9([|∞\-−±]/

/** The LaTeX of a span the scanner accepted: subscripts in roman, superscripts, functions, symbols. */
export function toTex(span: string): string {
  return span
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿ]+/g, (m) => `^{${[...m].map((c) => SUP[c]).join('')}}`)
    .replace(/([A-Za-z])_([A-Za-z]{2,})/g, '$1_{\\mathrm{$2}}')
    .replace(/(?<![\\{A-Za-z])sqrt\(([^()]*)\)/g, '\\sqrt{$1}')
    .replace(new RegExp(`(?<![\\\\{A-Za-z])(${FNS.filter((f) => f !== 'sqrt').join('|')})(?![A-Za-z])`, 'g'), '\\$1')
    .replace(/(?<![\\{A-Za-z])pi(?![A-Za-z])/g, '\\pi ')
    .replace(/<=/g, '\\le ')
    .replace(/>=/g, '\\ge ')
    .replace(/ U /g, ' \\cup ')
    .replace(/[∞±≤≥≠∈≈≡·×*−→∪∩]/g, (c) => ({ '∞': '\\infty ', '±': '\\pm ', '≤': '\\le ', '≥': '\\ge ', '≠': '\\ne ', '∈': '\\in ', '≈': '\\approx ', '≡': '\\equiv ', '·': '\\cdot ', '×': '\\times ', '*': '\\cdot ', '−': '-', '→': '\\to ', '∪': '\\cup ', '∩': '\\cap ' })[c] ?? c)
    .replace(/ {2,}/g, ' ')
    .replace(/ +$/, '')
}

const AFTER_EQ = /^( +(?:su|in|per|di|sull'intervallo|nell'intervallo)? *)/

function normalizePlain(s: string): string {
  const sc = new Scanner(s)
  let out = ''
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (STARTS.test(c) && !(i > 0 && NO_START.test(s[i - 1]))) {
      const f: Flags = { rel: false, mark: false }
      const e = sc.expr(i, f)
      if (e > i && (f.rel || f.mark) && !NO_START.test(s[e] ?? '') && s[e] !== '$') {
        out += `$${toTex(s.slice(i, e))}$`
        i = e
        const gap = f.rel ? AFTER_EQ.exec(s.slice(i)) : null
        const k = gap ? sc.interval(i + gap[1].length) : -1
        if (gap && k > 0 && !NO_START.test(s[k] ?? '')) {
          out += gap[1] + `$${toTex(s.slice(i + gap[1].length, k))}$`
          i = k
        }
        continue
      }
    }
    if (isLetter(c)) {
      let j = i
      while (j < s.length && (isLetter(s[j]) || isDigit(s[j]))) j++
      out += s.slice(i, j)
      i = j
      continue
    }
    out += c
    i++
  }
  return out
}

/**
 * Wraps the clear plain-text formulas of a model text in $…$; everything else stays as it was. A $ left
 * alone outside any formula (one the model never closed) is dropped rather than shown.
 */
export function normalizeMath(text: string): string {
  if (!text) return text
  // «R\{0}»: a number set minus a set, the one LaTeX-ish form the model writes bare.
  const sets = outside(text, (s) => s.replace(/(?<![\p{L}\\])([RNZQC])\\\{([^{}\n]*)\}/gu, (_m, set: string, out: string) => `$\\mathbb{${set}} \\setminus \\{${out}\\}$`))
  return outside(sets, (s) => normalizePlain(s.replace(/(?<!\\)\$/g, '')))
}

/** Single $ delimiters, after code, escaped \$ and $$…$$ are set aside. */
function dollars(text: string): number {
  const t = text
    .replace(/```[\s\S]*?(?:```|$)|`[^`\n]*`/g, '')
    .replace(/\\\$/g, '')
    .replace(/\$\$[\s\S]+?\$\$/g, '')
  return (t.match(/\$/g) ?? []).length
}

/**
 * What is wrong with the math of a model text: an odd number of $, or plain-text math markers outside
 * $…$ (a subscript with _, an exponent with ^, a unicode superscript). Empty when it is fine.
 */
export function plainMathIssues(text: string): string[] {
  const issues: string[] = []
  if (dollars(text) % 2 === 1) issues.push('un $ senza chiusura')
  const markers: string[] = []
  outside(text, (s) => {
    for (const m of s.matchAll(/[A-Za-z]+_[A-Za-z0-9{]+|[A-Za-z0-9)]\^[A-Za-z0-9({-]+|\S*[⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ]\S*/g)) markers.push(m[0])
    return s
  })
  if (markers.length) issues.push(`matematica fuori da $…$ («${markers.slice(0, 3).join('», «')}»)`)
  return issues
}
