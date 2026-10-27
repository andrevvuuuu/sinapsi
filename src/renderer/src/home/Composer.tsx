import { useState } from 'react'
import { IconSend } from './icons'

const MODES = ['Apprendimento', 'Pratica', 'Ripasso'] as const

export function Composer({ onSubmit, due = 0 }: { onSubmit: (mode: string, text: string) => unknown; due?: number }): React.JSX.Element {
  const [mode, setMode] = useState<(typeof MODES)[number]>('Apprendimento')
  const [text, setText] = useState('')
  // Ripasso works with no text: it reviews what is fading.
  const canSend = mode === 'Ripasso' || mode === 'Pratica' || !!text.trim()
  const send = (): void => {
    if (!canSend) return
    onSubmit(mode, text.trim())
    setText('')
  }
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
        </div>
      </div>
    </div>
  )
}
