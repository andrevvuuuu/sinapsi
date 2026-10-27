import type { LearnerAnswer } from '../../../../shared/teacher-protocol'

export type GameResult = NonNullable<LearnerAnswer['game']>
export type GameProps<G> = { id: string; game: G; onDone: (r: GameResult) => void }

/** Same shuffle for the same question: a reload shows the same game. Never the original order. */
export function seededShuffle<T>(xs: T[], seed: string): T[] {
  let h = 2166136261
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  const rnd = (): number => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0), h / 4294967296)
  const out = [...xs]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  if (out.length > 1 && out.every((x, i) => x === xs[i])) out.push(out.shift()!)
  return out
}

export const norm = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
