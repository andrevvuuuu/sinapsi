import { useContext, useRef, useState } from 'react'
import { clozeParts } from '../../../../shared/exercise-schema'
import { normalizeMath } from '../../../../shared/math-text'
import { useDictation } from '../../components/dictation'
import { DictationError, MicButton } from '../../components/MicButton'
import { MathSelect } from '../../components/MathSelect'
import type { LeafBlock } from '../../../../shared/nota-schema'
import { Inline, Md } from '../Md'
import { FadeContext, NotaContext, type Mode } from '../context'

/** "Prima prova tu": the answer stays covered until he has written his own attempt, or says honestly he has none. */
export function TryCover({
  prompt,
  children,
  label = 'Ho provato, mostra'
}: {
  prompt?: string
  children: React.ReactNode
  label?: string
}): React.JSX.Element {
  const { noteId } = useContext(NotaContext)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const field = useRef<HTMLTextAreaElement>(null)
  const dictation = useDictation({ target: field, value: text, onChange: setText, enabled: !open })
  const busy = dictation.state !== 'idle'
  const reveal = (skipped: boolean): void => {
    setOpen(true)
    // The attempt is kept: what he wrote before seeing the answer is the signal the reliance metrics read.
    if (noteId) void window.sinapsi?.notes.attempt({ noteId, prompt: prompt ?? '', text: skipped ? '' : text.trim(), skipped }).catch(() => undefined)
  }
  if (open)
    return (
      <div className="nv-try revealed">
        {text.trim() && (
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
        <b>Prima prova tu.</b> {prompt && <Inline md={prompt} />}
      </p>
      <div className="mic-field">
        <textarea
          ref={field}
          readOnly={busy}
          aria-label="La tua risposta"
          placeholder="Scrivi il passo come lo faresti all'esame…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <MicButton dictation={dictation} />
      </div>
      <DictationError dictation={dictation} />
      <div className="acts">
        <button type="button" className="btn" disabled={busy || !text.trim()} onClick={() => reveal(false)}>
          {label}
        </button>
        <button type="button" className="linkish" disabled={busy} onClick={() => reveal(true)}>
          Non lo so, mostra
        </button>
      </div>
    </div>
  )
}

/** "Prova da solo" turns itself on where he has already reviewed the section's concepts. */
const useMode = (mode: Mode): Mode => ((useContext(FadeContext)?.stage ?? 0) > 0 ? 'prova' : mode)

export function TryIt({
  block,
  mode: chosen
}: {
  block: Extract<LeafBlock, { type: 'tryit' }>
  mode: Mode
}): React.JSX.Element {
  const mode = useMode(chosen)
  if (mode === 'prova')
    return (
      <TryCover prompt={block.prompt}>
        <Md md={block.solution} />
      </TryCover>
    )
  return (
    <div className="nv-tryit">
      <p className="nv-kick">Prova tu</p>
      <Md md={block.prompt} />
      <Md md={block.solution} className="nv-solution" />
    </div>
  )
}

const LEVEL: Record<Extract<LeafBlock, { type: 'exercise' }>['level'], string> = {
  svolto: 'Svolto',
  completa: 'Da completare',
  solo: 'Da solo',
  esame: 'Esame'
}

export function Exercise({
  block,
  mode: chosen
}: {
  block: Extract<LeafBlock, { type: 'exercise' }>
  mode: Mode
}): React.JSX.Element {
  const mode = useMode(chosen)
  const steps = (
    <ol>
      {block.steps.map((s, i) => (
        <li key={i}>
          {block.level === 'completa' ? (
            <ChoiceStep md={s} />
          ) : (
            <Inline md={s} />
          )}
        </li>
      ))}
    </ol>
  )
  const covered = block.level === 'solo' || (block.level === 'esame' && mode === 'prova')
  return (
    <div className={'nv-ex ' + block.level}>
      <div className="h">
        <span className="lvl">{LEVEL[block.level]}</span>
        <Inline md={block.title} className="title" />
      </div>
      {covered ? (
        <TryCover
          prompt="Scrivi la tua soluzione, poi confrontala."
          label="Confronta con la soluzione"
        >
          {steps}
        </TryCover>
      ) : (
        steps
      )}
    </div>
  )
}

type Part = { text: string } | { options: string[]; correct: number }
/** Text and blanks in order, with the math balanced across them (clozeParts): no piece shows a raw $ or \frac. */
function parseChoices(md: string): Part[] {
  const { parts: texts, blanks } = clozeParts(md)
  const parts: Part[] = []
  texts.forEach((t, i) => {
    if (t) parts.push({ text: t })
    const b = blanks[i]
    if (b) parts.push({ options: b.math ? b.options : b.options.map(normalizeMath), correct: Math.max(0, b.correct) })
  })
  return parts
}

function ChoiceStep({ md }: { md: string }): React.JSX.Element {
  const parts = parseChoices(md)
  const [picked, setPicked] = useState<Record<number, number>>({})
  return (
    <span className="nv-choice">
      {parts.map((p, i) =>
        'text' in p ? (
          <Inline key={i} md={p.text} />
        ) : (
          <span key={i} className="sel">
            <MathSelect
              label="Scegli"
              options={p.options}
              value={picked[i] ?? null}
              onChange={(k) => setPicked({ ...picked, [i]: k })}
            />
            {picked[i] !== undefined && (
              <span className={'v ' + (picked[i] === p.correct ? 'ok' : 'no')}>
                {picked[i] === p.correct ? 'Giusto' : 'Rivedi questo passo'}
              </span>
            )}
          </span>
        )
      )}
    </span>
  )
}
