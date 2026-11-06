import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/** Recording limits, in seconds: long answers, and short fields such as searches and names. */
export const DICTATION_LONG = 600
export const DICTATION_SHORT = 120

export type DictationStage = 'download' | 'load' | 'transcribe'
export type Dictation = {
  state: 'idle' | 'recording' | 'transcribing'
  seconds: number
  stage: DictationStage | null
  error: string | null
  toggle: () => void
}
type Field = HTMLTextAreaElement | HTMLInputElement

const remote = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    ''
  )

/** `said` in place of value[start, end), with a space on either side where the words would touch. */
export function insertAtCursor(
  value: string,
  said: string,
  start: number,
  end: number
): { value: string; caret: number } {
  const before = value.slice(0, start)
  const after = value.slice(end)
  const head = before && !/\s$/.test(before) ? `${before} ` : before
  const tail = after && !/^\s/.test(after) ? ` ${after}` : after
  return { value: head + said + tail, caret: head.length + said.length }
}

// Only one field records at a time; Option+Space acts on the focused field's dictation.
let recording: { stop: () => void } | null = null
const fields = new Set<{
  target: React.RefObject<Field | null>
  enabled: () => boolean
  toggle: () => void
}>()
/** Stops the recording in progress, if any: what was said is transcribed and lands in its field as usual. */
export function stopRecording(): void {
  recording?.stop()
}
function onKey(e: KeyboardEvent): void {
  if (!e.altKey || e.metaKey || e.ctrlKey || e.shiftKey || e.code !== 'Space' || e.repeat) return
  for (const f of fields)
    if (f.target.current && f.target.current === document.activeElement && f.enabled()) {
      e.preventDefault()
      f.toggle()
      return
    }
}

/**
 * Dictation into a text field: the microphone records, mlx_whisper transcribes locally, and the words
 * land at the cursor. Nothing is ever submitted: the field's owner reads `state !== 'idle'` to hold its send.
 */
export function useDictation(opts: {
  target: React.RefObject<Field | null>
  value: string
  onChange: (v: string) => void
  maxSeconds?: number
  /** False while the field cannot be edited (locked, disabled): the button and ⌥ Space do nothing. */
  enabled?: boolean
}): Dictation {
  const { target, value, maxSeconds = DICTATION_LONG, enabled = true } = opts
  const [state, setState] = useState<Dictation['state']>('idle')
  const [seconds, setSeconds] = useState(0)
  const [stage, setStage] = useState<DictationStage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const alive = useRef(true)
  const starting = useRef(false)
  const latest = useRef({ value, onChange: opts.onChange, enabled })
  const stageOff = useRef<(() => void) | null>(null)
  const caret = useRef<number | null>(null)
  const [me] = useState(() => ({ stop: () => recorder.current?.stop() }))

  async function start(): Promise<void> {
    const field = target.current
    if (field && (field.readOnly || field.disabled)) return
    setError(null)
    const md = navigator.mediaDevices
    if (!md?.getUserMedia || typeof MediaRecorder === 'undefined')
      return setError('Microfono non disponibile: scrivi il testo.')
    if (!(await window.sinapsi.voice.microphone().catch(() => false)))
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
    // Where the words go: the caret (or selection) when recording starts.
    const el = target.current
    const len = latest.current.value.length
    const from = Math.min(el?.selectionStart ?? len, len)
    const to = Math.min(el?.selectionEnd ?? from, len)
    const chunks: Blob[] = []
    let r: MediaRecorder
    try {
      r = new MediaRecorder(stream)
    } catch {
      // No recorder, no recording: the microphone must not stay on (the orange dot in the menu bar).
      stream.getTracks().forEach((t) => t.stop())
      return setError('Non riesco ad aprire il microfono.')
    }
    r.ondataavailable = (e) => void (e.data.size && chunks.push(e.data))
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      recorder.current = null
      if (recording === me) recording = null
      // Leaving the field stops the microphone; what was said is dropped, not transcribed.
      if (!alive.current) return
      setState('transcribing')
      setStage(null)
      const off = window.sinapsi.voice.onStage((s) => alive.current && setStage(s))
      stageOff.current = off
      void new Blob(chunks, { type: r.mimeType })
        .arrayBuffer()
        .then((b) => window.sinapsi.voice.transcribe(new Uint8Array(b)))
        .then(
          (said) => {
            if (!alive.current) return
            const now = latest.current.value
            const next = said.trim()
              ? insertAtCursor(
                  now,
                  said.trim(),
                  Math.min(from, now.length),
                  Math.min(to, now.length)
                )
              : null
            setState('idle')
            if (next) {
              caret.current = next.caret
              latest.current.onChange(next.value)
            }
          },
          (e) => {
            if (!alive.current) return
            setState('idle')
            setError(`Trascrizione non riuscita: ${remote(e)}. Puoi scrivere il testo.`)
          }
        )
        .finally(() => {
          off()
          if (stageOff.current === off) stageOff.current = null
          if (alive.current) setStage(null)
        })
    }
    try {
      r.start()
    } catch {
      stream.getTracks().forEach((t) => t.stop())
      return setError('Non riesco ad aprire il microfono.')
    }
    if (recording && recording !== me) recording.stop()
    recording = me
    recorder.current = r
    setSeconds(0)
    setState('recording')
  }

  const toggle = (): void => {
    if (recorder.current) return recorder.current.stop()
    if (!enabled || state !== 'idle' || starting.current) return
    starting.current = true
    void start().finally(() => (starting.current = false))
  }
  const toggleRef = useRef(toggle)
  // The latest props and toggle, for the recorder callbacks and the shortcut.
  useLayoutEffect(() => {
    latest.current = { value, onChange: opts.onChange, enabled }
    toggleRef.current = toggle
  })

  useEffect(() => {
    alive.current = true
    const entry = {
      target,
      enabled: () => latest.current.enabled,
      toggle: () => toggleRef.current()
    }
    if (fields.size === 0) window.addEventListener('keydown', onKey, true)
    fields.add(entry)
    return () => {
      alive.current = false
      fields.delete(entry)
      if (fields.size === 0) window.removeEventListener('keydown', onKey, true)
      if (recording === me) recording = null
      stageOff.current?.()
      stageOff.current = null
      const r = recorder.current
      if (r && r.state !== 'inactive') r.stop()
    }
  }, [target, me])
  useEffect(() => {
    if (state !== 'recording') return
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [state])
  useEffect(() => {
    if (state === 'recording' && seconds >= maxSeconds) recorder.current?.stop()
  }, [state, seconds, maxSeconds])
  // After an insertion the caret sits right after the dictated words.
  useEffect(() => {
    if (caret.current === null || !target.current) return
    target.current.setSelectionRange(caret.current, caret.current)
    caret.current = null
  }, [value, target])

  return { state, seconds, stage, error, toggle }
}
