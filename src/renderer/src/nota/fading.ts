import type { Concept, GraphData } from '../../../shared/graph-types'
import type { Memory } from '../../../shared/memory-types'

/**
 * Backward fading (Renkl): a proof loses its worked steps from the end as the concepts it rests on
 * consolidate. The stage comes from the weakest concept he has already seen in the section:
 *   0  nothing seen yet              → the whole proof, worked
 *   1  seen, but weak (R < 60%) or a misconception → the last step hidden
 *   2  uncertain (60% ≤ R < 85%)     → the last two
 *   3  known (R ≥ 85%), S < 21 days  → the last half (at least three)
 *   4  known and S ≥ 21 days         → all of it
 * Concepts never reviewed don't hold the proof back: the note is where he first meets them.
 */
export type Stage = 0 | 1 | 2 | 3 | 4
export type Fade = { stage: Stage; names: string[] }

export const SOLID_DAYS = 21

function stageOf(m: Memory): Stage {
  if (m.R === null) return 0
  if (m.misconception || m.R < 0.6) return 1
  if (m.R < 0.85) return 2
  return (m.stability ?? 0) >= SOLID_DAYS ? 4 : 3
}

export function fadeOf(concepts: Concept[], memory: Record<string, Memory>): Fade {
  const seen = concepts.filter((c) => memory[c.id] && memory[c.id].R !== null)
  if (!seen.length) return { stage: 0, names: [] }
  const stage = Math.min(...seen.map((c) => stageOf(memory[c.id]))) as Stage
  return { stage, names: seen.map((c) => c.name) }
}

/** How many of the last steps stay covered. */
export function hiddenSteps(stage: Stage, steps: number): number {
  const n = [0, 1, 2, Math.max(3, Math.ceil(steps / 2)), steps][stage]
  return Math.min(steps, n)
}

/** "§2 Enunciato", "2. Enunciato", "## Enunciato" → "enunciato". */
const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/^[\s#§\d.,:)\-–—]+/, '')
    .replace(/\s+/g, ' ')
    .trim()

/** "§2 Enunciato" → "2"; "Enunciato" → "". */
const numOf = (s: string): string => /^[\s#§]*(\d+(?:\.\d+)*)/.exec(s)?.[1] ?? ''

/**
 * The concepts the graph places in this section of the Obsidian note, matched by title or else by
 * number ("§3"); when none match, every concept of the note.
 */
export function sectionConcepts(graph: GraphData, notePath: string, section: { num: string; title: string }): Concept[] {
  const own = graph.concepts.filter((c) => c.notes.includes(notePath))
  const t = norm(section.title)
  const n = numOf(section.num) || numOf(section.title)
  const here = own.filter((c) => {
    const raw = c.sections[notePath] ?? ''
    const s = norm(raw)
    if (s && t && (s === t || (s.length >= 3 && t.includes(s)) || (t.length >= 3 && s.includes(t)))) return true
    return !!n && numOf(raw) === n
  })
  return here.length ? here : own
}
