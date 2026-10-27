import { useState } from 'react'
import type { LeafBlock } from '../../../../shared/nota-schema'
import { RichText } from '../../session/RichText'
import type { Mode } from '../context'

/** "Prima prova tu": the answer stays covered until he has written his own attempt. */
export function TryCover({ prompt, children, label = 'Ho provato, mostra' }: { prompt?: string; children: React.ReactNode; label?: string }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  if (open)
    return (
      <div className="nv-try revealed">
        {text && (
          <div className="mine">
            <span>Il tuo tentativo</span>
            <p>{text}</p>
          </div>
        )}
        {children}
      </div>
    )
  return (
    <div className="nv-try">
      <p>
        <b>Prima prova tu.</b> {prompt && <RichText md={prompt} className="inline" />}
      </p>
      <textarea aria-label="La tua risposta" placeholder="Scrivi il passo come lo faresti all'esame…" value={text} onChange={(e) => setText(e.target.value)} />
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        {label}
      </button>
    </div>
  )
}

export function TryIt({ block, mode }: { block: Extract<LeafBlock, { type: 'tryit' }>; mode: Mode }): React.JSX.Element {
  if (mode === 'prova')
    return (
      <TryCover prompt={block.prompt}>
        <RichText md={block.solution} />
      </TryCover>
    )
  return (
    <div className="nv-tryit">
      <p className="nv-kick">Prova tu</p>
      <RichText md={block.prompt} />
      <RichText md={block.solution} className="nv-solution" />
    </div>
  )
}

const LEVEL: Record<Extract<LeafBlock, { type: 'exercise' }>['level'], string> = { svolto: 'Svolto', completa: 'Da completare', solo: 'Da solo', esame: 'Esame' }

export function Exercise({ block, mode }: { block: Extract<LeafBlock, { type: 'exercise' }>; mode: Mode }): React.JSX.Element {
  const steps = (
    <ol>
      {block.steps.map((s, i) => (
        <li key={i}>{block.level === 'completa' ? <ChoiceStep md={s} /> : <RichText md={s} className="inline" />}</li>
      ))}
    </ol>
  )
  const covered = block.level === 'solo' || (block.level === 'esame' && mode === 'prova')
  return (
    <div className={'nv-ex ' + block.level}>
      <div className="h">
        <span className="lvl">{LEVEL[block.level]}</span>
        <RichText md={block.title} className="inline title" />
      </div>
      {covered ? (
        <TryCover prompt="Scrivi la tua soluzione, poi confrontala." label="Confronta con la soluzione">
          {steps}
        </TryCover>
      ) : (
        steps
      )}
    </div>
  )
}

type Part = { text: string } | { options: string[]; correct: number }
function parseChoices(md: string): Part[] {
  const parts: Part[] = []
  let last = 0
  for (const m of md.matchAll(/\{\{([^{}]+)\}\}/g)) {
    if (m.index! > last) parts.push({ text: md.slice(last, m.index) })
    const raw = m[1].split('|').map((s) => s.trim())
    const correct = raw.findIndex((s) => s.startsWith('*'))
    parts.push({ options: raw.map((s) => s.replace(/^\*/, '')), correct: Math.max(0, correct) })
    last = m.index! + m[0].length
  }
  if (last < md.length) parts.push({ text: md.slice(last) })
  return parts
}

function ChoiceStep({ md }: { md: string }): React.JSX.Element {
  const parts = parseChoices(md)
  const [picked, setPicked] = useState<Record<number, number>>({})
  return (
    <span className="nv-choice">
      {parts.map((p, i) =>
        'text' in p ? (
          <RichText key={i} md={p.text} className="inline" />
        ) : (
          <span key={i} className="sel">
            <select aria-label="Scegli" value={picked[i] ?? ''} onChange={(e) => setPicked({ ...picked, [i]: Number(e.target.value) })}>
              <option value="" disabled>
                …
              </option>
              {p.options.map((o, k) => (
                <option key={k} value={k}>
                  {o.replace(/\$/g, '')}
                </option>
              ))}
            </select>
            {picked[i] !== undefined && <span className={'v ' + (picked[i] === p.correct ? 'ok' : 'no')}>{picked[i] === p.correct ? 'Giusto' : 'Rivedi questo passo'}</span>}
          </span>
        )
      )}
    </span>
  )
}
