import { useEffect, useRef, useState } from 'react'
import type { Excerpt, Source, SourceText } from '../../../shared/notebook-types'

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The segment text with the cited excerpt marked; whitespace may differ, words may not. */
function marked(text: string, excerpt?: string): React.ReactNode {
  if (!excerpt) return text
  const words = excerpt.trim().split(/\s+/).map(esc)
  if (!words.length) return text
  const m = new RegExp(words.join('\\s+')).exec(text)
  if (!m) return text
  return (
    <>
      {text.slice(0, m.index)}
      <mark>{m[0]}</mark>
      {text.slice(m.index + m[0].length)}
    </>
  )
}

const ytLink = (url: string, start: number): string => {
  const id = /(?:v=|youtu\.be\/|shorts\/|live\/|embed\/)([\w-]{11})/.exec(url)?.[1]
  return `https://www.youtube.com/watch?v=${id}&t=${Math.floor(start)}s`
}

export function SourceViewer({ source, excerpt, onClose }: { source: Source; excerpt: Excerpt | null; onClose: () => void }): React.JSX.Element {
  const api = window.sinapsi
  const [text, setText] = useState<SourceText | null | undefined>(undefined)
  const focus = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let live = true
    void api.notebook.text(source.id).then((t) => live && setText(t), () => live && setText(null))
    return () => {
      live = false
    }
  }, [api, source.id])
  useEffect(() => {
    focus.current?.scrollIntoView({ block: 'center' })
  }, [text, excerpt])

  const target = excerpt && text ? text.segments.findIndex((s) => s.label === excerpt.label && marked(s.text, excerpt.text) !== s.text) : -1
  return (
    <aside className="nb-viewer" role="complementary" aria-label={source.title}>
      <header>
        <div>
          <span className="lab">Fonte</span>
          <h2>{source.title}</h2>
        </div>
        <button type="button" className="x" aria-label="Chiudi la fonte" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="nb-viewer-act">
        {(source.kind === 'pdf' || source.kind === 'slides' || source.kind === 'audio' || source.kind === 'text') && (
          <button type="button" onClick={() => void api.notebook.openFile(source.id)}>
            Apri il file
          </button>
        )}
        {source.kind === 'youtube' && (
          <button type="button" onClick={() => void api.app.openExternal(ytLink(source.origin, excerpt?.start ?? 0))}>
            {excerpt?.start !== undefined ? `Apri il video a ${excerpt.label}` : 'Apri il video'}
          </button>
        )}
      </div>
      {excerpt && target < 0 && (
        <blockquote className="nb-quote">
          <span className="lab">{excerpt.label}</span>
          {excerpt.text}
        </blockquote>
      )}
      <div className="nb-viewer-body">
        {text === undefined && <p className="nb-empty">Carico…</p>}
        {text === null && <p className="nb-empty">Testo non disponibile.</p>}
        {text?.segments.map((s, i) => (
          <div key={i} ref={i === target ? focus : undefined} className={'nb-seg' + (i === target ? ' on' : '')}>
            <span className="lab">{s.label}</span>
            <p>{i === target ? marked(s.text, excerpt!.text) : s.text}</p>
          </div>
        ))}
      </div>
    </aside>
  )
}
