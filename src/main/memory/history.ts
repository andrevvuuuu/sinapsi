import type { ReviewLine } from '../../shared/memory-types'

import type { ReviewSession } from '../../shared/review-types'
export type { ReviewSession } from '../../shared/review-types'
const GAP = 30 * 60_000

/** Ripasso sittings, rebuilt from the review lines: reviews less than 30 minutes apart belong together. Pratica and Sessione are left out (only via absent or 'review'). */
export function reviewSessions(lines: ReviewLine[], names: Map<string, string>): ReviewSession[] {
  const own = lines.filter((l) => !l.via || l.via === 'review').sort((a, b) => a.at - b.at)
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
