import type { GraphData } from '../../shared/graph-types'
import type { Memory, MemoryState, WeaknessLine } from '../../shared/memory-types'
import { ancestors } from '../graph/derive'

export type TreeNode = {
  id: string
  name: string
  statement: string
  role: 'base' | 'derivata'
  R: number | null
  S?: number
  state: MemoryState
  weaknesses: string[]
  sections: Record<string, string>
  birth: string
  goal: boolean
}
export type MinimalTree = {
  goalIds: string[]
  nodes: TreeNode[]
  chains: { premises: string[]; conclusion: string }[]
  pruned: string[]
}
const words = (s: string): string[] =>
  [
    ...new Set(
      s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase()
        .match(/[\p{L}\p{N}]+/gu) ?? []
    )
  ].filter((w) => w.length >= 4)
export function resolveGoals(graph: GraphData, topic: string, notePath?: string): string[] {
  const query = new Set(words(topic))
  const ranked = graph.concepts
    .map((c) => ({
      c,
      score: words([c.name, ...c.aliases].join(' ')).filter((w) => query.has(w)).length
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.c.depth - a.c.depth)
  if (ranked.length) return ranked.slice(0, 3).map(({ c }) => c.id)
  if (!notePath) return []
  const note = graph.concepts.filter((c) => c.notes.includes(notePath))
  const depth = Math.max(-1, ...note.map((c) => c.depth))
  return note
    .filter((c) => c.depth === depth)
    .slice(0, 3)
    .map((c) => c.id)
}
export function minimalTree(
  graph: GraphData,
  goalIds: string[],
  memory: Map<string, Memory>,
  weaknesses: WeaknessLine[],
  opts: { solidDays: number }
): MinimalTree {
  const ids = new Set<string>()
  for (const id of goalIds) {
    if (graph.concepts.some((c) => c.id === id)) {
      ids.add(id)
      for (const a of ancestors(graph, id)) ids.add(a)
    }
  }
  const pruned: string[] = []
  for (const id of [...ids]) {
    const m = memory.get(id)
    if (!goalIds.includes(id) && m?.state === 'la sai' && (m.stability ?? 0) >= opts.solidDays) {
      ids.delete(id)
      pruned.push(id)
    }
  }
  const chains = graph.chains
    .filter((c) => ids.has(c.conclusion) && c.premises.every((p) => ids.has(p)))
    .map(({ premises, conclusion }) => ({ premises, conclusion }))
  const concepts = graph.concepts.filter((c) => ids.has(c.id))
  const nodes: TreeNode[] = concepts
    .map((c) => {
      const m = memory.get(c.id)
      return {
        id: c.id,
        name: c.name,
        statement: c.statement,
        role: (chains.some((x) => x.conclusion === c.id && x.premises.some((p) => ids.has(p)))
          ? 'derivata'
          : 'base') as 'base' | 'derivata',
        R: m?.R ?? null,
        ...(m?.stability !== undefined ? { S: m.stability } : {}),
        state: m?.state ?? 'mai visto',
        weaknesses: weaknesses
          .filter((w) => w.conceptId === c.id && w.status === 'active')
          .map((w) => w.text),
        sections: c.sections,
        birth: c.birth,
        goal: goalIds.includes(c.id)
      }
    })
    .sort(
      (a, b) =>
        Number(a.role !== 'base') - Number(b.role !== 'base') ||
        (graph.concepts.find((c) => c.id === a.id)?.depth ?? 0) -
          (graph.concepts.find((c) => c.id === b.id)?.depth ?? 0)
    )
  return { goalIds: goalIds.filter((id) => ids.has(id)), nodes, chains, pruned }
}
export function treeBrief(tree: MinimalTree): string {
  if (!tree.nodes.length) return ''
  const lines = [
    'ALBERO MINIMO (id reali dei concetti; usa questi id come nodeId e come id dei nodi del piano; per un concetto nuovo usa "new:slug"):'
  ]
  for (const n of tree.nodes)
    lines.push(
      `${n.id} | ${n.name} | ${n.statement} | ${n.role} | ${n.R === null ? 'mai visto' : `${Math.round(n.R * 100)}%`} | ${n.S === undefined ? '—' : `${Math.round(n.S)} giorni`} | ${n.weaknesses.join('; ') || '—'}`
    )
  lines.push('Catene:', ...tree.chains.map((c) => `${c.premises.join(' + ')} ⇒ ${c.conclusion}`))
  return lines.join('\n')
}
