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

const SUB: Record<string, string> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎', a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ' }
const SUPS: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ', x: 'ˣ', y: 'ʸ', a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', k: 'ᵏ', m: 'ᵐ', t: 'ᵗ' }
/** Unicode sub- or superscript of a short text when every character has one; otherwise the text after a space. */
const script = (t: string, map: Record<string, string>): string => ([...t].every((c) => c in map) ? [...t].map((c) => map[c]).join('') : ` ${t}`)

/**
 * Model text as plain words, for an aria-label or an SVG label: no $, no LaTeX commands. Subscripts and
 * exponents become unicode (y_{\text{sec}} → «y sec», x^{2} → «x²», a_1 → «a₁») where unicode has them.
 */
export const plainText = (s: string): string =>
  s
    .replace(/\$/g, '')
    .replace(/\\(?:text|mathrm|mathbf|mathit|operatorname)\{([^}]*)\}/g, '$1')
    .replace(/_\{([^{}]*)\}|_([A-Za-z0-9])/g, (_m, a?: string, b?: string) => script(a ?? b ?? '', SUB))
    .replace(/\^\{([^{}]*)\}|\^(-?[A-Za-z0-9])/g, (_m, a?: string, b?: string) => script(a ?? b ?? '', SUPS))
    .replace(/\\([A-Za-z]+)/g, '$1')
    .replace(/[{}]/g, '')
    .trim()
