import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useDictation } from '../../components/dictation'
import { DictationError, MicButton } from '../../components/MicButton'
import type { ExerciseState } from './shared'

/**
 * "Spiegalo tu": Andrea explains with the book closed, aloud or in writing. A recording is transcribed
 * (mlx_whisper) into the text box, where he can fix it before sending.
 */
export function Explain({
  locked,
  followUp,
  onChange
}: {
  locked: boolean
  /** Answering the picky student's question rather than giving the explanation. */
  followUp: boolean
  onChange: (s: ExerciseState) => void
}): React.JSX.Element {
  const [text, setText] = useState('')
  const field = useRef<HTMLTextAreaElement>(null)
  const textRef = useRef('')
  const busyRef = useRef(false)
  // While recording or transcribing the answer is not ready: what is being said is still missing.
  const update = (t: string): void => {
    textRef.current = t
    setText(t)
    onChange({ answer: t, correct: null, ready: !busyRef.current && t.trim() !== '' })
  }
  const dictation = useDictation({ target: field, value: text, onChange: update })
  const busy = dictation.state !== 'idle'
  const onChangeRef = useRef(onChange)
  useLayoutEffect(() => {
    onChangeRef.current = onChange
  })
  useEffect(() => {
    if (busyRef.current === busy) return
    busyRef.current = busy
    const t = textRef.current
    onChangeRef.current({ answer: t, correct: null, ready: !busy && t.trim() !== '' })
  }, [busy])

  return (
    <div className="rv-open rv-explain">
      <div className="rv-explain-head">
        <label className="lab" htmlFor="rv-explain">
          {followUp ? 'La tua risposta' : 'La tua spiegazione, a libro chiuso'}
        </label>
      </div>
      <div className="mic-field">
        <textarea
          id="rv-explain"
          ref={field}
          value={text}
          readOnly={locked || busy}
          placeholder={
            followUp
              ? 'Rispondi alla domanda: a voce o per iscritto.'
              : 'Come lo spiegheresti a un compagno: ipotesi, passaggi, perché. Se parli, puoi correggere la trascrizione prima di inviare.'
          }
          onChange={(e) => update(e.target.value)}
        />
        {!locked && <MicButton dictation={dictation} />}
      </div>
      <DictationError dictation={dictation} />
    </div>
  )
}
