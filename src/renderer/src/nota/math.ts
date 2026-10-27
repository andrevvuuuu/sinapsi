const LATEX = /\\[a-zA-Z]+|[\^_{}]/

/**
 * A field meant to hold only math (a glossary symbol, a formal statement, a recap formula) as markdown:
 * the model sometimes forgets the $…$, so LaTeX without delimiters is wrapped; text with $ or plain words stay.
 */
export function asMath(s: string, display = false): string {
  const t = s.trim()
  if (!t || t.includes('$') || !LATEX.test(t)) return s
  return display ? `$$${t}$$` : `$${t}$`
}
