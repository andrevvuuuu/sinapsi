import { GlassContent } from '@glass-sdk/liquid-glass'
import { ViewScene } from '../components/glass'
import type { TreeNode } from './build-tree'
import { IconPanel } from './icons'
import { NoteTree } from './NoteTree'

type Props = {
  onClose: () => void
  tree?: TreeNode[]
  onOpenNote?: (path: string) => void
  vaultPath?: string
  onChooseVault?: () => void
}

/** Right panel: Obsidian notes by folder and vault folder. */
export function NotesPanel({
  onClose,
  tree = [],
  onOpenNote,
  vaultPath,
  onChooseVault
}: Props): React.JSX.Element {
  return (
    <aside className="right" aria-label="Note di Obsidian">
      <ViewScene className="aside-scene">
        <div className="ph drag">
          <button
            type="button"
            className="icon-btn nodrag"
            aria-label="Chiudi il pannello note"
            onClick={onClose}
          >
            <IconPanel />
          </button>
        </div>
        <GlassContent layout="flow" className="aside-body">
          <section className="psec scroll obs-sec" aria-label="Note di Obsidian">
            <h2>Note di Obsidian</h2>
            {tree.length ? (
              <NoteTree nodes={tree} onOpen={(path) => onOpenNote?.(path)} />
            ) : (
              <p className="empty">Nessuna nota letta dal vault.</p>
            )}
          </section>
          <div className="pf">
            <div className="row">
              <span className="vp" title={vaultPath}>
                {vaultPath ? `Vault: ${vaultPath.split('/').pop()}` : 'Vault non scelto'}
              </span>
              <button type="button" className="mini" onClick={onChooseVault}>
                Cambia cartella del vault
              </button>
            </div>
          </div>
        </GlassContent>
      </ViewScene>
    </aside>
  )
}
