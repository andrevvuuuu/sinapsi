import { z } from 'zod'
import type { ChainLine, Concept, GraphData, PropLine } from '../../shared/graph-types'
import type { VaultIndex } from '../../shared/vault-types'

const NewProp = z.object({ id: z.string().min(1), name: z.string().trim().min(1), statement: z.string().trim().min(1), section: z.string().optional() })
const RefProp = z.object({ ref: z.string().regex(/^n_/), section: z.string().optional() })
const ChainItem = z.object({ premises: z.array(z.string().min(1)).min(1), conclusion: z.string().min(1) })
export type ExtractReply = { propositions: (z.infer<typeof NewProp> | z.infer<typeof RefProp>)[]; chains: z.infer<typeof ChainItem>[]; dropped: number }

/** Lenient, like the nota viva: each item is checked alone and the bad ones are counted, not fatal. */
export const ExtractReplySchema = z
  .object({ propositions: z.array(z.unknown()), chains: z.array(z.unknown()).default([]) })
  .transform((raw): ExtractReply => {
    let dropped = 0
    const propositions: ExtractReply['propositions'] = []
    for (const p of raw.propositions) {
      const r = RefProp.safeParse(p)
      const n = r.success ? null : NewProp.safeParse(p)
      if (r.success) propositions.push(r.data)
      else if (n?.success) propositions.push(n.data)
      else dropped++
    }
    const chains: ExtractReply['chains'] = []
    for (const c of raw.chains) {
      const r = ChainItem.safeParse(c)
      if (r.success) chains.push(r.data)
      else dropped++
    }
    return { propositions, chains, dropped }
  })

/**
 * Deterministic merge (Learn Harness merger): the model chose what the ideas are and which existing
 * concepts they are; ids, provenance and timestamps are set here, never copied from the model.
 */
export function mergeExtraction(
  reply: ExtractReply,
  ctx: { notePath: string; known: Set<string>; mint: () => string; mintChain: () => string; now: number }
): { props: PropLine[]; chains: ChainLine[]; dropped: number } {
  let dropped = reply.dropped
  const local = new Map<string, string>()
  const props: PropLine[] = []
  const at = ctx.now
  for (const p of reply.propositions) {
    if ('ref' in p) {
      if (!ctx.known.has(p.ref)) {
        dropped++
        continue
      }
      local.set(p.ref, p.ref)
      props.push({ id: p.ref, name: '', statement: '', notePath: ctx.notePath, ...(p.section ? { section: p.section } : {}), at })
      continue
    }
    if (local.has(p.id)) {
      dropped++
      continue
    }
    const id = ctx.mint()
    local.set(p.id, id)
    props.push({ id, name: p.name, statement: p.statement, notePath: ctx.notePath, ...(p.section ? { section: p.section } : {}), at })
  }
  const resolve = (x: string): string | undefined => local.get(x) ?? (ctx.known.has(x) ? x : undefined)
  const seen = new Set<string>()
  const chains: ChainLine[] = []
  for (const c of reply.chains) {
    const premises = [...new Set(c.premises.map(resolve))]
    const conclusion = resolve(c.conclusion)
    if (!conclusion || premises.some((x) => !x) || premises.includes(conclusion)) {
      dropped++
      continue
    }
    const ids = premises as string[]
    const key = `${[...ids].sort().join('+')}>${conclusion}`
    if (seen.has(key)) continue
    seen.add(key)
    chains.push({ id: ctx.mintChain(), premises: ids, conclusion, notePath: ctx.notePath, at })
  }
  return { props, chains, dropped }
}

const words = (t: string): Set<string> => new Set((t.toLowerCase().match(/\p{L}{4,}/gu) ?? []).filter((w) => !STOP.has(w)))
const STOP = new Set(['della', 'dello', 'delle', 'degli', 'nella', 'nelle', 'sono', 'come', 'anche', 'questo', 'questa', 'quando', 'ogni', 'allora', 'esiste', 'dove', 'quindi', 'perché', 'tutti', 'tutte', 'essere', 'viene'])

/**
 * The existing concepts the extractor may recognise as the same idea: this note's own, those of
 * notes it links to or that link to it, then same-subject concepts that share the most words.
 */
export function pickCandidates(g: GraphData, index: VaultIndex, notePath: string, text: string, max = 150): Concept[] {
  const note = index.notes.find((n) => n.path === notePath)
  const byTitle = new Map(index.notes.map((n) => [n.title.toLowerCase(), n]))
  // Notes this note cites come first, then the notes that cite it.
  const linked: string[] = []
  for (const l of note?.links ?? []) {
    const t = (l.path && index.notes.find((x) => x.path === l.path)) || byTitle.get(l.target.toLowerCase())
    if (t && !linked.includes(t.path)) linked.push(t.path)
  }
  if (note) for (const n of index.notes) if (!linked.includes(n.path) && n.links.some((l) => (l.path ? l.path === note.path : l.target.toLowerCase() === note.title.toLowerCase()))) linked.push(n.path)
  const subjectOf = new Map(index.notes.map((n) => [n.path, n.subject]))
  const own = g.concepts.filter((c) => c.notes.includes(notePath))
  const rank = (c: Concept): number => Math.min(...c.notes.map((p) => linked.indexOf(p)).filter((i) => i >= 0))
  const near = g.concepts.filter((c) => !own.includes(c) && c.notes.some((p) => linked.includes(p))).sort((a, b) => rank(a) - rank(b))
  const textWords = words(text)
  const subject = note?.subject ?? null
  const rest = g.concepts
    .filter((c) => !own.includes(c) && !near.includes(c) && subject !== null && subjectOf.get(c.birth) === subject)
    .map((c) => ({ c, score: [...words(`${c.name} ${c.statement}`)].filter((w) => textWords.has(w)).length }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.c)
  return [...own, ...near, ...rest].slice(0, max)
}
