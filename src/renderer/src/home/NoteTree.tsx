import type { TreeNode } from './build-tree'
import { IconChevron } from './icons'

export function NoteTree({ nodes, onOpen }: { nodes: TreeNode[]; onOpen: (path: string) => void }): React.JSX.Element {
  return (
    <div className="tree">
      {nodes.map((n) =>
        n.children ? (
          <details key={n.path}>
            <summary>
              <IconChevron />
              {n.name}
            </summary>
            <div className="kids">
              <NoteTree nodes={n.children} onOpen={onOpen} />
            </div>
          </details>
        ) : (
          <button
            key={n.path}
            type="button"
            className={'leaf' + (n.note?.available ? '' : ' off')}
            title={n.note?.available ? 'Apri in Obsidian' : 'Non ancora scaricata da iCloud'}
            onClick={() => onOpen(n.path)}
          >
            <span>{n.name}</span>
            {!n.note?.available && <small>iCloud</small>}
          </button>
        )
      )}
    </div>
  )
}
