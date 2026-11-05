import { useEffect, useRef, useState } from 'react'
import { DEFAULT_ENGINES, TASKS, type Settings, type Task } from '../../../shared/settings-schema'

const THEMES: [Settings['theme'], string][] = [
  ['lavagna', 'Lavagna'],
  ['trattato', 'Trattato'],
  ['system', 'Sistema']
]
const TASK_IT: Record<Task, string> = {
  extract: 'Estrazione dei concetti',
  note: 'Note vive',
  variants: 'Domande del Ripasso',
  notebook: 'Notebook',
  teach: 'Tutor (Apprendimento e Pratica)',
  grade: 'Correzione e foto del foglio'
}
const clean = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

/** App settings: theme at once; engines, background extraction and Ripasso on "Salva". */
export function SettingsDialog({ settings, onTheme, onSaved, onClose }: { settings: Settings; onTheme: (t: Settings['theme']) => void; onSaved: (s: Settings) => void; onClose: () => void }): React.JSX.Element {
  const [engines, setEngines] = useState(settings.engines)
  const [bg, setBg] = useState(settings.backgroundExtraction)
  const [daily, setDaily] = useState(String(settings.dailyExtractionLimit))
  const [size, setSize] = useState(String(settings.reviewSessionSize))
  const [games, setGames] = useState(settings.gamesInSessions)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const first = useRef<HTMLButtonElement>(null)
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  }, [onClose])
  // Focus the dialog once when it opens; Esc closes it from anywhere inside.
  useEffect(() => {
    first.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        // Handled here: the graph must not also treat this Esc as "deselect".
        e.preventDefault()
        close.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const save = async (): Promise<void> => {
    if (!daily.trim()) return setError('Note al giorno: un numero da 0 a 50.')
    if (!size.trim()) return setError('Domande per Ripasso: un numero da 1 a 20.')
    const d = Number(daily)
    const n = Number(size)
    if (!Number.isInteger(d) || d < 0 || d > 50) return setError('Note al giorno: un numero da 0 a 50.')
    if (!Number.isInteger(n) || n < 1 || n > 20) return setError('Domande per Ripasso: un numero da 1 a 20.')
    try {
      onSaved(await window.sinapsi.settings.set({ engines, backgroundExtraction: bg, dailyExtractionLimit: d, reviewSessionSize: n, gamesInSessions: games }))
      setError(null)
      setSaved(true)
    } catch (e) {
      setError(clean(e))
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="settings-dlg glass glass-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="st-title"
        onKeyDown={(e) => {
          // Tab stays inside the dialog.
          if (e.key !== 'Tab') return
          const items = [...e.currentTarget.querySelectorAll<HTMLElement>('button, input, select, textarea')].filter((x) => !x.hasAttribute('disabled'))
          if (!items.length) return
          const i = items.indexOf(document.activeElement as HTMLElement)
          const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : i === items.length - 1 ? 0 : i + 1
          e.preventDefault()
          items[next].focus()
        }}
      >
        <div className="sd-core dlg-core">
          <div className="sd-head">
            <h2 id="st-title">Impostazioni</h2>
            <button type="button" className="icon-btn" aria-label="Chiudi le impostazioni" onClick={onClose}>
              ×
            </button>
          </div>
          <div className="sd-body">
            <section>
              <h3>Tema</h3>
              <div className="seg" role="group" aria-label="Tema">
                {THEMES.map(([id, label], i) => (
                  <button key={id} ref={i === 0 ? first : undefined} type="button" aria-pressed={settings.theme === id} onClick={() => onTheme(id)}>
                    {label}
                  </button>
                ))}
              </div>
            </section>
            <section>
              <h3>Motori AI</h3>
              <p className="sd-hint">Gemini (Antigravity) e Claude (Claude Code) con i tuoi abbonamenti. Il modello si può lasciare com’è.</p>
              <div className="sd-engines">
                {TASKS.map((t) => (
                  <div key={t} className="sd-engine">
                    <span>{TASK_IT[t]}</span>
                    <select
                      aria-label={`Motore · ${TASK_IT[t]}`}
                      value={engines[t].engine}
                      onChange={(e) => {
                        const engine = e.target.value as 'agy' | 'claude'
                        const model = DEFAULT_ENGINES[t].engine === engine ? DEFAULT_ENGINES[t].model : engine === 'claude' ? 'sonnet' : 'gemini-3.8-flash-medium'
                        setEngines({ ...engines, [t]: { engine, model } })
                        setSaved(false)
                      }}
                    >
                      <option value="agy">Gemini</option>
                      <option value="claude">Claude</option>
                    </select>
                    <input
                      aria-label={`Modello · ${TASK_IT[t]}`}
                      value={engines[t].model ?? ''}
                      onChange={(e) => {
                        setEngines({ ...engines, [t]: { ...engines[t], model: e.target.value || undefined } })
                        setSaved(false)
                      }}
                    />
                  </div>
                ))}
              </div>
            </section>
            <section>
              <h3>Estrazione in background</h3>
              <label className="sd-row">
                <input type="checkbox" checked={bg} onChange={(e) => (setBg(e.target.checked), setSaved(false))} />
                Estrai i concetti delle note quando il Mac è inattivo
              </label>
              <label className="sd-row">
                Note al giorno
                <input type="number" min={0} max={50} value={daily} onChange={(e) => (setDaily(e.target.value), setSaved(false))} />
              </label>
            </section>
            <section>
              <h3>Apprendimento</h3>
              <label className="sd-row">
                <input type="checkbox" checked={games} onChange={(e) => (setGames(e.target.checked), setSaved(false))} />
                Giochi nelle sessioni (Lampo, Coppie, Ricomponi, Trova l’intruso, Tabù)
              </label>
            </section>
            <section>
              <h3>Ripasso</h3>
              <label className="sd-row">
                Domande per Ripasso
                <input type="number" min={1} max={20} value={size} onChange={(e) => (setSize(e.target.value), setSaved(false))} />
              </label>
            </section>
          </div>
          <div className="sd-foot">
            {error && (
              <p className="sd-error" role="alert">
                {error}
              </p>
            )}
            {saved && !error && (
              <p className="sd-ok" role="status">
                Salvate.
              </p>
            )}
            <span className="sp" />
            <button type="button" className="btn pri" onClick={() => void save()}>
              Salva
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
