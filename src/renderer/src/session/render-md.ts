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
    math.push(katex.renderToString(tex, { displayMode: display, throwOnError: false, output: 'html' }))
    return `@@MATH${math.length - 1}@@`
  }
  const withSlots = md
    .replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => keep(tex.trim(), true))
    .replace(/(^|[^\\$])\$([^$\n]+?)\$/g, (_m, pre: string, tex: string) => pre + keep(tex, false))
  const html = (marked.parse(withSlots, { async: false, gfm: true, breaks: false }) as string).replace(/@@MATH(\d+)@@/g, (_m, i: string) => math[Number(i)])
  return DOMPurify.sanitize(html, { ADD_TAGS: ['semantics', 'annotation'], ADD_ATTR: ['encoding', 'aria-hidden'] })
}
