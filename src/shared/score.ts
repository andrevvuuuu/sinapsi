import type { ChatItem } from '../main/session/events'

export type SessionScore = { points: number; streak: number; bestStreak: number; games: number; calibration: number | null }

/**
 * The light score of a learning session: 10 points for a right check (+5 when sure), 5 per point won in a game,
 * a streak of right checks and games (≥ 70%), and calibration = 100 − mean distance between confidence and outcome.
 */
export function sessionScore(items: ChatItem[]): SessionScore {
  let points = 0
  let streak = 0
  let bestStreak = 0
  let games = 0
  const gaps: number[] = []
  const hit = (ok: boolean): void => {
    streak = ok ? streak + 1 : 0
    bestStreak = Math.max(bestStreak, streak)
  }
  for (const it of items) {
    if (it.kind !== 'learner' || !it.answer || !it.question) continue
    const { question: q, answer: a } = it
    if (q.kind === 'game') {
      if (!a.game || !a.game.total) continue
      games++
      points += a.game.score * 5
      hit(a.game.score / a.game.total >= 0.7)
      continue
    }
    if (q.kind !== 'choice' || q.correct === undefined || q.role === 'goal' || q.role === 'plan') continue
    if (a.dontKnow) {
      if (q.role === 'check' || q.role === 'recall') hit(false)
      continue
    }
    if (a.choice === undefined) continue
    const right = a.choice === q.correct
    if (a.confidence !== undefined) gaps.push(Math.abs(a.confidence - (right ? 100 : 0)))
    // Probes and predictions are meant to be risked: they count for calibration, not for points or the streak.
    if (q.role !== 'check' && q.role !== 'recall') continue
    if (right) points += 10 + ((a.confidence ?? 0) >= 70 ? 5 : 0)
    hit(right)
  }
  const calibration = gaps.length ? Math.round(100 - gaps.reduce((x, y) => x + y, 0) / gaps.length) : null
  return { points, streak, bestStreak, games, calibration }
}
