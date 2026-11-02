import { useContext, useEffect, useRef, useState } from 'react'
import type { LeafBlock } from '../../../../shared/nota-schema'
import { RichText } from '../../session/RichText'
import { FadeContext, type Mode } from '../context'
import { hiddenSteps } from '../fading'
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
  const fade = useContext(FadeContext)
  const [full, setFull] = useState(false)
  const hidden = full || !fade ? 0 : hiddenSteps(fade.stage, block.steps.length)
  const first = block.steps.length - hidden
  const jump = (i: number): void => {
    setActive(i)
    refs.current[i]?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  }
  return (
    <div className={'nv-proof' + (block.figure ? ' with-fig' : '')}>
      <div className="steps">
        {hidden > 0 && fade && (
          <p className="nv-fade">
            {hidden === block.steps.length ? 'La dimostrazione è nascosta' : hidden === 1 ? "L'ultimo passo è nascosto" : `Gli ultimi ${hidden} passi sono nascosti`}: {fadeReason(fade.names)} Prova a {hidden === 1 ? 'ricostruirlo' : 'ricostruirli'} da solo, poi scopri ogni passo.{' '}
            <button type="button" className="link" onClick={() => setFull(true)}>
              Mostra tutta la dimostrazione
            </button>
          </p>
        )}
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
            {i >= first ? (
              <TryCover prompt={s.tryPrompt ?? 'Ricostruisci questo passo.'} label="Scopri il passo">
                <RichText md={s.md} />
              </TryCover>
            ) : mode === 'prova' && s.tryPrompt ? (
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

/** Why the steps are covered: the concepts he has already reviewed. */
function fadeReason(names: string[]): string {
  const shown = names.slice(0, 3).map((n) => `«${n}»`)
  const list = shown.length > 1 ? `${shown.slice(0, -1).join(', ')} e ${shown.at(-1)}` : shown[0]
  return `${list}${names.length > 3 ? ` e altri ${names.length - 3}` : ''} ${names.length === 1 ? "l'hai" : 'li hai'} già ripassat${names.length === 1 ? 'o' : 'i'}.`
}
