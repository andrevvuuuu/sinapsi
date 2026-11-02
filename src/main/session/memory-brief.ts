import type { GraphData } from '../../shared/graph-types'
import type { Grade, Memory } from '../../shared/memory-types'

const GRADE: Record<Grade, string> = { 1: 'Di nuovo', 2: 'Difficile', 3: 'Bene', 4: 'Facile' }
const LIMIT = 40

const days = (s: number): string => (s < 1 ? `${Math.max(1, Math.round(s * 24))} h` : `${String(s < 10 ? Math.round(s * 10) / 10 : Math.round(s)).replace('.', ',')} g`)

/** One line per concept: what the tutor needs to skip the solid ones and dwell on the weak ones. */
function line(name: string, m: Memory | undefined): string {
  if (!m || m.R === null) return `- ${name} — mai visto`
  const parts = [`${m.state}`, `R ${Math.round(m.R * 100)}%`]
  if (m.stability !== undefined) parts.push(`S ${days(m.stability)}`)
  if (m.lastGrade) parts.push(`ultimo: ${GRADE[m.lastGrade]}${m.misconception ? ' (sbagliato con sicurezza: misconcezione)' : ''}`)
  parts.push(m.reps === 1 ? '1 ripasso' : `${m.reps} ripassi`)
  if (m.lapses) parts.push(m.lapses === 1 ? '1 dimenticanza' : `${m.lapses} dimenticanze`)
  return `- ${name} — ${parts.join(' · ')}`
}

/**
 * The memory of the note's concepts, compact, for the session's first message: bases first (by
 * inference depth), at most 40. Empty when the note has no concepts in the graph yet.
 */
export function memoryBrief(graph: GraphData, memory: Map<string, Memory> | Record<string, Memory>, notePath: string): string {
  const get = (id: string): Memory | undefined => (memory instanceof Map ? memory.get(id) : memory[id])
  const concepts = graph.concepts.filter((c) => c.notes.includes(notePath)).sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name))
  if (!concepts.length) return ''
  const shown = concepts.slice(0, LIMIT)
  const seen = shown.filter((c) => get(c.id)?.R != null).length
  return [
    `Stato di memoria dei concetti di questa nota, dai ripassi e dalla Pratica (${seen} su ${shown.length} già visti). R = probabilità di ricordarlo oggi; S = stabilità, il tempo perché R scenda al 90%:`,
    ...shown.map((c) => line(c.name, get(c.id))),
    ...(concepts.length > LIMIT ? [`(e altri ${concepts.length - LIMIT} concetti)`] : [])
  ].join('\n')
}
