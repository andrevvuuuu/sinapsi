import type { ReviewLine } from '../../shared/memory-types'

/** Concepts with two correct, unsupported practice reviews on separate local calendar days. */
export function independentConcepts(lines: ReviewLine[]): Set<string> {
  const days = new Map<string, Set<string>>()
  for (const line of lines) {
    if (line.via !== 'practice' || line.correct !== true || line.rung !== 0) continue
    const date = new Date(line.at)
    const day = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
    const seen = days.get(line.conceptId) ?? new Set<string>()
    seen.add(day)
    days.set(line.conceptId, seen)
  }
  return new Set([...days].filter(([, seen]) => seen.size >= 2).map(([id]) => id))
}
