import type { Concept, GraphData } from '../../../shared/graph-types'
import type { VaultIndex } from '../../../shared/vault-types'

/**
 * The union graph as the view sees it: Learn Harness concepts grouped in regions (one per Obsidian
 * note they were born in), chains with junctions, and the Obsidian side — notes not extracted yet,
 * their wikilinks, and the frontier of notes the MOCs cite but that do not exist yet.
 */
export type Region = {
  notePath: string
  title: string
  subject: string | null
  hue: string
  concepts: string[]
}
export type VConcept = Concept & { region: string }
export type Junction = { id: string; premises: string[]; conclusion: string; depth: number }
export type Arrow = { from: string; to: string; chain: string; head: boolean }
export type ONote = {
  path: string
  title: string
  subject: string | null
  moc: boolean
  extracted: boolean
  available: boolean
}
export type SearchHit = { kind: 'concept' | 'region' | 'note'; id: string; label: string }
export type GraphModel = {
  regions: Region[]
  concepts: VConcept[]
  junctions: Junction[]
  arrows: Arrow[]
  notes: ONote[]
  wikilinks: [string, string][]
  frontier: { name: string; course: string }[]
  subjects: VaultIndex['subjects']
  maxDepth: number
  parents: Map<string, string[]>
  kids: Map<string, string[]>
  conceptById: Map<string, VConcept>
  noteByPath: Map<string, ONote | { path: string; title: string }>
  search(q: string, limit?: number): SearchHit[]
  /** Display name of a subject: its folder name when it matches the tag (tags carry no spaces). */
  subjectName(id: string | null | undefined): string
}

const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
const isMoc = (n: VaultIndex['notes'][number]): boolean =>
  /\bMOC$/i.test(n.title) || /moc/i.test(n.type ?? '')

/** A stable, readable hue per note (Learn Harness: one colour per birth region). */
function hueOf(path: string): string {
  let h = 2166136261
  for (let i = 0; i < path.length; i++) h = Math.imul(h ^ path.charCodeAt(i), 16777619)
  const hue = (h >>> 0) % 360
  const [s, l] = [0.55, 0.64]
  const f = (n: number): string => {
    const k = (n + hue / 30) % 12
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

export function buildModel(g: GraphData, index: VaultIndex): GraphModel {
  const byPath = new Map(index.notes.map((n) => [n.path, n]))
  const byTitle = new Map(index.notes.map((n) => [n.title.toLowerCase(), n]))
  const title = (p: string): string =>
    byPath.get(p)?.title ?? p.split('/').pop()!.replace(/\.md$/, '')

  const regionMap = new Map<string, Region>()
  for (const c of g.concepts) {
    if (!regionMap.has(c.birth))
      regionMap.set(c.birth, {
        notePath: c.birth,
        title: title(c.birth),
        subject: byPath.get(c.birth)?.subject ?? null,
        hue: hueOf(c.birth),
        concepts: []
      })
    regionMap.get(c.birth)!.concepts.push(c.id)
  }
  const concepts: VConcept[] = g.concepts.map((c) => ({ ...c, region: c.birth }))
  const depthOf = new Map(g.concepts.map((c) => [c.id, c.depth]))

  const junctions: Junction[] = []
  const arrows: Arrow[] = []
  const parents = new Map<string, string[]>()
  const kids = new Map<string, string[]>()
  for (const ch of g.chains) {
    for (const p of ch.premises) {
      parents.set(ch.conclusion, [...(parents.get(ch.conclusion) ?? []), p])
      kids.set(p, [...(kids.get(p) ?? []), ch.conclusion])
    }
    if (ch.premises.length > 1) {
      junctions.push({
        id: ch.id,
        premises: ch.premises,
        conclusion: ch.conclusion,
        depth:
          (Math.max(...ch.premises.map((p) => depthOf.get(p) ?? 0)) +
            (depthOf.get(ch.conclusion) ?? 0)) /
          2
      })
      for (const p of ch.premises) arrows.push({ from: p, to: ch.id, chain: ch.id, head: false })
      arrows.push({ from: ch.id, to: ch.conclusion, chain: ch.id, head: true })
    } else arrows.push({ from: ch.premises[0], to: ch.conclusion, chain: ch.id, head: true })
  }

  const notes: ONote[] = index.notes
    .filter((n) => !regionMap.has(n.path))
    .map((n) => ({
      path: n.path,
      title: n.title,
      subject: n.subject,
      moc: isMoc(n),
      extracted: n.path in g.extracted,
      available: n.available
    }))

  const seen = new Set<string>()
  const wikilinks: [string, string][] = []
  const frontier: { name: string; course: string }[] = []
  for (const n of index.notes)
    for (const l of n.links) {
      if (!l.resolved) {
        if (isMoc(n) && !frontier.some((f) => f.name === l.target && f.course === n.title))
          frontier.push({ name: l.target, course: n.title })
        continue
      }
      const t = byTitle.get(l.target.toLowerCase())
      if (!t || t.path === n.path) continue
      const pair = [n.path, t.path].sort() as [string, string]
      const key = pair.join('\n')
      if (!seen.has(key)) {
        seen.add(key)
        wikilinks.push(pair)
      }
    }

  const regions = [...regionMap.values()]
  return {
    regions,
    concepts,
    junctions,
    arrows,
    notes,
    wikilinks,
    frontier,
    subjects: index.subjects,
    maxDepth: Math.max(0, ...g.concepts.map((c) => c.depth)),
    parents,
    kids,
    conceptById: new Map(concepts.map((c) => [c.id, c])),
    noteByPath: new Map<string, ONote | { path: string; title: string }>([
      ...index.notes.map((n) => [n.path, { path: n.path, title: n.title }] as const),
      ...notes.map((n) => [n.path, n] as const)
    ]),
    subjectName(id) {
      if (!id) return ''
      const key = fold(id).replace(/[^a-z0-9]/g, '')
      for (const n of index.notes) {
        if (n.subject !== id) continue
        for (const part of n.folder.split('/'))
          if (fold(part).replace(/[^a-z0-9]/g, '') === key) return part
      }
      return id.charAt(0).toUpperCase() + id.slice(1).replace(/[-_]/g, ' ')
    },
    search(q, limit = 8) {
      const v = fold(q.trim())
      if (!v) return []
      const hits: SearchHit[] = [
        ...concepts
          .filter((c) => fold(c.name).includes(v) || fold(c.statement).includes(v))
          .map((c) => ({ kind: 'concept' as const, id: c.id, label: c.name })),
        ...regions
          .filter((r) => fold(r.title).includes(v))
          .map((r) => ({ kind: 'region' as const, id: r.notePath, label: r.title })),
        ...notes
          .filter((n) => fold(n.title).includes(v))
          .map((n) => ({ kind: 'note' as const, id: n.path, label: n.title }))
      ]
      return hits.slice(0, limit)
    }
  }
}

/** A cheap content signature: equal data in new objects (every graph:changed, every vault event) gives the same key. */
export function modelKey(g: GraphData, index: VaultIndex): string {
  return JSON.stringify([
    g.concepts.map((c) => [c.id, c.notes, c.depth, c.name]),
    g.chains.map((c) => [c.id, c.premises, c.conclusion]),
    Object.keys(g.extracted).sort(),
    index.notes.map((n) => [
      n.path,
      n.title,
      n.subject,
      n.available,
      n.links.map((l) => l.target + (l.resolved ? '' : '?'))
    ]),
    index.subjects
  ])
}

/** Every concept that rests, directly or not, on this one. */
export function descendants(model: GraphModel, id: string): Set<string> {
  const seen = new Set<string>()
  const walk = (x: string): void => {
    for (const k of model.kids.get(x) ?? [])
      if (!seen.has(k) && k !== id) {
        seen.add(k)
        walk(k)
      }
  }
  walk(id)
  return seen
}

type MemoryLike = { state: string; due: number | null }

/** Fragile bases (prototype grafo-v2): uncertain or weak concepts that at least three others rest on. */
export function fragileBases(model: GraphModel, memory: Record<string, MemoryLike>): Set<string> {
  return new Set(
    model.concepts
      .filter(
        (c) =>
          ['incerto', 'debole'].includes(memory[c.id]?.state ?? '') &&
          descendants(model, c.id).size >= 3
      )
      .map((c) => c.id)
  )
}

export function lensCounts(
  model: GraphModel,
  memory: Record<string, MemoryLike>,
  now: number
): { due: number; never: number; fragile: number } {
  return {
    due: model.concepts.filter((c) => (memory[c.id]?.due ?? Infinity) <= now).length,
    never: model.concepts.filter((c) => !memory[c.id]).length,
    fragile: fragileBases(model, memory).size
  }
}
