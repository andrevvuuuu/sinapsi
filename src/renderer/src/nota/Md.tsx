import { lazy, Suspense } from 'react'
import { RichText } from '../session/RichText'
import { splitMermaid } from './math'

/** Loaded only when a nota contains a diagram: mermaid is large and most notes have none. */
const Mermaid = lazy(() => import('./blocks/Mermaid'))

/** A block of model text in a nota viva: markdown, typeset math (plain-text formulas included), diagrams. */
export function Md({ md, className }: { md: string; className?: string }): React.JSX.Element {
  if (!md.includes('```mermaid')) return <RichText md={md} className={className} normalize />
  return (
    <div className={className}>
      {splitMermaid(md).map((p, i) =>
        'md' in p ? (
          p.md.trim() && <RichText key={i} md={p.md} normalize />
        ) : (
          <Suspense key={i} fallback={<p className="nv-mmd-wait" role="status">Disegno il diagramma…</p>}>
            <Mermaid code={p.mermaid} />
          </Suspense>
        )
      )}
    </div>
  )
}

/** One line of model text (a title, a label, an option, an idea): inline markdown and typeset math. */
export function Inline({ md, className }: { md: string; className?: string }): React.JSX.Element {
  return <RichText md={md} className={className} inline normalize />
}
