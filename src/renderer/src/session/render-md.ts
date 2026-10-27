import DOMPurify from 'dompurify'
import katex from 'katex'
import { marked } from 'marked'

/**
 * Markdown + math → safe HTML. Math is rendered first and swapped for placeholders,
 * so markdown never touches it; the result is sanitized before it reaches the page.
 */
export function renderMd(md: string): string {
  const math: string[] = []
  const keep = (tex: string, display: boolean): string => {
    // MathML beside the HTML: screen readers read the formula, not its markup.
    math.push(katex.renderToString(tex, { displayMode: display, throwOnError: false, output: 'htmlAndMathml' }))
    return `@@MATH${math.length - 1}@@`
  }
  const withSlots = md
    .replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => keep(tex.trim(), true))
    // Inline math opens before a non-space and closes after one, never right before a digit: "costa $5 e $10" is money.
    .replace(/(^|[^\\$])\$(?=\S)([^$\n]+?)(?<=\S)\$(?!\d)/g, (_m, pre: string, tex: string) => pre + keep(tex, false))
  const html = (marked.parse(withSlots, { async: false, gfm: true, breaks: false }) as string).replace(/@@MATH(\d+)@@/g, (_m, i: string) => math[Number(i)])
  return DOMPurify.sanitize(html, { ADD_TAGS: ['semantics', 'annotation'], ADD_ATTR: ['encoding', 'aria-hidden'] })
}
