import { useMemo } from 'react'
import 'katex/dist/katex.min.css'
import { renderMd } from './render-md'

export function RichText({ md, className }: { md: string; className?: string }): React.JSX.Element {
  const html = useMemo(() => renderMd(md), [md])
  return <div className={'rich ' + (className ?? '')} dangerouslySetInnerHTML={{ __html: html }} />
}
