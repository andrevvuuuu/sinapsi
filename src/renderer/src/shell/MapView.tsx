import type { VaultIndex } from '../../../shared/vault-types'
import { GraphView } from '../graph/GraphView'

export function MapView({
  index,
  livePaths,
  onReview,
  onOpenNote,
  onStudy
}: {
  index: VaultIndex | null
  livePaths: string[]
  onReview: (ids: string[]) => void
  onOpenNote: (path: string) => void
  onStudy: (title: string) => void
}): React.JSX.Element {
  return (
    <section className="sh-map" aria-label="Mappa dei concetti">
      <header className="sh-map-header">
        <p className="sh-eyebrow">IL TUO VAULT</p>
        <h1>Mappa</h1>
      </header>
      {index ? (
        <GraphView
          index={index}
          livePaths={livePaths}
          onReview={onReview}
          onOpenNote={onOpenNote}
          onStudy={onStudy}
        />
      ) : (
        <p className="sh-empty">La mappa sarà disponibile quando il vault sarà caricato.</p>
      )}
    </section>
  )
}
