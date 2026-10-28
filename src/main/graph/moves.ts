import { createHash } from 'node:crypto'
import type { GraphData } from '../../shared/graph-types'
import type { VaultIndex } from '../../shared/vault-types'

const hash = (t: string): string => createHash('sha256').update(t).digest('hex')

/**
 * Notes that left the vault index while another appeared: the same content (renamed) or the same
 * title in another folder (moved). Only notes that have concepts matter.
 */
export async function detectMoves(prev: VaultIndex, next: VaultIndex, extracted: GraphData['extracted'], read: (path: string) => Promise<string>): Promise<{ from: string; to: string }[]> {
  // Another vault is not a rename.
  if (prev.root !== next.root) return []
  const now = new Set(next.notes.map((n) => n.path))
  const before = new Set(prev.notes.map((n) => n.path))
  const gone = prev.notes.filter((n) => !now.has(n.path) && extracted[n.path])
  const added = next.notes.filter((n) => !before.has(n.path))
  if (!gone.length || !added.length) return []
  const hashes = new Map<string, string>()
  for (const a of added) hashes.set(a.path, hash(await read(a.path).catch(() => '')))
  const taken = new Set<string>()
  const out: { from: string; to: string }[] = []
  for (const g of gone) {
    const byContent = added.find((a) => !taken.has(a.path) && hashes.get(a.path) === extracted[g.path].hash)
    const sameTitle = added.filter((a) => !taken.has(a.path) && a.title === g.title)
    const hit = byContent ?? (sameTitle.length === 1 ? sameTitle[0] : undefined)
    if (!hit) continue
    taken.add(hit.path)
    out.push({ from: g.path, to: hit.path })
  }
  return out
}

/**
 * At startup: notes renamed while the app was closed. The "previous index" is rebuilt from the paths
 * the graph has extractions for that the vault no longer has.
 */
export async function detectOfflineMoves(index: VaultIndex, extracted: GraphData['extracted'], read: (path: string) => Promise<string>): Promise<{ from: string; to: string }[]> {
  const present = new Set(index.notes.map((n) => n.path))
  const gone = Object.keys(extracted).filter((p) => !present.has(p) && p.startsWith(index.root))
  if (!gone.length) return []
  const added = new Set(index.notes.filter((n) => !extracted[n.path]).map((n) => n.path))
  const prevNotes = [
    ...index.notes.filter((n) => !added.has(n.path)),
    ...gone.map((p) => ({ ...index.notes[0], path: p, title: p.split('/').pop()!.replace(/\.md$/, ''), folder: '' }))
  ]
  return detectMoves({ ...index, notes: prevNotes }, index, extracted, read)
}
