import type { MoveLine } from '../../shared/graph-types'

/** Resolve a note path through its recorded moves, in order, without looping on malformed cycles. */
export function resolvePath(path: string, moves: Pick<MoveLine, 'from' | 'to' | 'at'>[] = []): string {
  const ordered = [...moves].filter((move) => move.from !== move.to).sort((a, b) => a.at - b.at)
  const seen = new Set<string>([path])
  for (const move of ordered) {
    if (move.from !== path) continue
    if (seen.has(move.to)) break
    path = move.to
    seen.add(path)
  }
  return path
}
