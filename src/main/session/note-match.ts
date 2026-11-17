import type { VaultIndex, VaultNote } from '../../shared/vault-types'

const STOP = new Set([
  'del',
  'dei',
  'della',
  'delle',
  'degli',
  'con',
  'per',
  'tra',
  'fra',
  'sui',
  'sul',
  'gli',
  'una',
  'uno',
  'che',
  'come'
])
const words = (s: string): string[] =>
  s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !STOP.has(w))

/** The vault note the topic is about: exact title/alias first, then most shared words; null if none. */
export function matchNote(index: VaultIndex, topic: string): VaultNote | null {
  return matchNotes(index, topic, 1)[0] ?? null
}

export function matchNotes(index: VaultIndex, topic: string, n = 3): VaultNote[] {
  const t = topic.trim().toLowerCase()
  const tw = words(topic)
  const ranked = index.notes
    .filter((note) => note.available)
    .map((note) => {
      const names = [note.title, ...note.aliases]
      let score = names.some((x) => x.toLowerCase() === t) ? Infinity : 0
      if (!score) {
        const nw = new Set(names.flatMap(words))
        score = tw.filter((w) => nw.has(w)).length
      }
      return { note, score }
    })
    .sort((a, b) => b.score - a.score || words(a.note.title).length - words(b.note.title).length)
  // One shared generic word ("teorema") is not a match: ask for most of the topic.
  const needed = tw.length >= 2 ? Math.max(2, Math.ceil(tw.length / 2)) : 1
  return ranked
    .filter((x) => x.score >= needed)
    .slice(0, Math.max(0, n))
    .map((x) => x.note)
}
