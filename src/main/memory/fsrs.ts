import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type Grade as FsrsGrade } from 'ts-fsrs'
import { stateOf, type Grade, type Memory, type ReviewLine } from '../../shared/memory-types'

const scheduler = fsrs(generatorParameters({ enable_fuzz: false }))
const RATING: Record<Grade, FsrsGrade> = { 1: Rating.Again, 2: Rating.Hard, 3: Rating.Good, 4: Rating.Easy }

/** Replays one concept's reviews in time order: the card is never stored, always rebuilt. */
function replay(reviews: ReviewLine[]): Card {
  const sorted = [...reviews].sort((a, b) => a.at - b.at || a.grade - b.grade)
  let card = createEmptyCard(new Date(sorted[0]?.at ?? 0))
  for (const r of sorted) card = scheduler.next(card, new Date(r.at), RATING[r.grade]).card
  return card
}

export function memoryOf(reviews: ReviewLine[], now: number): Map<string, Memory> {
  const byConcept = new Map<string, ReviewLine[]>()
  for (const r of reviews) byConcept.set(r.conceptId, [...(byConcept.get(r.conceptId) ?? []), r])
  const out = new Map<string, Memory>()
  for (const [conceptId, rs] of byConcept) {
    const card = replay(rs)
    const last = [...rs].sort((a, b) => a.at - b.at).at(-1)!
    const R = scheduler.get_retrievability(card, new Date(now), false) as number
    out.set(conceptId, {
      conceptId,
      state: stateOf(R),
      R,
      due: card.due.getTime(),
      reps: card.reps,
      lapses: card.lapses,
      lastAt: last.at,
      misconception: last.correct === false && (last.confidence ?? 0) >= 70
    })
  }
  return out
}

/** What each grade would schedule now, in Italian ("10 min", "4 giorni"). */
export function previewIntervals(reviews: ReviewLine[], now: number): Record<Grade, string> {
  const card = reviews.length ? replay(reviews) : createEmptyCard(new Date(now))
  const rec = scheduler.repeat(card, new Date(now))
  const out = {} as Record<Grade, string>
  for (const g of [1, 2, 3, 4] as Grade[]) out[g] = formatInterval(rec[RATING[g]].card.due.getTime() - now)
  return out
}

export function formatInterval(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000))
  if (min < 60) return `${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return h === 1 ? '1 ora' : `${h} ore`
  const d = Math.round(h / 24)
  if (d < 60) return d === 1 ? '1 giorno' : `${d} giorni`
  const m = Math.round(d / 30)
  if (m < 24) return m === 1 ? '1 mese' : `${m} mesi`
  const y = Math.round(d / 365)
  return y === 1 ? '1 anno' : `${y} anni`
}
