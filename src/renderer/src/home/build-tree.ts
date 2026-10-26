import type { VaultNote } from '../../../shared/vault-types'

export type TreeNode = { name: string; path: string; children?: TreeNode[]; note?: VaultNote }

const byName = (a: TreeNode, b: TreeNode): number => a.name.localeCompare(b.name, 'it')

/** Folder tree for the explorer: folders first, then notes, Italian alphabetical order. */
export function buildTree(notes: VaultNote[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', children: [] }
  for (const note of notes) {
    let cur = root
    const parts = note.folder ? note.folder.split('/') : []
    parts.forEach((part, i) => {
      const path = parts.slice(0, i + 1).join('/')
      let next = cur.children!.find((c) => c.children && c.name === part)
      if (!next) cur.children!.push((next = { name: part, path, children: [] }))
      cur = next
    })
    cur.children!.push({ name: note.title, path: note.path, note })
  }
  const sort = (nodes: TreeNode[]): TreeNode[] => {
    const folders = nodes.filter((n) => n.children && n.children.length).map((n) => ({ ...n, children: sort(n.children!) })).sort(byName)
    return [...folders, ...nodes.filter((n) => !n.children).sort(byName)]
  }
  return sort(root.children!)
}
