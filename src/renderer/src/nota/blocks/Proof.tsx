import { useEffect, useRef, useState } from 'react'
import type { LeafBlock } from '../../../../shared/nota-schema'
import { RichText } from '../../session/RichText'
import type { Mode } from '../context'
import { FigureView } from '../figure/FigureView'
import { TryCover } from './Practice'

type ProofBlock = Extract<LeafBlock, { type: 'proof' }>
export type Observe = (els: Element[], onActive: (i: number) => void) => () => void

/** Default: the step most in view (at least 60% visible) becomes the active one. */
const intersection: Observe = (els, onActive) => {
  if (typeof IntersectionObserver === 'undefined') return () => undefined
  const io = new IntersectionObserver(
    (entries) => {
      const best = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (best) onActive(els.indexOf(best.target))
    },
    { threshold: [0.6] }
  )
  els.forEach((el) => io.observe(el))
  return () => io.disconnect()
}

/** A proof read by scrolling: the sticky figure and the chain follow the step in view. */
export function Proof({ block, mode, observe = intersection }: { block: ProofBlock; mode: Mode; observe?: Observe }): React.JSX.Element {
  const [active, setActive] = useState(0)
  const refs = useRef<(HTMLElement | null)[]>([])
  useEffect(() => observe(refs.current.filter((x): x is HTMLElement => x !== null), (i) => i >= 0 && setActive(i)), [observe, block])
  const jump = (i: number): void => {
    setActive(i)
    refs.current[i]?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  }
  return (
    <div className={'nv-proof' + (block.figure ? ' with-fig' : '')}>
      <div className="steps">
        {block.steps.map((s, i) => (
          <article
            key={i}
            ref={(el) => {
              refs.current[i] = el
            }}
            className={'pstep' + (i === active ? ' on' : '')}
          >
            {s.kicker && <div className="nv-kick">{s.kicker}</div>}
            <h3>
              <RichText md={s.title} className="inline" />
            </h3>
            {mode === 'prova' && s.tryPrompt ? (
              <TryCover prompt={s.tryPrompt}>
                <RichText md={s.md} />
              </TryCover>
            ) : (
              <RichText md={s.md} />
            )}
          </article>
        ))}
      </div>
      <div className="stage">
        {block.figure && <FigureView fig={block.figure} step={active} />}
        <ol className="chain" aria-label="Catena della dimostrazione">
          {block.steps.map((s, i) => (
            <li key={i}>
              <button type="button" aria-current={i === active ? 'step' : undefined} onClick={() => jump(i)}>
                {s.title.replace(/\$/g, '')}
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
