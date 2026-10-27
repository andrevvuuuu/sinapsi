import type { Chain, Concept, GraphData, Ledgers } from '../../shared/graph-types'

/** Pure: the whole graph is rebuilt from the ledgers on every read. */
export function deriveGraph({ props: rawProps, chains: rawChains, extractions: rawExtractions, moves = [] }: Ledgers): GraphData {
  // A renamed or moved note: every path follows its moves (in order, transitively).
  const to = new Map<string, string>()
  for (const m of [...moves].sort((a, b) => a.at - b.at)) if (m.from !== m.to) to.set(m.from, m.to)
  const where = (p: string): string => {
    const seen = new Set<string>()
    while (to.has(p) && !seen.has(p)) {
      seen.add(p)
      p = to.get(p)!
    }
    return p
  }
  const props = rawProps.map((p) => ({ ...p, notePath: where(p.notePath) }))
  const chains = rawChains.map((c) => ({ ...c, notePath: where(c.notePath) }))
  const extractions = rawExtractions.map((e) => ({ ...e, notePath: where(e.notePath) }))
  const byId = new Map<string, Concept>()
  for (const p of props) {
    const c = byId.get(p.id)
    if (!c) {
      byId.set(p.id, { id: p.id, name: p.name, statement: p.statement, aliases: [], birth: p.notePath, notes: [p.notePath], sections: p.section ? { [p.notePath]: p.section } : {}, depth: 0 })
      continue
    }
    if (!c.notes.includes(p.notePath)) c.notes.push(p.notePath)
    if (p.section && !c.sections[p.notePath]) c.sections[p.notePath] = p.section
    if (p.statement && p.statement !== c.statement && !c.aliases.includes(p.statement)) c.aliases.push(p.statement)
  }

  const byKey = new Map<string, Chain>()
  for (const l of chains) {
    if (!l.premises.length || l.premises.includes(l.conclusion)) continue
    if (!byId.has(l.conclusion) || l.premises.some((x) => !byId.has(x))) continue
    const premises = [...new Set(l.premises)]
    const key = `${[...premises].sort().join('+')}>${l.conclusion}`
    const c = byKey.get(key)
    if (!c) byKey.set(key, { id: l.id, premises, conclusion: l.conclusion, notes: [l.notePath] })
    else if (!c.notes.includes(l.notePath)) c.notes.push(l.notePath)
  }
  const merged = [...byKey.values()]

  const depth = inferenceDepths([...byId.keys()], merged)
  for (const c of byId.values()) c.depth = depth.get(c.id) ?? 0

  const extracted: GraphData['extracted'] = {}
  for (const e of extractions) if (e.ok && (!extracted[e.notePath] || extracted[e.notePath].at <= e.at)) extracted[e.notePath] = { hash: e.hash, at: e.at }

  return { concepts: [...byId.values()], chains: merged, extracted }
}

/**
 * Longest premise path to each node (Learn Harness inference depth). Cycles are collapsed with
 * Tarjan's SCC first, so members of a cycle share one depth and nothing recurses forever.
 */
function inferenceDepths(ids: string[], chains: Chain[]): Map<string, number> {
  const out = new Map<string, string[]>()
  for (const id of ids) out.set(id, [])
  for (const c of chains) for (const p of c.premises) out.get(p)!.push(c.conclusion)

  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const comp = new Map<string, number>()
  let counter = 0
  let comps = 0
  const strong = (v: string): void => {
    index.set(v, counter)
    low.set(v, counter++)
    stack.push(v)
    onStack.add(v)
    for (const w of out.get(v)!) {
      if (!index.has(w)) {
        strong(w)
        low.set(v, Math.min(low.get(v)!, low.get(w)!))
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, index.get(w)!))
    }
    if (low.get(v) === index.get(v)) {
      let w: string
      do {
        w = stack.pop()!
        onStack.delete(w)
        comp.set(w, comps)
      } while (w !== v)
      comps++
    }
  }
  for (const id of ids) if (!index.has(id)) strong(id)

  // Tarjan numbers components in reverse topological order: walk them from the last (sources) down.
  const preds = new Map<number, Set<number>>()
  for (const [v, ws] of out)
    for (const w of ws) {
      const [from, to] = [comp.get(v)!, comp.get(w)!]
      if (from === to) continue
      if (!preds.has(to)) preds.set(to, new Set())
      preds.get(to)!.add(from)
    }
  const cd = new Map<number, number>()
  for (let c = comps - 1; c >= 0; c--) cd.set(c, Math.max(-1, ...[...(preds.get(c) ?? [])].map((p) => cd.get(p)!)) + 1)
  return new Map(ids.map((id) => [id, cd.get(comp.get(id)!)!]))
}

/** Every concept the given one transitively rests on. */
export function ancestors(g: GraphData, id: string): Set<string> {
  const parents = new Map<string, string[]>()
  for (const c of g.chains) parents.set(c.conclusion, [...(parents.get(c.conclusion) ?? []), ...c.premises])
  const seen = new Set<string>()
  const walk = (x: string): void => {
    for (const p of parents.get(x) ?? [])
      if (!seen.has(p) && p !== id) {
        seen.add(p)
        walk(p)
      }
  }
  walk(id)
  return seen
}
