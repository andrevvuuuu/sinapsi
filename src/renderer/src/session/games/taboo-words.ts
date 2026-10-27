import { norm } from './shared'

const tokens = (s: string): string[] => norm(s).split(/[^a-z0-9]+/).filter(Boolean)

/**
 * The forbidden words Andrea used. Short words (≤ 4 letters, like "f" or "lim") must match a whole word;
 * longer ones also catch their endings ("limite" → "limiti", "retta" → "rette", not "rettangolo");
 * several words ("valor medio") match as a phrase; LaTeX ($\lim$) is reduced to its letters.
 */
export function tabooUsed(forbidden: string[], text: string): string[] {
  const words = tokens(text)
  const joined = ` ${words.join(' ')} `
  return forbidden.filter((f) => {
    const parts = tokens(f.replace(/\\/g, ' '))
    if (!parts.length) return false
    if (parts.length > 1) return joined.includes(` ${parts.join(' ')} `)
    const w = parts[0]
    if (w.length <= 4) return words.includes(w)
    const stem = w.slice(0, w.length - 1)
    return words.some((t) => t.startsWith(stem) && t.length <= w.length + 2)
  })
}
