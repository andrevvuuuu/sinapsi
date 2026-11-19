import type { ReviewLine } from './memory-types'

export type ProceduralLens = { independent: boolean; lastPracticeAt: number; lastOutcome: boolean }

/** derived lens, never scheduled, never written */
export function proceduralLens(lines: ReviewLine[]): Map<string, ProceduralLens> {
  const practiceLines = lines.filter(line => line.via === 'practice')

  const grouped = new Map<string, ReviewLine[]>()
  for (const line of practiceLines) {
    const id = line.conceptId
    if (!grouped.has(id)) {
      grouped.set(id, [])
    }
    grouped.get(id)!.push(line)
  }

  const result = new Map<string, ProceduralLens>()

  for (const [conceptId, group] of grouped) {
    let lastLine = group[0]
    let maxAt = group[0].at

    for (let i = 1; i < group.length; i++) {
      const line = group[i]
      if (line.at >= maxAt) {
        lastLine = line
        maxAt = line.at
      }
    }

    const lens: ProceduralLens = {
      independent: false,
      lastPracticeAt: lastLine.at,
      lastOutcome: lastLine.correct === true
    }

    const uniqueDays = new Set<string>()
    for (const line of group) {
      if (line.correct === true && line.rung === 0) {
        const d = new Date(line.at)
        const dayKey = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
        uniqueDays.add(dayKey)
      }
    }

    lens.independent = uniqueDays.size >= 2

    result.set(conceptId, lens)
  }

  return result
}
