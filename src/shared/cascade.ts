export type CascadeMemory = { R: number; stability: number; reps?: number }

export function weakPrerequisites(
  input: { parents: Record<string, string[]>; depth: Record<string, number>; memory: Record<string, CascadeMemory | undefined> },
  goalId: string,
  opts: { solidDays?: number; cap?: number; seed?: number } = {}
): string[] {
  const seen = new Set<string>()
  const walk = (id: string): void => {
    for (const p of input.parents[id] ?? []) if (p !== goalId && !seen.has(p)) { seen.add(p); walk(p) }
  }
  walk(goalId)
  const solidDays = opts.solidDays ?? 14
  const byDepth = new Map<number, string[]>()
  for (const id of seen) {
    const m = input.memory[id]
    if (!m || (m.R >= 0.85 && m.stability >= solidDays)) continue
    const d = input.depth[id] ?? 0
    byDepth.set(d, [...(byDepth.get(d) ?? []), id])
  }
  let seed = opts.seed ?? 0x6d2b79f5
  const rand = (): number => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const result: string[] = []
  for (const d of [...byDepth.keys()].sort((a, b) => a - b)) {
    const group = byDepth.get(d)!.slice().sort()
    for (let i = group.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [group[i], group[j]] = [group[j], group[i]] }
    result.push(...group)
  }
  return result.slice(0, Math.max(0, opts.cap ?? 8))
}
