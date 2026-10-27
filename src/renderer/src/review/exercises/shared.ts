export type ExerciseState = { answer: string; correct: boolean | null; ready: boolean }

/** A stable shuffle (same exercise, same order) that never leaves the list in its original order. */
export function shuffled<T>(xs: T[], seed: string): number[] {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  const idx = xs.map((_, i) => i)
  for (let i = idx.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0
    const j = h % (i + 1)
    ;[idx[i], idx[j]] = [idx[j], idx[i]]
  }
  if (idx.length > 1 && idx.every((v, i) => v === i)) idx.push(idx.shift()!)
  return idx
}
export const plain = (s: string): string => s.replace(/\$/g, '').trim()
