import { IconPanel, IconUpload } from './icons'

export function NotebookPanel({ onClose }: { onClose: () => void }): React.JSX.Element {
  return (
    <aside className="right" aria-label="Notebook">
      <div className="ph drag">
        <button type="button" className="icon-btn nodrag" aria-label="Chiudi il pannello Notebook" onClick={onClose}>
          <IconPanel />
        </button>
        <button type="button" className="btn-imp nodrag" disabled title="Arriva nella fase 5">
          <IconUpload />
          Importa fonti
        </button>
      </div>
      <div className="rt">
        <h1>Notebook</h1>
        <p>Qui caricherai PDF, slide, registrazioni e video, e potrai fare domande sulle fonti.</p>
      </div>
      <p className="empty" style={{ padding: '4px 18px' }}>Nessun notebook ancora.</p>
    </aside>
  )
}
