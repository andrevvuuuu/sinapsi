import { useState } from 'react'
import { IconSend } from './icons'

const MODES = ['Apprendimento', 'Pratica', 'Ripasso'] as const

export function Composer({ onSubmit }: { onSubmit: (mode: string, text: string) => unknown }): React.JSX.Element {
  const [mode, setMode] = useState<(typeof MODES)[number]>('Apprendimento')
  const [text, setText] = useState('')
  const send = (): void => {
    if (!text.trim()) return
    onSubmit(mode, text.trim())
    setText('')
  }
  return (
    <div className="composer">
      <div className="shell">
        <div className="core">
          <div className="seg" role="group" aria-label="Tipo di sessione">
            {MODES.map((m) => (
              <button key={m} type="button" aria-pressed={m === mode} onClick={() => setMode(m)}>
                {m}
              </button>
            ))}
          </div>
          <div className="inrow">
            <textarea
              rows={1}
              aria-label="Cosa vuoi studiare?"
              placeholder="Cosa vuoi studiare?"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
            />
            <button type="button" className="send" aria-label="Inizia" disabled={!text.trim()} onClick={send}>
              <IconSend />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
