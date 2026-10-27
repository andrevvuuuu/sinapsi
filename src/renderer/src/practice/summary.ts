/** "3 concetti · 1 fonte · ~28 min": what is chosen and how long a training session on it takes. */
export function summary(concepts: number, sources: number, free = false): string {
  const parts: string[] = []
  if (concepts) parts.push(`${concepts} ${concepts === 1 ? 'concetto' : 'concetti'}`)
  if (sources) parts.push(`${sources} ${sources === 1 ? 'fonte' : 'fonti'}`)
  if (!parts.length && !free) return 'niente scelto'
  if (!parts.length) parts.push('argomento libero')
  return [...parts, `~${Math.max(10, concepts * 6 + sources * 10)} min`].join(' · ')
}

export const clampMinutes = (v: number): number => Math.min(300, Math.max(5, Math.round((Number.isFinite(v) ? v : 45) / 5) * 5))
