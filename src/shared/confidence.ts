import type { ReviewLine } from './memory-types'

export type CalibrationStat = { n: number; meanConfidence: number; accuracy: number; gap: number }
export type ConfidenceCalibration = { overall: CalibrationStat; groups: ({ key: string } & CalibrationStat)[]; confidentErrors: { conceptId: string; at: number; confidence: number }[] }

function stat(lines: ReviewLine[]): CalibrationStat {
  const n = lines.length
  if (!n) return { n: 0, meanConfidence: 0, accuracy: 0, gap: 0 }
  const meanConfidence = lines.reduce((s, r) => s + r.confidence!, 0) / n
  const accuracy = lines.reduce((s, r) => s + Number(r.correct ?? r.grade >= 3), 0) * 100 / n
  return { n, meanConfidence, accuracy, gap: meanConfidence - accuracy }
}

export function confidenceCalibration(lines: ReviewLine[], groupOf?: (conceptId: string) => string | null): ConfidenceCalibration {
  const usable = lines.filter((r) => r.confidence !== undefined)
  const buckets = new Map<string, ReviewLine[]>()
  for (const r of usable) {
    const key = groupOf?.(r.conceptId)
    if (!key) continue
    const group = buckets.get(key) ?? []
    group.push(r)
    buckets.set(key, group)
  }
  return {
    overall: stat(usable),
    groups: [...buckets].map(([key, rows]) => ({ key, ...stat(rows) })).filter((g) => g.n >= 5).sort((a, b) => a.key.localeCompare(b.key)),
    confidentErrors: usable.filter((r) => !(r.correct ?? r.grade >= 3) && r.confidence! >= 70).sort((a, b) => b.at - a.at).slice(0, 20).map((r) => ({ conceptId: r.conceptId, at: r.at, confidence: r.confidence! }))
  }
}

export function confidenceLine(s: CalibrationStat): string {
  if (!s.n) return 'Ancora nessuna risposta con la confidenza indicata.'
  const c = Math.round(s.meanConfidence), a = Math.round(s.accuracy)
  if (Math.abs(s.gap) < 10) return `Ben calibrato: confidenza media ${c}%, risposte giuste ${a}%.`
  if (s.gap > 0) return `Sei più sicuro di quanto rendi: confidenza media ${c}%, risposte giuste ${a}%.`
  return `Sai più di quanto pensi: confidenza media ${c}%, risposte giuste ${a}%.`
}
