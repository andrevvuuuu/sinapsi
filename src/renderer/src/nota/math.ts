const LATEX = /\\[a-zA-Z]+|[\^_]/

/**
 * A field meant to hold only math (a glossary symbol, a formal statement, a recap formula) as markdown:
 * the model sometimes forgets the $…$, so LaTeX without delimiters is wrapped; text with $ or plain words stay.
 */
export function asMath(s: string, display = false): string {
  const t = s.trim()
  if (!t || t.includes('$') || !LATEX.test(t)) return s
  return display ? `$$${t}$$` : `$${t}$`
}

const FENCE = /^```mermaid[^\n]*\n([\s\S]*?)^```[ \t]*$/gm

/** The text of a block split around its ```mermaid fences. */
export function splitMermaid(md: string): ({ md: string } | { mermaid: string })[] {
  const out: ({ md: string } | { mermaid: string })[] = []
  let last = 0
  for (const m of md.matchAll(FENCE)) {
    if (m.index > last) out.push({ md: md.slice(last, m.index) })
    out.push({ mermaid: m[1] })
    last = m.index + m[0].length
  }
  if (last < md.length) out.push({ md: md.slice(last) })
  return out
}

/** Model text as plain words for an aria-label: no $, no LaTeX commands. */
export const plainText = (s: string): string =>
  s
    .replace(/\$/g, '')
    .replace(/\\(?:text|mathrm|mathbf)\{([^}]*)\}/g, '$1')
    .replace(/\\([A-Za-z]+)/g, '$1')
    .replace(/[{}]/g, '')
    .trim()
