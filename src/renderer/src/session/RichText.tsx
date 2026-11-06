import { useMemo } from 'react'
import 'katex/dist/katex.min.css'
import { renderMd, type RenderOptions } from './render-md'

/** Markdown + math. inline: a <span> with inline markdown only, for titles, options and labels. */
export function RichText({ md, className, inline, normalize }: { md: string; className?: string } & RenderOptions): React.JSX.Element {
  const html = useMemo(() => renderMd(md, { inline, normalize }), [md, inline, normalize])
  if (inline) return <span className={'rich inline ' + (className ?? '')} dangerouslySetInnerHTML={{ __html: html }} />
  return <div className={'rich ' + (className ?? '')} dangerouslySetInnerHTML={{ __html: html }} />
}
