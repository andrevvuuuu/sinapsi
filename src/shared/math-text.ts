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

/**
 * Inline $…$ as renderMd reads it: the formula opens before a non-space and closes after one, or has spaces on
 * both sides ("$ \frac12 $"). A closing $ right before a digit is money ("costa $5 e $10"), unless the content
 * is clearly LaTeX ("$\frac12$5"). Group 1 is the formula, group 2 the digit after it.
 */
export const INLINE_MATH = String.raw`(?<![\\$])\$([^\s$][^$\n]*?(?<=\S)|[ \t]+[^$\n]*?\S[ \t]+)\$(?=(\d)?)`
/** Whether an INLINE_MATH match really is a formula (see the money rule above). */
export const isFormula = (tex: string, digitAfter: string | undefined): boolean => !digitAfter || /[\\^_{]/.test(tex)

/** What renderMd treats as math, plus code, blanks, links and tags: never normalized. */
const PROTECTED = new RegExp(String.raw`\`\`\`[\s\S]*?(?:\`\`\`|$)|\`[^\`\n]*\`|\$\$[\s\S]+?\$\$|${INLINE_MATH}|\{\{[\s\S]*?\}\}|https?:\/\/\S+|\]\([^)\n]*\)|<\/?[A-Za-z][^>\n]*>`, 'g')

/** Applies fn to the text outside the protected spans. */
function outside(text: string, fn: (s: string) => string): string {
  let out = ''
  let last = 0
  for (const m of text.matchAll(PROTECTED)) {
    // Money, not a formula: left to fn like the text around it.
    if (m[1] !== undefined && !isFormula(m[1], m[2])) continue
    out += fn(text.slice(last, m.index)) + m[0]
    last = m.index + m[0].length
  }
  return out + fn(text.slice(last))
}

const FNS = ['arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'sqrt', 'sin', 'cos', 'tan', 'cot', 'exp', 'log', 'ln', 'max', 'min', 'sup', 'inf', 'lim']
const SUP: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-', ⁿ: 'n' }
const RELS = ['<=', '>=', '=', '<', '>', '≤', '≥', '≠', '∈', '≈', '≡', '→']
const OPS = [...RELS, '+', '-', '−', '*', '/', '·', '×', '±', '∪', '∩']
/** LaTeX commands written between two terms: relations, then operators. */
const REL_CMDS = ['in', 'notin', 'le', 'leq', 'ge', 'geq', 'ne', 'neq', 'to', 'approx', 'equiv', 'implies', 'iff', 'subseteq', 'subset', 'Rightarrow', 'rightarrow', 'Leftrightarrow', 'mapsto', 'sim']
const OP_CMDS = ['cdot', 'times', 'pm', 'mp', 'cup', 'cap', 'setminus', 'circ', 'div']

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

  /** A subscript: _sec, _12, _{…}. Returns the index after it, j if there is none, -1 if it is malformed. */
  private sub(j: number, f: Flags): number {
    const s = this.s
    if (s[j] !== '_') return j
    let k = j + 1
    if (isAscii(s[k])) while (isAscii(s[k])) k++
    else if (isDigit(s[k])) while (isDigit(s[k])) k++
    else if (s[k] === '{') k = this.braces(k)
    else return -1
    if (k < 0) return -1
    f.mark = true
    return k
  }

  /** The LaTeX command at i (\alpha, \frac{…}{…}, \sqrt{…}), with its brace groups; -1 if it is an operator. */
  private command(i: number, f: Flags): number {
    const m = /^\\([A-Za-z]+)/.exec(this.s.slice(i, i + 40))
    if (!m || REL_CMDS.includes(m[1]) || OP_CMDS.includes(m[1])) return -1
    let j = i + m[0].length
    if (this.s[j] === '[') {
      const k = this.s.indexOf(']', j)
      if (k < 0) return -1
      j = k + 1
    }
    while (this.s[j] === '{') {
      j = this.braces(j)
      if (j < 0) return -1
    }
    f.mark = true
    return j
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

  /** Whether the last atom read was a LaTeX command (\int, \alpha…): a space may follow it inside a formula. */
  private cmd = false

  private atom(i: number, f: Flags): number {
    const s = this.s
    const c = s[i]
    this.cmd = false
    if (c === '\\') {
      let j = this.command(i, f)
      if (j < 0) return -1
      j = this.sub(j, f)
      if (j < 0) return -1
      this.cmd = true
      return this.post(j, f, false)
    }
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
    // Q1, H2O, A4: a capital with a number is a label, not a product.
    if (/[A-Z]/.test(c) && isDigit(s[i + 1])) return -1
    let j = i + 1
    while (s[j] === "'") j++
    if (j > i + 1 && isLetter(s[j])) return -1 // l'intervallo
    j = this.sub(j, f)
    if (j < 0) return -1
    return this.post(j, f, true)
  }

  /** Atoms written next to each other: 2x, 3c(c - 2), x³. */
  private term(i: number, f: Flags): number {
    let j = i
    if ('-−±+'.includes(this.s[j]) && this.s[j + 1] !== ' ') j++
    j = this.atom(j, f)
    if (j < 0) return -1
    for (;;) {
      let at = j
      // Inside LaTeX: a space after a command (\int_a^b f(x)) and the thin spaces \, \; \! join two atoms.
      if (this.cmd && this.s[at] === ' ') at++
      const joiner = /^\\[,;!]/.test(this.s.slice(at, at + 2))
      if (joiner) at += 2
      const c = this.s[at]
      if (!(isDigit(c) || isAscii(c) || c === '(' || c === '[' || c === '∞' || c === '\\')) return j
      // dx after a thin space: the differential.
      if (joiner && c === 'd' && isAscii(this.s[at + 1]) && !isLetter(this.s[at + 2])) {
        j = at + 2
        continue
      }
      const g: Flags = { ...f }
      const k = this.atom(at, g)
      if (k < 0) return j
      Object.assign(f, g)
      j = k
    }
  }

  private op(i: number): string | null {
    const s = this.s
    // "(1, 2) U (3, 4)": a capital U between two intervals is a union.
    if (s[i] === 'U' && s[i - 1] === ' ' && s[i + 1] === ' ' && '(['.includes(s[i + 2])) return 'U'
    const m = /^\\([A-Za-z]+)(?![A-Za-z])/.exec(s.slice(i, i + 20))
    if (m) return REL_CMDS.includes(m[1]) || OP_CMDS.includes(m[1]) ? m[0] : null
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
      if (RELS.includes(op) || REL_CMDS.includes(op.slice(1))) g.rel = true
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

const NO_START = /[\p{L}\p{N}\\_'^{]/u
const STARTS = /[A-Za-z0-9([|∞\-−±\\]/
/** Generated delimiters, turned into $ at the end: they can merge with a formula that touches them. */
const D = '\u0001'

/** The LaTeX of a span the scanner accepted: subscripts in roman, superscripts, functions, symbols. */
export function toTex(span: string): string {
  return groupParens(span)
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿ]+/g, (m) => `^{${[...m].map((c) => SUP[c]).join('')}}`)
    // 2^10, x^-1, a_12: more than one character goes in braces.
    .replace(/\^(-?\d+(?:\.\d+)?)/g, (m, e: string) => (e.length > 1 ? `^{${e}}` : m))
    .replace(/_(\d{2,})/g, '_{$1}')
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

/** e^(x), x^(n+1): an exponent in parentheses becomes a brace group, as LaTeX wants. */
function groupParens(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '^' && s[i + 1] === '(') {
      let depth = 0
      let j = i + 1
      for (; j < s.length; j++) {
        if (s[j] === '(') depth++
        else if (s[j] === ')' && --depth === 0) break
      }
      if (j < s.length) {
        out += `^{${s.slice(i + 2, j)}}`
        i = j
        continue
      }
    }
    out += s[i]
  }
  return out
}

const AFTER_EQ = /^( +(?:su|in|per|di|sull'intervallo|nell'intervallo)? *)/
/** Spans that parse but are prose: «pagina 5 > 3», «versione 2.0 → 3.0» (two bare numbers compared). */
const NUMBERS_ONLY = /^-?\d+(?:\.\d+)?\s*(?:<=|>=|=|<|>|≤|≥|≠|→|≈)\s*-?\d+(?:\.\d+)?$/
/** «20 m²», «m² di superficie»: a unit, not a formula. */
const isUnit = (span: string, before: string, after: string): boolean => /^(?:[kcdm]?m|s)[²³]$/.test(span) && (/\d\s*$/.test(before) || /^ di\b/.test(after))

function normalizePlain(s: string): string {
  const sc = new Scanner(s)
  let out = ''
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (STARTS.test(c) && !(i > 0 && NO_START.test(s[i - 1]))) {
      const f: Flags = { rel: false, mark: false }
      const e = sc.expr(i, f)
      const span = s.slice(i, Math.max(i, e))
      if (e > i && (f.rel || f.mark) && !NO_START.test(s[e] ?? '') && !NUMBERS_ONLY.test(span) && !isUnit(span, s.slice(0, i), s.slice(e))) {
        out += D + toTex(span) + D
        i = e
        const gap = f.rel ? AFTER_EQ.exec(s.slice(i)) : null
        const k = gap ? sc.interval(i + gap[1].length) : -1
        if (gap && k > 0 && !NO_START.test(s[k] ?? '')) {
          out += gap[1] + D + toTex(s.slice(i + gap[1].length, k)) + D
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
 * Wraps the clear plain-text formulas of a model text in $…$; everything else stays as it was. A formula
 * written flush against an existing one («$f$(x) = 2x^2») joins it instead of making «$$». The one $ of a
 * text with a single unmatched $ opening a formula («il punto $c = 3») is dropped; money keeps its $.
 */
export function normalizeMath(text: string): string {
  if (!text) return text
  // «R\{0}»: a number set minus a set, the one LaTeX-ish form the model writes bare.
  const sets = outside(text, (s) => s.replace(/(?<![\p{L}\\])([RNZQC])\\\{([^{}\n]*)\}/gu, (_m, set: string, out: string) => `$\\mathbb{${set}} \\setminus \\{${out}\\}$`))
  let loose = 0
  outside(sets, (s) => ((loose += (s.match(/(?<!\\)\$/g) ?? []).length), s))
  const out = outside(sets, (s) => normalizePlain(loose === 1 ? s.replace(/(?<!\\)\$(?=[^\s\d$])/, '') : s))
  return out
    .replace(new RegExp(`(?<![$\\\\])\\$${D}`, 'g'), '')
    .replace(new RegExp(`${D}\\$(?!\\$)`, 'g'), '')
    .replace(new RegExp(`${D}(?=\\$)`, 'g'), '$ ')
    .replace(new RegExp(`(?<=\\$)${D}`, 'g'), ' $')
    .replaceAll(D, '$')
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
    // A subscript on a one-letter name (y_sec, x_0; not snake_case or nota_finale.md), an exponent not on a
    // unit (x^2, 2^10; not km^2), a unicode superscript not on a unit (x²; not 20 m²), a LaTeX command.
    const re = /(?<![A-Za-z0-9])[A-Za-z]_[A-Za-z0-9{]+|(?<![A-Za-z])[A-Za-z0-9)]\^[A-Za-z0-9({-]+|\S*[⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ]\S*|\\[A-Za-z]+/g
    for (const m of s.matchAll(re)) {
      const before = s.slice(0, m.index)
      if (/^[kcdm]?m[²³]$/.test(m[0]) && (/\d\s*$/.test(before) || /^ di\b/.test(s.slice(m.index + m[0].length)))) continue
      markers.push(m[0])
    }
    return s
  })
  if (markers.length) issues.push(`matematica fuori da $…$ («${markers.slice(0, 3).join('», «')}»)`)
  return issues
}
