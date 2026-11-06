import { useContext, useState } from 'react'
import type { LeafBlock } from '../../../../shared/nota-schema'
import { Inline, Md } from '../Md'
import { NotaContext } from '../context'

const LETTERS = 'ABCDEF'

export function Quiz({ block }: { block: Extract<LeafBlock, { type: 'quiz' }> }): React.JSX.Element | null {
  const { layers } = useContext(NotaContext)
  const [tried, setTried] = useState<number[]>([])
  if (!layers.quiz) return null
  const last = tried[tried.length - 1]
  const solved = tried.includes(block.correct)
  return (
    <div className="bezel nv-quiz">
      <div className="core">
        <div className="lab">
          Quiz{block.fromNote && <small>dalla tua nota</small>}
        </div>
        <fieldset>
          <legend>
            <Md md={block.prompt} />
          </legend>
          {block.options.map((o, i) => (
            <button
              key={i}
              type="button"
              className="opt"
              data-state={tried.includes(i) ? (i === block.correct ? 'ok' : 'no') : undefined}
              disabled={solved || tried.includes(i)}
              onClick={() => setTried([...tried, i])}
            >
              <span className="k">{LETTERS[i]}</span>
              <Inline md={o} />
            </button>
          ))}
          <div role="status" className={'fb' + (last === undefined ? '' : last === block.correct ? ' ok' : ' no')}>
            {last !== undefined && <Inline md={block.why[last]} />}
          </div>
        </fieldset>
      </div>
    </div>
  )
}

export function Flashcard({ block }: { block: Extract<LeafBlock, { type: 'flashcard' }> }): React.JSX.Element | null {
  const { layers } = useContext(NotaContext)
  const [shown, setShown] = useState(false)
  const [grade, setGrade] = useState<'si' | 'no' | null>(null)
  if (!layers.quiz) return null
  return (
    <div className="nv-flash">
      <div className="q">
        <span className="tag">Flashcard</span>
        <Md md={block.q} />
      </div>
      {!shown ? (
        <button type="button" className="nv-chip" onClick={() => setShown(true)}>
          Mostra risposta
        </button>
      ) : (
        <div className="a">
          <Md md={block.a} />
          <div className="nv-row">
            <button type="button" className="nv-chip" aria-pressed={grade === 'si'} onClick={() => setGrade('si')}>
              Lo sapevo
            </button>
            <button type="button" className="nv-chip" aria-pressed={grade === 'no'} onClick={() => setGrade('no')}>
              Non lo sapevo
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
