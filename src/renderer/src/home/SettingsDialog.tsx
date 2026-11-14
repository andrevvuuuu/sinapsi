import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_MODELS,
  MICRO_PAUSE_EVERY,
  MICRO_PAUSE_SECONDS,
  SESSION_BREAK_MINUTES,
  TASKS,
  type Settings,
  type Task
} from '../../../shared/settings-schema'
import { GlassSurface } from '@glass-sdk/liquid-glass'
import { GlassOverlay } from '../components/glass'
import { focusWhenShown } from '../components/glass-theme'
import { ThemeSwitch } from '../shell/ThemeSwitch'
import './settings.css'

/** The theme on screen: "system" resolves to whatever the window shows now. */
const shownTheme = (t: Settings['theme']): 'lavagna' | 'trattato' =>
  t !== 'system'
    ? t
    : typeof document !== 'undefined' && document.documentElement.dataset.theme === 'trattato'
      ? 'trattato'
      : 'lavagna'
const TASK_IT: Record<Task, string> = {
  extract: 'Estrazione dei concetti',
  note: 'Note vive',
  variants: 'Domande del Ripasso',
  teach: 'Tutor (Apprendimento e Pratica)',
  grade: 'Correzione compiti ed esami',
  photo: 'Trascrizione foto del foglio'
}
const clean = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    ''
  )

/** App settings: theme at once (the glass light switch); the rest on "Salva". */
export function SettingsDialog({
  settings,
  onTheme,
  onSaved,
  onClose
}: {
  settings: Settings
  onTheme: (t: Settings['theme']) => void
  onSaved: (s: Settings) => void
  onClose: () => void
}): React.JSX.Element {
  const [models, setModels] = useState<Record<Task, string>>({
    ...DEFAULT_MODELS,
    ...(settings.models ?? {})
  })
  const [apiKey, setApiKey] = useState('')
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const [keyVerifying, setKeyVerifying] = useState(false)
  const [keyStatus, setKeyStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string }>>([])
  const [bg, setBg] = useState(settings.backgroundExtraction)
  const [daily, setDaily] = useState(String(settings.dailyExtractionLimit))
  const [size, setSize] = useState(String(settings.reviewSessionSize))
  const [games, setGames] = useState(settings.gamesInSessions)
  const [pauses, setPauses] = useState(settings.microPauses ?? false)
  const [limit, setLimit] = useState(settings.sessionLimit ?? false)
  const [limitMin, setLimitMin] = useState(String(settings.sessionLimitMinutes ?? 50))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [vaultPath, setVaultPath] = useState(settings.vaultPath ?? '')
  const [savedVaultPath, setSavedVaultPath] = useState(settings.vaultPath ?? '')
  const [vaultStatus, setVaultStatus] = useState<string | null>(null)
  const [vaultError, setVaultError] = useState<string | null>(null)
  const [linkingVault, setLinkingVault] = useState(false)
  const first = useRef<HTMLButtonElement>(null)
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  }, [onClose])
  // Focus the dialog once when it opens, on the chosen theme (focus never selects); Esc closes it from anywhere inside.
  useEffect(() => {
    const unfocus = focusWhenShown(first.current)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        // Handled here: the graph must not also treat this Esc as "deselect".
        e.preventDefault()
        close.current()
      }
    }
    window.addEventListener('keydown', onKey)
    void window.sinapsi?.ai?.hasKey?.().then(setHasKey)
    void window.sinapsi?.ai
      ?.listModels?.()
      .then(setAvailableModels)
      .catch(() => undefined)
    return () => {
      unfocus()
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  const handleSaveKey = async (): Promise<void> => {
    if (!apiKey.trim()) return
    try {
      await window.sinapsi.ai.setKey(apiKey.trim())
      setHasKey(true)
      setApiKey('')
      setKeyStatus({ ok: true, text: 'Chiave salvata in modo sicuro nel portachiavi.' })
    } catch (e) {
      setKeyStatus({ ok: false, text: `Errore nel salvataggio: ${clean(e)}` })
    }
  }

  const handleVerifyKey = async (): Promise<void> => {
    setKeyVerifying(true)
    setKeyStatus(null)
    try {
      const res = await window.sinapsi.ai.verifyKey(apiKey.trim() || undefined)
      if (res.ok) {
        const parts = ['Chiave valida']
        if (res.label) parts.push(res.label)
        if (res.limit != null) parts.push(`limite: $${res.limit}`)
        if (res.usage != null) parts.push(`uso: $${res.usage.toFixed(2)}`)
        setKeyStatus({ ok: true, text: parts.join(' · ') })
      } else {
        setKeyStatus({ ok: false, text: res.error || 'Chiave non valida' })
      }
    } catch (e) {
      setKeyStatus({ ok: false, text: clean(e) })
    } finally {
      setKeyVerifying(false)
    }
  }

  const save = async (): Promise<void> => {
    if (!daily.trim()) return setError('Note al giorno: un numero da 0 a 50.')
    if (!size.trim()) return setError('Domande per Ripasso: un numero da 1 a 20.')
    const d = Number(daily)
    const n = Number(size)
    if (!Number.isInteger(d) || d < 0 || d > 50)
      return setError('Note al giorno: un numero da 0 a 50.')
    if (!Number.isInteger(n) || n < 1 || n > 20)
      return setError('Domande per Ripasso: un numero da 1 a 20.')
    const m = Number(limitMin)
    if (limit && (!limitMin.trim() || !Number.isInteger(m) || m < 10 || m > 180))
      return setError('Durata massima: un numero di minuti da 10 a 180.')
    try {
      onSaved(
        await window.sinapsi.settings.set({
          models,
          backgroundExtraction: bg,
          dailyExtractionLimit: d,
          reviewSessionSize: n,
          gamesInSessions: games,
          microPauses: pauses,
          sessionLimit: limit,
          ...(Number.isInteger(m) && m >= 10 && m <= 180 ? { sessionLimitMinutes: m } : {})
        })
      )
      setError(null)
      setSaved(true)
    } catch (e) {
      setError(clean(e))
    }
  }

  const chooseVault = async (): Promise<void> => {
    try {
      const next = await window.sinapsi.settings.chooseVault()
      setVaultPath(next.vaultPath ?? '')
      setSavedVaultPath(next.vaultPath ?? '')
      setVaultStatus(null)
      setVaultError(null)
      onSaved(next)
    } catch (e) {
      setVaultError(clean(e))
    }
  }

  const linkVault = async (): Promise<void> => {
    const path = vaultPath.trim()
    if (!path || path === savedVaultPath) return
    setLinkingVault(true)
    setVaultStatus(null)
    setVaultError(null)
    try {
      const next = await window.sinapsi.settings.set({ vaultPath: path })
      setSavedVaultPath(next.vaultPath ?? path)
      onSaved(next)
      const result = await window.sinapsi.vault.index()
      setVaultStatus('error' in result ? result.error === 'missing' ? 'Cartella non trovata' : 'Cartella non leggibile' : `Collegato: ${result.notes.length} note`)
    } catch (e) {
      setVaultError(clean(e))
    } finally {
      setLinkingVault(false)
    }
  }

  return (
    <GlassOverlay className="overlay" onClose={onClose}>
      <GlassSurface
        radius={24}
        className="settings-dlg glass-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="st-title"
        onKeyDown={(e) => {
          // Tab stays inside the dialog, on what Tab reaches: not the options of a segmented control that are not chosen (tabindex -1, reached with the arrows).
          if (e.key !== 'Tab') return
          const items = [
            ...e.currentTarget.querySelectorAll<HTMLElement>('button, input, select, textarea')
          ].filter((x) => !x.hasAttribute('disabled') && x.getAttribute('tabindex') !== '-1')
          if (!items.length) return
          const i = items.indexOf(document.activeElement as HTMLElement)
          const next = e.shiftKey
            ? i <= 0
              ? items.length - 1
              : i - 1
            : i === items.length - 1
              ? 0
              : i + 1
          e.preventDefault()
          items[next].focus()
        }}
      >
        <div className="sd-core dlg-core">
          <div className="sd-head">
            <div className="sd-head-title-group">
              <h2 id="st-title">Impostazioni</h2>
              <p className="sd-head-subtitle">Preferenze dell’applicazione, motori AI e ritmo di studio</p>
            </div>
            <button
              type="button"
              className="icon-btn"
              aria-label="Chiudi le impostazioni"
              onClick={onClose}
            >
              ×
            </button>
          </div>
          <div className="sd-body">
            {/* 1. Tema */}
            <section className="sd-card">
              <div className="sd-theme-head">
                <div className="sd-theme-info">
                  <h3 id="sd-theme-label">Tema</h3>
                  <p className="sd-hint">
                    {shownTheme(settings.theme) === 'trattato'
                      ? 'Trattato, chiaro'
                      : 'Lavagna, scuro'}
                  </p>
                </div>
                <ThemeSwitch
                  theme={shownTheme(settings.theme)}
                  onChange={onTheme}
                  buttonRef={first}
                  bare
                />
              </div>
            </section>

            {/* Vault Obsidian */}
            <section className="sd-card">
              <div className="sd-card-head">
                <h3>Vault Obsidian</h3>
              </div>
              <label className="sd-vault-label" htmlFor="sd-vault-path">Percorso del vault</label>
              <div className="sd-vault-row">
                <input id="sd-vault-path" className="sd-vault-path" type="text" value={vaultPath} onChange={(e) => { setVaultPath(e.target.value); setVaultStatus(null); setVaultError(null) }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void linkVault() } }} />
                <button type="button" className="btn" onClick={() => void chooseVault()}>Sfoglia…</button>
                <button type="button" className="btn pri" disabled={!vaultPath.trim() || vaultPath.trim() === savedVaultPath || linkingVault} onClick={() => void linkVault()}>{linkingVault ? 'Collego…' : 'Collega'}</button>
              </div>
              {vaultStatus && <p className="sd-vault-status" role="status">{vaultStatus}</p>}
              {vaultError && <p className="sd-error" role="alert">{vaultError}</p>}
            </section>

            {/* 2. OpenRouter */}
            <section className="sd-card">
              <div className="sd-card-head">
                <h3>OpenRouter</h3>
                <p className="sd-hint">
                  Chiave API e modelli utilizzati per ciascun compito di studio.
                </p>
              </div>

              <div className="sd-card-fields">
                <label className="sd-vault-label" htmlFor="sd-or-key">
                  Chiave API {hasKey ? '(configurata)' : '(mancante)'}
                </label>
                <div className="sd-key-row">
                  <input
                    id="sd-or-key"
                    className="sd-key-input"
                    type="password"
                    placeholder={hasKey ? '••••••••••••••••••••••••' : 'Incolla la chiave API...'}
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value)
                      setKeyStatus(null)
                    }}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    className="btn"
                    disabled={!apiKey.trim()}
                    onClick={() => void handleSaveKey()}
                  >
                    Salva chiave
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={keyVerifying || (!apiKey.trim() && !hasKey)}
                    onClick={() => void handleVerifyKey()}
                  >
                    {keyVerifying ? 'Verifico…' : 'Verifica chiave'}
                  </button>
                </div>
                {keyStatus && (
                  <p
                    className={`sd-key-status ${keyStatus.ok ? 'ok' : 'bad'}`}
                    role={keyStatus.ok ? 'status' : 'alert'}
                  >
                    {keyStatus.text}
                  </p>
                )}
              </div>

              <div className="sd-engines">
                <datalist id="or-models-list">
                  {availableModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </datalist>
                {TASKS.map((t) => (
                  <div key={t} className="sd-engine">
                    <span className="sd-engine-task">{TASK_IT[t]}</span>
                    <input
                      aria-label={`Modello · ${TASK_IT[t]}`}
                      list="or-models-list"
                      placeholder={DEFAULT_MODELS[t]}
                      value={models[t] ?? ''}
                      onChange={(e) => {
                        setModels({
                          ...models,
                          [t]: e.target.value
                        })
                        setSaved(false)
                      }}
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* 3. Estrazione in background */}
            <section className="sd-card">
              <div className="sd-card-head">
                <h3>Estrazione in background</h3>
                <p className="sd-hint">Analisi asincrona del tuo vault per indicizzare nuovi concetti.</p>
              </div>
              <div className="sd-card-fields">
                <label className="sd-toggle-row">
                  <span className="sd-toggle-copy">
                    <strong className="sd-toggle-title">Estrazione automatica</strong>
                    <span className="sd-toggle-desc">Estrai i concetti delle note quando il Mac è inattivo</span>
                  </span>
                  <input
                    type="checkbox"
                    className="sd-switch"
                    checked={bg}
                    onChange={(e) => (setBg(e.target.checked), setSaved(false))}
                  />
                </label>
                <label className="sd-input-row">
                  <span className="sd-input-label">Note al giorno</span>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={daily}
                    onChange={(e) => (setDaily(e.target.value), setSaved(false))}
                  />
                </label>
              </div>
            </section>

            {/* 4. Apprendimento */}
            <section className="sd-card">
              <div className="sd-card-head">
                <h3>Apprendimento</h3>
                <p className="sd-hint">Personalizzazione delle modalità didattiche e ludiche.</p>
              </div>
              <div className="sd-card-fields">
                <label className="sd-toggle-row">
                  <span className="sd-toggle-copy">
                    <strong className="sd-toggle-title">Giochi interattivi</strong>
                    <span className="sd-toggle-desc">
                      Giochi nelle sessioni (Lampo, Coppie, Ricomponi, Trova l’intruso, Tabù)
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    className="sd-switch"
                    checked={games}
                    onChange={(e) => (setGames(e.target.checked), setSaved(false))}
                  />
                </label>
              </div>
            </section>

            {/* 5. Ritmo di studio */}
            <section className="sd-card">
              <div className="sd-card-head">
                <h3>Ritmo di studio</h3>
                <p className="sd-hint">Facoltativi: valgono per Apprendimento, Ripasso e Pratica.</p>
              </div>
              <div className="sd-card-fields">
                <label className="sd-toggle-row">
                  <span className="sd-toggle-copy">
                    <strong className="sd-toggle-title">Micro-pause</strong>
                    <span className="sd-toggle-desc">
                      {MICRO_PAUSE_SECONDS} secondi di riposo ogni {MICRO_PAUSE_EVERY} minuti di studio
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    className="sd-switch"
                    checked={pauses}
                    onChange={(e) => (setPauses(e.target.checked), setSaved(false))}
                  />
                </label>
                <label className="sd-toggle-row">
                  <span className="sd-toggle-copy">
                    <strong className="sd-toggle-title">Limite di durata della sessione</strong>
                    <span className="sd-toggle-desc">{`Un avviso alla durata scelta, poi ${SESSION_BREAK_MINUTES} minuti di pausa`}</span>
                  </span>
                  <input
                    type="checkbox"
                    className="sd-switch"
                    checked={limit}
                    onChange={(e) => (setLimit(e.target.checked), setSaved(false))}
                  />
                </label>
                <div className={`sd-sub-row ${!limit ? 'is-disabled' : ''}`}>
                  <label className="sd-input-row">
                    <span className="sd-input-label">Durata massima (minuti)</span>
                    <input
                      type="number"
                      min={10}
                      max={180}
                      step={5}
                      disabled={!limit}
                      value={limitMin}
                      onChange={(e) => (setLimitMin(e.target.value), setSaved(false))}
                    />
                  </label>
                </div>
              </div>
            </section>

            {/* 6. Ripasso */}
            <section className="sd-card">
              <div className="sd-card-head">
                <h3>Ripasso</h3>
                <p className="sd-hint">Impostazioni per le sessioni FSRS di ripasso spaziato.</p>
              </div>
              <div className="sd-card-fields">
                <label className="sd-input-row">
                  <span className="sd-input-label">Domande per Ripasso</span>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={size}
                    onChange={(e) => (setSize(e.target.value), setSaved(false))}
                  />
                </label>
              </div>
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
      </GlassSurface>
    </GlassOverlay>
  )
}
