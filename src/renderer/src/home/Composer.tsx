import { useEffect, useRef, useState } from 'react'
import type { ChipAction, Suggestions } from '../../../shared/api'
import { useDictation } from '../components/dictation'
import { DictationError, MicButton } from '../components/MicButton'
import { IconSend } from './icons'
import { GlassSurface } from '@glass-sdk/liquid-glass'
import { SceneBoundary, Seg } from '../components/glass'

const MODES = ['Apprendimento', 'Pratica', 'Ripasso'] as const
const KEY = { Apprendimento: 'learn', Pratica: 'practice', Ripasso: 'review' } as const

export function Composer({
  onSubmit,
  due = 0,
  suggestions,
  onPick
}: {
  onSubmit: (mode: string, text: string) => unknown
  due?: number
  suggestions?: Suggestions | null
  onPick?: (a: ChipAction) => unknown
}): React.JSX.Element {
  const [mode, setMode] = useState<(typeof MODES)[number]>('Apprendimento')
  const [text, setText] = useState('')
  // Ripasso works with no text: it reviews what is fading.
  // An Apprendimento topic is at most 500 characters (the session refuses longer ones).
  const tooLong = mode === 'Apprendimento' && text.trim().length > 500
  const field = useRef<HTMLTextAreaElement>(null)
  const dictation = useDictation({ target: field, value: text, onChange: setText })
  const busy = dictation.state !== 'idle'
  const canSend = !busy && !tooLong && (mode === 'Ripasso' || mode === 'Pratica' || !!text.trim())
  const send = (): void => {
    if (!canSend) return
    onSubmit(mode, text.trim())
    setText('')
  }
  // The graph keeps its zoom controls above the composer: tell the container how tall it is.
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = box.current
    const host = el?.parentElement
    if (!el || !host || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() =>
      host.style.setProperty('--composer-h', `${el.offsetHeight}px`)
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // What to do next, with the reason; they step aside while he types.
  const chips = text ? [] : (suggestions?.[KEY[mode]] ?? [])
  return (
    <div className="composer" ref={box}>
      {/* In the Home's scene (a scene of its own when mounted alone, as in the unit tests). */}
      <SceneBoundary>
        <Seg
          label="Tipo di sessione"
          className="seg modes-pill glass-text"
          value={mode}
          onChange={setMode}
          options={MODES.map((m) => ({
            value: m,
            label: (
              <>
                {m}
                {m === 'Ripasso' && due > 0 && <span className="due">{due}</span>}
              </>
            )
          }))}
        />
        {/* The shell's shadow, cast from outside it: the glass shell is clipped to its shape. */}
        <div className="shell-drop">
          <GlassSurface radius={26} className="shell">
            <div className="core">
              {chips.length > 0 && (
                <div className="suggest" role="group" aria-label="Consigliati">
                  {chips.map((c, i) => (
                    <button
                      key={`${i}:${c.label}`}
                      type="button"
                      className="sg-chip"
                      aria-label={`${c.label} — ${c.reason}`}
                      title={`${c.label} — ${c.reason}`}
                      onClick={() => onPick?.(c.action)}
                    >
                      <span className="sg-label">{c.label}</span>
                      <span className="sg-why">{c.reason}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="inrow">
                <div className="mic-field mic-fill mic-row">
                  <textarea
                    ref={field}
                    readOnly={busy}
                    rows={1}
                    aria-label="Cosa vuoi studiare?"
                    placeholder={
                      mode === 'Ripasso'
                        ? 'Cosa vuoi ripassare? Vuoto: quello che sta sbiadendo'
                        : mode === 'Pratica'
                          ? 'Su cosa ti alleni? Vuoto: i suggeriti per oggi'
                          : 'Cosa vuoi studiare?'
                    }
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        send()
                      }
                    }}
                  />
                  <MicButton dictation={dictation} />
                </div>
                <button
                  type="button"
                  className="send"
                  aria-label="Inizia"
                  disabled={!canSend}
                  onClick={send}
                >
                  <IconSend />
                </button>
              </div>
              <DictationError dictation={dictation} />
              {tooLong && (
                <p className="composer-hint" role="alert">
                  Argomento troppo lungo: massimo 500 caratteri (ne hai scritti {text.trim().length}).
                </p>
              )}
            </div>
          </GlassSurface>
        </div>
      </SceneBoundary>
    </div>
  )
}
