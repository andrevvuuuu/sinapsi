import type { Memory } from './memory-types'

const DAY = 86_400_000
const W20 = 0.1542
const FACTOR = Math.pow(0.9, -1 / W20) - 1

export function retrievabilityAt(m: Memory, at: number): number | null {
  if (m.lastAt === null || m.stability === undefined) return null
  const days = Math.max(0, (at - m.lastAt) / DAY)
  return Math.pow(1 + (FACTOR * days) / Math.max(m.stability, 1e-6), -W20)
}

export function examClass(m: Memory, at: number): 'solid' | 'shaky' | 'weak' | 'misconception' | 'faded' | 'unseen' {
  if (m.reps === 0 || m.lastAt === null) return 'unseen'
  if (m.misconception) return 'misconception'
  const r = retrievabilityAt(m, at)
  if (m.reps < 3) return 'faded'
  if (r === null || r < 0.6) return 'weak'
  return r >= 0.85 ? 'solid' : 'shaky'
}
