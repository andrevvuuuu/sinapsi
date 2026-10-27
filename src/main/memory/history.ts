import type { ReviewLine } from '../../shared/memory-types'

export type ReviewSession = { id: string; at: number; count: number; conceptIds: string[]; topic: string }
const GAP = 30 * 60_000

/** Ripasso sittings, rebuilt from the review lines: reviews less than 30 minutes apart belong together. Pratica is left out. */
export function reviewSessions(lines: ReviewLine[], names: Map<string, string>): ReviewSession[] {
  const own = lines.filter((l) => l.via !== 'practice').sort((a, b) => a.at - b.at)
  const groups: ReviewLine[][] = []
  for (const l of own) {
    const g = groups[groups.length - 1]
    if (g && l.at - g[g.length - 1].at <= GAP) g.push(l)
    else groups.push([l])
  }
  return groups
    .map((g) => {
      const conceptIds = [...new Set(g.map((l) => l.conceptId))]
      const shown = conceptIds.map((id) => names.get(id) ?? 'concetto rimosso')
      const topic = shown.slice(0, 3).join(', ') + (shown.length > 3 ? ` e altri ${shown.length - 3}` : '')
      return { id: `r${g[0].at}`, at: g[g.length - 1].at, count: g.length, conceptIds, topic }
    })
    .reverse()
}
