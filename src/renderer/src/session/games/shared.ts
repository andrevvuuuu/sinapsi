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

/** Coppie layout: the left column shuffled, the right column shuffled so that no row holds its own match. */
export function matchLayout(n: number, seed: string): { left: number[]; right: number[] } {
  const idx = [...Array(n).keys()]
  const left = seededShuffle(idx, seed + 'l')
  const right = seededShuffle(idx, seed + 'r')
  for (let pass = 0; pass < n; pass++) {
    let clash = false
    for (let i = 0; i < n; i++)
      if (right[i] === left[i]) {
        clash = true
        const j = (i + 1) % n
        ;[right[i], right[j]] = [right[j], right[i]]
      }
    if (!clash) break
  }
  return { left, right }
}

/** Game details travel to the tutor through IPC (max 5000 characters). */
export const clip = (s: string, max = 4000): string => (s.length > max ? s.slice(0, max - 1) + '…' : s)
