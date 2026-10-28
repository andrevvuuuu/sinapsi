import { useState } from 'react'
import type { ChipAction, Suggestions } from '../../../shared/api'
import { IconSend } from './icons'

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
  const canSend = !tooLong && (mode === 'Ripasso' || mode === 'Pratica' || !!text.trim())
  const send = (): void => {
    if (!canSend) return
    onSubmit(mode, text.trim())
    setText('')
  }
  // What to do next, with the reason; they step aside while he types.
  const chips = text ? [] : (suggestions?.[KEY[mode]] ?? [])
  return (
    <div className="composer">
      <div className="seg modes-pill" role="group" aria-label="Tipo di sessione">
        {MODES.map((m) => (
          <button key={m} type="button" aria-pressed={m === mode} onClick={() => setMode(m)}>
            {m}
            {m === 'Ripasso' && due > 0 && <span className="due">{due}</span>}
          </button>
        ))}
      </div>
      <div className="shell">
        <div className="core">
          {chips.length > 0 && (
            <div className="suggest" role="group" aria-label="Consigliati">
              {chips.map((c) => (
                <button key={c.label} type="button" className="sg-chip" aria-label={`${c.label} — ${c.reason}`} title={`${c.label} — ${c.reason}`} onClick={() => onPick?.(c.action)}>
                  <span className="sg-label">{c.label}</span>
                  <span className="sg-why">{c.reason}</span>
                </button>
              ))}
            </div>
          )}
          <div className="inrow">
            <textarea
              rows={1}
              aria-label="Cosa vuoi studiare?"
              placeholder={mode === 'Ripasso' ? 'Cosa vuoi ripassare? Vuoto: quello che sta sbiadendo' : mode === 'Pratica' ? 'Su cosa ti alleni? Vuoto: i suggeriti per oggi' : 'Cosa vuoi studiare?'}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
            />
            <button type="button" className="send" aria-label="Inizia" disabled={!canSend} onClick={send}>
              <IconSend />
            </button>
          </div>
          {tooLong && (
            <p className="composer-hint" role="alert">
              Argomento troppo lungo: massimo 500 caratteri (ne hai scritti {text.trim().length}).
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
