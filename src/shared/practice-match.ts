import type { Catalog } from './practice-types'

const norm = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
const FILLER = new Set(['tutto', 'tutta', 'tutti', 'tutte', 'gli', 'della', 'delle', 'degli', 'dei', 'del'])

/** Concepts whose name or note title contains every meaningful word of Andrea's text. */
export function matchConcepts(catalog: Catalog, text: string): string[] {
  const words = norm(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !FILLER.has(w))
  if (!words.length) return []
  const out: string[] = []
  for (const s of catalog.subjects)
    for (const n of s.notes)
      for (const c of n.concepts) {
        const hay = norm(`${c.name} ${n.title}`)
        if (words.every((w) => hay.includes(w))) out.push(c.id)
      }
  return out
}
