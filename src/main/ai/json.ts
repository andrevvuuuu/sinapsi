// LaTeX commands that begin with a valid JSON escape letter (b f n r t): "\frac" must not become a form feed.
const LATEX = new Set(
  'beta bar binom big bigl bigr bigg bf boldsymbol bullet backslash bot frac forall flat nabla neq ne nu not notin neg nexists ni rho right rightarrow rangle rceil rfloor rm theta tau times to text textbf textit tan tanh tilde top triangle tfrac therefore'.split(' ')
)

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
    else if ('bfnrt'.includes(next) && next !== '' && !LATEX.has(word)) out += c
    else out += '\\\\'
  }
  return out
}

function parseLoose(t: string): unknown {
  try {
    return JSON.parse(t)
  } catch (e) {
    try {
      return JSON.parse(repairBackslashes(t))
    } catch {
      throw e
    }
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
    if (end > start) return parseLoose(t.slice(start, end + 1))
  }
  throw new SyntaxError('nessun JSON nella risposta')
}
