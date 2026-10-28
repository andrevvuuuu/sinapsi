// \b, \f and \r followed by a letter are always LaTeX (models never mean backspace, form feed or CR there).
// \n and \t are real escapes too often: only these commands are read as LaTeX.
const LATEX_N = new Set('nabla neq ne nu not notin neg nexists nmid nleq ngeq nsubseteq nsupseteq newline nleftarrow nrightarrow'.split(' '))
const LATEX_T = new Set('theta tau times to text textbf textit textrm texttt tan tanh tilde top triangle triangleq tfrac tbinom therefore'.split(' '))

const isLatex = (letter: string, word: string): boolean =>
  'bfr'.includes(letter) ? word.length > 1 : letter === 'n' ? LATEX_N.has(word) : letter === 't' ? LATEX_T.has(word) : false

/** Models often write LaTeX with single backslashes inside JSON strings: double the ones that are not real escapes. */
function repairBackslashes(t: string): string {
  let out = ''
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (c !== '\\') {
      out += c
      continue
    }
    const next = t[i + 1] ?? ''
    const word = /^[A-Za-z]+/.exec(t.slice(i + 1))?.[0] ?? ''
    if (next === '\\' || next === '"' || next === '/') {
      out += c + next
      i++
    } else if (next === 'u' && /^u[0-9a-fA-F]{4}/.test(t.slice(i + 1))) out += c
    else if ('bfnrt'.includes(next) && next !== '' && !isLatex(next, word)) out += c
    else out += '\\\\'
  }
  return out
}

/** A reply that parsed but whose strings hold control characters where LaTeX was meant (\frac → form feed). */
function looksMangled(v: unknown): boolean {
  if (typeof v === 'string') {
    // eslint-disable-next-line no-control-regex -- detecting the control characters is the point
    if (/[\u0008\u000c]/.test(v)) return true
    const letterOf: Record<string, string> = { '\t': 't', '\n': 'n', '\r': 'r' }
    for (const m of v.matchAll(/([\t\n\r])([A-Za-z]+)/g)) {
      const letter = letterOf[m[1]]
      if (isLatex(letter, letter + m[2])) return true
    }
    return false
  }
  if (Array.isArray(v)) return v.some(looksMangled)
  if (v && typeof v === 'object') return Object.values(v).some(looksMangled)
  return false
}

function parseLoose(t: string): unknown {
  let first: unknown
  try {
    first = JSON.parse(t)
  } catch (e) {
    try {
      return JSON.parse(repairBackslashes(t))
    } catch {
      throw e
    }
  }
  if (!looksMangled(first)) return first
  try {
    return JSON.parse(repairBackslashes(t))
  } catch {
    return first
  }
}

/** Raw JSON, the first ```json fence, or the outermost {…} / […] inside text. */
export function extractJson(text: string): unknown {
  const t = text.trim()
  try {
    return parseLoose(t)
  } catch {
    /* try the other shapes */
  }
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) {
    try {
      return parseLoose(fence[1].trim())
    } catch {
      /* fall through */
    }
  }
  const starts = [t.indexOf('{'), t.indexOf('[')].filter((i) => i >= 0)
  if (starts.length) {
    const start = Math.min(...starts)
    const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'))
    if (end > start)
      try {
        return parseLoose(t.slice(start, end + 1))
      } catch {
        /* prose with braces around the JSON: look at each balanced block */
      }
  }
  // Every balanced {…} or […] (strings respected) that parses; the largest is the answer.
  let best: { value: unknown; size: number } | null = null
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== '{' && t[i] !== '[') continue
    const end = balancedEnd(t, i)
    if (end < 0) continue
    try {
      const value = parseLoose(t.slice(i, end + 1))
      if (!best || end + 1 - i > best.size) best = { value, size: end + 1 - i }
      i = end
    } catch {
      /* not JSON: keep looking inside */
    }
  }
  if (best) return best.value
  throw new SyntaxError('nessun JSON nella risposta')
}

/** Index of the bracket closing the one at `start`, skipping brackets inside JSON strings; -1 if none. */
function balancedEnd(t: string, start: number): number {
  let depth = 0
  let inString = false
  for (let i = start; i < t.length; i++) {
    const c = t[i]
    if (inString) {
      if (c === '\\') i++
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{' || c === '[') depth++
    else if (c === '}' || c === ']') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * Text a model escaped twice (asked for JSON, it doubled the backslashes): "\\frac" back to "\frac",
 * and a literal "\n" not starting a LaTeX command back to a new line.
 */
export function unescapeOver(s: string): string {
  return s.replace(/\\\\(?=[a-zA-Z])/g, '\\').replace(/\\n(?![a-zA-Z])/g, '\n')
}
