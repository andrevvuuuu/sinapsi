import DOMPurify from 'dompurify'
import katex from 'katex'
import { marked } from 'marked'
import { INLINE_MATH, isFormula, normalizeMath } from '../../../shared/math-text'

export type RenderOptions = {
  /** One line of text (a title, an option, a label): inline markdown only, no paragraphs. */
  inline?: boolean
  /** Model text from a nota viva: plain-text formulas are wrapped in $…$ first (shared/math-text.ts). */
  normalize?: boolean
}

/**
 * Markdown + math → safe HTML. Math is rendered first and swapped for placeholders,
 * so markdown never touches it; the result is sanitized before it reaches the page.
 */
export function renderMd(md: string, opts: RenderOptions = {}): string {
  const math: string[] = []
  const keep = (tex: string, display: boolean): string => {
    // MathML beside the HTML: screen readers read the formula, not its markup.
    math.push(katex.renderToString(tex, { displayMode: display, throwOnError: false, output: 'htmlAndMathml' }))
    return `@@MATH${math.length - 1}@@`
  }
  const withSlots = (opts.normalize ? normalizeMath(md) : md)
    .replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => keep(tex.trim(), true))
    // Inline math: shared with the normalizer (INLINE_MATH); "costa $5 e $10" is money, "$\\frac12$5" a formula.
    .replace(new RegExp(INLINE_MATH, 'g'), (m, tex: string, digit?: string) => (isFormula(tex, digit) ? keep(tex.trim(), false) : m))
  const parsed = opts.inline ? marked.parseInline(withSlots, { async: false, gfm: true, breaks: false }) : marked.parse(withSlots, { async: false, gfm: true, breaks: false })
  const html = (parsed as string).replace(/@@MATH(\d+)@@/g, (_m, i: string) => math[Number(i)])
  return DOMPurify.sanitize(html, { ADD_TAGS: ['semantics', 'annotation'], ADD_ATTR: ['encoding', 'aria-hidden'] })
}
