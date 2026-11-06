import { useRef, useState } from 'react'
import { DICTATION_SHORT, useDictation } from '../components/dictation'
import { DictationError, MicButton } from '../components/MicButton'
import type { Notebook } from '../../../shared/notebook-types'
import { KIND, statusText } from './status'

type Props = {
  notebook: Notebook
  excluded: Set<string>
  onToggle: (id: string) => void
  onView: (id: string) => void
  notes: { path: string; title: string }[]
  onMessage: (m: string) => void
}

export function SourceList({
  notebook,
  excluded,
  onToggle,
  onView,
  notes,
  onMessage
}: Props): React.JSX.Element {
  const api = window.sinapsi.notebook
  const [adding, setAdding] = useState<null | 'youtube' | 'vault'>(null)
  const [value, setValue] = useState('')
  const [over, setOver] = useState(false)
  const noteField = useRef<HTMLInputElement>(null)
  const noteMic = useDictation({
    target: noteField,
    value,
    onChange: setValue,
    maxSeconds: DICTATION_SHORT,
    enabled: adding === 'vault'
  })

  const report = (r: { rejected: string[] }): void => {
    if (r.rejected.length)
      onMessage(
        `Non posso importare: ${r.rejected.join(', ')}. Formati: PDF, PowerPoint (.pptx), testo e Markdown, audio e video.`
      )
  }
  const fail = (e: unknown): void =>
    onMessage(
      e instanceof Error
        ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
        : String(e)
    )
  const close = (): void => {
    setAdding(null)
    setValue('')
  }
  const matches =
    adding === 'vault' && value.trim()
      ? notes.filter((n) => n.title.toLowerCase().includes(value.trim().toLowerCase())).slice(0, 8)
      : []

  return (
    <section
      className={'nb-sources' + (over ? ' over' : '')}
      aria-labelledby="nb-src-h"
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean)
        if (paths.length) void api.addFiles(notebook.id, paths).then(report, fail)
      }}
    >
      <h2 id="nb-src-h" className="lab">
        Fonti
      </h2>
      <div className="nb-add">
        <button type="button" onClick={() => void api.chooseFiles(notebook.id).then(report, fail)}>
          File…
        </button>
        <button
          type="button"
          aria-expanded={adding === 'youtube'}
          onClick={() => (adding === 'youtube' ? close() : setAdding('youtube'))}
        >
          YouTube
        </button>
        <button
          type="button"
          aria-expanded={adding === 'vault'}
          onClick={() => (adding === 'vault' ? close() : setAdding('vault'))}
        >
          Nota del vault
        </button>
      </div>
      {adding === 'youtube' && (
        <form
          className="nb-inline"
          onSubmit={(e) => {
            e.preventDefault()
            if (!value.trim()) return
            void api.addYoutube(notebook.id, value.trim()).then(close, fail)
          }}
        >
          <input
            autoFocus
            aria-label="Link del video"
            placeholder="https://www.youtube.com/watch?v=…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button type="submit">Aggiungi</button>
        </form>
      )}
      {adding === 'vault' && (
        <div className="nb-inline col">
          <div className="mic-field">
            <input
              ref={noteField}
              readOnly={noteMic.state !== 'idle'}
              autoFocus
              aria-label="Cerca una nota"
              placeholder="Titolo della nota…"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <MicButton dictation={noteMic} size="sm" />
          </div>
          <DictationError dictation={noteMic} />
          {matches.map((n) => (
            <button
              key={n.path}
              type="button"
              className="nb-match"
              onClick={() => void api.addVault(notebook.id, n.path).then(close, fail)}
            >
              {n.title}
            </button>
          ))}
        </div>
      )}
      {notebook.sources.length === 0 ? (
        <p className="nb-empty">
          Trascina qui PDF, slide, registrazioni o video, oppure usa i pulsanti qui sopra.
        </p>
      ) : (
        <ul className="nb-list" aria-label="Fonti">
          {notebook.sources.map((s) => (
            <li key={s.id} className={'nb-src ' + s.status}>
              <label className="nb-hit">
                <input
                  type="checkbox"
                  aria-label={`Usa ${s.title}`}
                  disabled={s.status !== 'ready'}
                  checked={s.status === 'ready' && !excluded.has(s.id)}
                  onChange={() => onToggle(s.id)}
                />
              </label>
              <div className="nb-src-main">
                <button
                  type="button"
                  className="nb-src-title"
                  disabled={s.status !== 'ready'}
                  onClick={() => onView(s.id)}
                >
                  <span className="nb-kind">{KIND[s.kind]}</span>
                  {s.title}
                </button>
                <span className="nb-st">{statusText(s)}</span>
                {s.status === 'processing' && s.progress !== undefined && (
                  <span className="nb-bar" aria-hidden="true">
                    <i style={{ width: `${s.progress}%` }} />
                  </span>
                )}
              </div>
              <div className="nb-src-act">
                {s.kind === 'vault' && s.status === 'ready' && (
                  <button
                    type="button"
                    aria-label={`Aggiorna ${s.title}`}
                    title="Rileggi la nota da Obsidian"
                    onClick={() => void api.refreshSource(s.id).catch(fail)}
                  >
                    Aggiorna
                  </button>
                )}
                {s.status === 'failed' && (
                  <button
                    type="button"
                    aria-label={`Riprova ${s.title}`}
                    onClick={() => void api.retrySource(s.id).catch(fail)}
                  >
                    Riprova
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`Rimuovi ${s.title}`}
                  className="x"
                  onClick={() => {
                    if (window.confirm(`Rimuovere «${s.title}» dal notebook?`))
                      void api.removeSource(s.id).catch(fail)
                  }}
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
