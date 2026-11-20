import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade as FsrsGrade } from 'ts-fsrs'
import { MISCONCEPTION_CONFIDENCE, stateOf, type Grade, type Memory, type ReviewLine } from '../../shared/memory-types'
import { proceduralLens } from '../../shared/procedural'

const scheduler = fsrs(generatorParameters({ enable_fuzz: true }))
const sessionScheduler = fsrs(generatorParameters({ enable_fuzz: true, learning_steps: [], relearning_steps: [] }))
const RATING: Record<Grade, FsrsGrade> = { 1: Rating.Again, 2: Rating.Hard, 3: Rating.Good, 4: Rating.Easy }

const FOUR_HOURS = 4 * 3_600_000
const localOffsetMs = (at: number): number => -new Date(at).getTimezoneOffset() * 60_000

/**
 * Trasla un timestamp reale nel dominio dell'orologio di studio locale con rollover alle 04:00.
 * In questo dominio, la data UTC corrisponde alla data di studio locale con cambio giorno alle 4:00.
 */
export const studyClock = (at: number): number => at + localOffsetMs(at) - FOUR_HOURS

/**
 * Inverso di studyClock: riporta un timestamp dal dominio dell'orologio di studio al tempo reale.
 */
export function realClock(shifted: number): number {
  let t = shifted + FOUR_HOURS - localOffsetMs(shifted)
  for (let i = 0; i < 4; i++) {
    const err = studyClock(t) - shifted
    if (err === 0) break
    t -= err
  }
  return t
}

/**
 * Giorno di studio locale (YYYY-MM-DD) con cambio giorno alle ore 04:00.
 */
export function studyDay(at: number): string {
  return new Date(studyClock(at)).toISOString().slice(0, 10)
}

/**
 * Filtro di training FSRS (Contratto per futuro ottimizzatore).
 *
 * Restituisce esattamente le righe che il replay applica applicando le regole 1–2:
 * 1. Giorno di studio locale con rollover alle 04:00 (studyDay).
 * 2. Regola same-day: per concetto e studyDay, la prima riga si applica normalmente;
 *    le successive dello stesso giorno si applicano SOLO se grade === 1 (Again),
 *    al massimo un Again in più per giorno. Le altre righe vengono ignorate dal replay.
 *
 * replay() usa questa stessa funzione come unica fonte di verità.
 */
export function trainingLines(reviews: ReviewLine[]): ReviewLine[] {
  const sorted = [...reviews].sort((a, b) => a.at - b.at || a.grade - b.grade)
  const conceptDayState = new Map<string, { extraAgainApplied: boolean }>()
  const applied: ReviewLine[] = []

  for (const r of sorted) {
    const key = `${r.conceptId}::${studyDay(r.at)}`
    const state = conceptDayState.get(key)
    if (!state) {
      conceptDayState.set(key, { extraAgainApplied: false })
      applied.push(r)
    } else if (r.grade === 1 && !state.extraAgainApplied) {
      state.extraAgainApplied = true
      applied.push(r)
    }
  }

  return applied
}

/** Replays one concept's reviews in time order: the card is never stored, always rebuilt. */
function replay(reviews: ReviewLine[]): Card {
  return replayApplied(trainingLines(reviews))
}

/** The scheduler loop alone, on lines trainingLines already filtered and sorted. */
function replayApplied(applied: ReviewLine[]): Card {
  if (!applied.length) return createEmptyCard(new Date(0))
  let card = createEmptyCard(new Date(studyClock(applied[0].at)))
  for (const r of applied) {
    card = (r.via === 'session' ? sessionScheduler : scheduler).next(
      card,
      new Date(studyClock(r.at)),
      RATING[r.grade]
    ).card
  }
  return card
}

export function memoryOf(reviews: ReviewLine[], now: number, activeWeaknessConcepts?: Set<string>): Map<string, Memory> {
  const proceduralByConcept = proceduralLens(reviews)
  const byConcept = new Map<string, ReviewLine[]>()
  for (const r of reviews) {
    const list = byConcept.get(r.conceptId)
    if (list) list.push(r)
    else byConcept.set(r.conceptId, [r])
  }
  const out = new Map<string, Memory>()
  for (const [conceptId, rs] of byConcept) {
    const sorted = rs.sort((a, b) => a.at - b.at || a.grade - b.grade)
    const applied = trainingLines(sorted)
    const card = replayApplied(applied)
    const last = applied.at(-1)!
    const lastRaw = sorted.at(-1)!
    const R = displayedR(card, last.grade, now)
    let due = card.due ? realClock(card.due.getTime()) : null
    // Tetto di prima scadenza: se tutte le righe del concetto applicate sono via: 'session' e sono esattamente 1, due <= at + 24h
    if (due !== null && applied.length === 1 && applied[0].via === 'session') {
      due = Math.min(due, applied[0].at + 24 * 3_600_000)
    }
    const weakness = !!activeWeaknessConcepts?.has(conceptId)
    const misconception =
      last.misconception === true ||
      lastRaw.misconception === true ||
      (last.correct === false && (last.confidence ?? 0) >= MISCONCEPTION_CONFIDENCE) ||
      (lastRaw.correct === false && (lastRaw.confidence ?? 0) >= MISCONCEPTION_CONFIDENCE) ||
      weakness

    out.set(conceptId, {
      conceptId,
      state: stateOf(R),
      R,
      due,
      reps: card.reps,
      lapses: card.lapses,
      lastAt: last.at,
      misconception,
      stability: card.stability,
      lastGrade: last.grade,
      ...(proceduralByConcept.has(conceptId) ? { procedural: proceduralByConcept.get(conceptId)! } : {})
    })
  }
  return out
}

const DAY = 86_400_000
// FSRS-6 forgetting curve, with fractional days (ts-fsrs rounds elapsed time to whole days,
// which kept R at 100% for the whole day of a review).
const w20 = scheduler.parameters.w[20]
const factor = Math.pow(0.9, -1 / w20) - 1
const curve = (days: number, stability: number): number => Math.pow(1 + (factor * Math.max(0, days)) / Math.max(stability, 1e-6), -w20)

/**
 * Right after a lapse the card is in (re)learning: the curve still says ~100% for minutes,
 * but what Andrea should see is the answer he just gave. "Di nuovo" shows as weak, "Difficile" as uncertain.
 */
export function displayedR(card: Card, lastGrade: Grade, now: number): number {
  const since = card.last_review ? (studyClock(now) - card.last_review.getTime()) / DAY : 0
  const R = curve(since, card.stability)
  if (card.state === State.Learning || card.state === State.Relearning) {
    if (lastGrade === 1) return Math.min(R, 0.4)
    if (lastGrade === 2) return Math.min(R, 0.75)
  }
  return R
}

/** What each grade would schedule now, in Italian ("10 min", "4 giorni"). */
export function previewIntervals(reviews: ReviewLine[], now: number): Record<Grade, string> {
  const card = reviews.length ? replay(reviews) : createEmptyCard(new Date(studyClock(now)))
  const rec = scheduler.repeat(card, new Date(studyClock(now)))
  const out = {} as Record<Grade, string>
  for (const g of [1, 2, 3, 4] as Grade[]) {
    const realDue = realClock(rec[RATING[g]].card.due.getTime())
    out[g] = formatInterval(realDue - now)
  }
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
