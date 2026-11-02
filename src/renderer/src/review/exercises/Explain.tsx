import { useEffect, useRef, useState } from 'react'
import type { ExerciseState } from './shared'

const MAX_SECONDS = 10 * 60
const clock = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
const remote = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    ''
  )

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
  const api = window.sinapsi
  const [text, setText] = useState('')
  const [rec, setRec] = useState<'idle' | 'recording' | 'transcribing'>('idle')
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const alive = useRef(true)

  const textRef = useRef('')
  // While recording or transcribing the answer is not ready: what is being said is still missing.
  const update = (t: string, busy = false): void => {
    textRef.current = t
    setText(t)
    onChange({ answer: t, correct: null, ready: !busy && t.trim() !== '' })
  }

  // Leaving the item stops the microphone; what was said is dropped, not transcribed.
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      const r = recorder.current
      if (r && r.state !== 'inactive') r.stop()
    }
  }, [])
  useEffect(() => {
    if (rec !== 'recording') return
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [rec])
  useEffect(() => {
    if (rec === 'recording' && seconds >= MAX_SECONDS) recorder.current?.stop()
  }, [rec, seconds])

  async function start(): Promise<void> {
    setError(null)
    const md = navigator.mediaDevices
    if (!md?.getUserMedia || typeof MediaRecorder === 'undefined')
      return setError('Microfono non disponibile: scrivi la spiegazione.')
    if (!(await api.review.microphone().catch(() => false)))
      return setError(
        'Sinapsi non ha il permesso di usare il microfono (Impostazioni di Sistema → Privacy → Microfono).'
      )
    let stream: MediaStream
    try {
      stream = await md.getUserMedia({ audio: true })
    } catch {
      return setError('Non riesco ad aprire il microfono.')
    }
    if (!alive.current) return stream.getTracks().forEach((t) => t.stop())
    const chunks: Blob[] = []
    const r = new MediaRecorder(stream)
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      recorder.current = null
      if (!alive.current) return
      setRec('transcribing')
      void new Blob(chunks, { type: r.mimeType })
        .arrayBuffer()
        .then((b) => api.review.voice(new Uint8Array(b)))
        .then(
          (said) => {
            if (!alive.current) return
            const prev = textRef.current
            setRec('idle')
            update(prev.trim() ? `${prev.trimEnd()}\n${said}` : said)
          },
          (e) => {
            if (!alive.current) return
            setRec('idle')
            setError(`Trascrizione non riuscita: ${remote(e)}. Puoi scrivere la spiegazione.`)
            update(textRef.current)
          }
        )
    }
    recorder.current = r
    r.start()
    setSeconds(0)
    setRec('recording')
    update(textRef.current, true)
  }

  return (
    <div className="rv-open rv-explain">
      <div className="rv-explain-head">
        <label className="lab" htmlFor="rv-explain">
          {followUp ? 'La tua risposta' : 'La tua spiegazione, a libro chiuso'}
        </label>
        {!locked && (
          <button
            type="button"
            className={`ghost rv-mic${rec === 'recording' ? ' on' : ''}`}
            disabled={rec === 'transcribing'}
            aria-pressed={rec === 'recording'}
            onClick={() => (rec === 'recording' ? recorder.current?.stop() : void start())}
          >
            {rec === 'recording'
              ? `Ferma · ${clock(seconds)}`
              : rec === 'transcribing'
                ? 'Trascrivo…'
                : 'Parla'}
          </button>
        )}
      </div>
      <textarea
        id="rv-explain"
        value={text}
        readOnly={locked || rec !== 'idle'}
        placeholder={
          followUp
            ? 'Rispondi alla domanda: a voce o per iscritto.'
            : 'Come lo spiegheresti a un compagno: ipotesi, passaggi, perché. Se parli, puoi correggere la trascrizione prima di inviare.'
        }
        onChange={(e) => update(e.target.value)}
      />
      {error && (
        <p role="alert" className="rv-err">
          {error}
        </p>
      )}
    </div>
  )
}
