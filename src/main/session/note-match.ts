import type { VaultIndex, VaultNote } from '../../shared/vault-types'

const STOP = new Set(['del', 'dei', 'della', 'delle', 'degli', 'con', 'per', 'tra', 'fra', 'sui', 'sul', 'gli', 'una', 'uno', 'che', 'come'])
const words = (s: string): string[] =>
  s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !STOP.has(w))

/** The vault note the topic is about: exact title/alias first, then most shared words; null if none. */
export function matchNote(index: VaultIndex, topic: string): VaultNote | null {
  const t = topic.trim().toLowerCase()
  const tw = words(topic)
  let best: VaultNote | null = null
  let bestScore = 0
  for (const note of index.notes) {
    if (!note.available) continue
    const names = [note.title, ...note.aliases]
    let score = names.some((x) => x.toLowerCase() === t) ? Infinity : 0
    if (!score) {
      const nw = new Set(names.flatMap(words))
      score = tw.filter((w) => nw.has(w)).length
    }
    const tieBreak = best && score === bestScore && words(note.title).length < words(best.title).length
    if (score > bestScore || tieBreak) {
      best = note
      bestScore = score
    }
  }
  // One shared generic word ("teorema") is not a match: ask for most of the topic.
  const needed = tw.length >= 2 ? Math.max(2, Math.ceil(tw.length / 2)) : 1
  return bestScore >= needed ? best : null
}
