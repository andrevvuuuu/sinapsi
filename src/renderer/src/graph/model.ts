import type { Concept, GraphData } from '../../../shared/graph-types'
import type { Memory } from '../../../shared/memory-types'
import { isMoc } from '../../../shared/moc'
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
  descendantsCount: Map<string, number>
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

  const descendantsCount = new Map<string, number>()
  for (const c of concepts) {
    const seen = new Set<string>()
    const walk = (id: string): void => {
      for (const child of kids.get(id) ?? [])
        if (child !== c.id && !seen.has(child)) {
          seen.add(child)
          walk(child)
        }
    }
    walk(c.id)
    descendantsCount.set(c.id, seen.size)
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

  const noteOf = new Map(index.notes.map((x) => [x.path, x]))
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
      const t = (l.path && noteOf.get(l.path)) || byTitle.get(l.target.toLowerCase())
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
    descendantsCount,
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

const subjectOfPath = (path: string): string | null => {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts.length > 1 ? parts[0] : null
}

export function subjectsOf(g: GraphData): (string | null)[] {
  return [...new Set(g.concepts.flatMap((c) => c.notes.map(subjectOfPath)))]
}

export function filterBySubject(g: GraphData, subject: string | null | undefined): GraphData {
  if (subject === undefined) return g
  const concepts = g.concepts.filter((c) => c.notes.some((path) => subjectOfPath(path) === subject))
  const ids = new Set(concepts.map((c) => c.id))
  return { ...g, concepts, chains: g.chains.filter((ch) => ids.has(ch.conclusion) && ch.premises.every((id) => ids.has(id))) }
}

export type GraphAggregation = {
  clusters: { id: string; label: string; conceptIds: string[]; meanR: number | null; weak: number }[]
  links: { from: string; to: string; count: number }[]
}

const noteLabel = (path: string): string => path.replace(/\\/g, '/').split('/').pop()!.replace(/\.md$/i, '')
const subjectFor = (c: Concept): string | null => {
  const path = (c.notes[0] ?? c.birth).replace(/\\/g, '/').split('/').filter(Boolean)
  return path.length > 1 ? path[0] : null
}

export function shouldAggregate(conceptCount: number, threshold = 400): boolean {
  return conceptCount >= threshold
}

export function aggregate(
  g: GraphData,
  mem: Map<string, Memory> | undefined,
  by: 'subject' | 'note'
): GraphAggregation {
  const clusterFor = new Map<string, string>()
  const grouped = new Map<string, { label: string; concepts: Concept[] }>()
  for (const c of g.concepts) {
    const path = by === 'note' ? c.birth : subjectFor(c)
    const id = path === null ? 'subject:—' : `${by}:${path}`
    const label = path === null ? '—' : by === 'note' ? noteLabel(path) : path
    const group = grouped.get(id) ?? { label, concepts: [] }
    group.concepts.push(c)
    grouped.set(id, group)
    clusterFor.set(c.id, id)
  }
  const clusters = [...grouped].map(([id, group]) => {
    const rs = group.concepts.map((c) => mem?.get(c.id)?.R).filter((r): r is number => r != null && Number.isFinite(r))
    return {
      id,
      label: group.label,
      conceptIds: group.concepts.map((c) => c.id),
      meanR: rs.length ? rs.reduce((sum, r) => sum + r, 0) / rs.length : null,
      weak: group.concepts.filter((c) => ['incerto', 'debole'].includes(mem?.get(c.id)?.state ?? '')).length
    }
  })
  const crossing = new Map<string, number>()
  for (const ch of g.chains) {
    const froms = new Set(ch.premises.map((id) => clusterFor.get(id)).filter((id): id is string => !!id))
    const to = clusterFor.get(ch.conclusion)
    if (!to) continue
    for (const from of froms) if (from !== to) {
      const key = `${from}\n${to}`
      crossing.set(key, (crossing.get(key) ?? 0) + 1)
    }
  }
  const links = [...crossing].map(([key, count]) => {
    const [from, to] = key.split('\n')
    return { from, to, count }
  })
  return { clusters, links }
}

export function drillDown(g: GraphData, clusterId: string, by: 'subject' | 'note'): GraphData {
  const concepts = g.concepts.filter((c) => {
    const path = by === 'note' ? c.birth : subjectFor(c)
    return (path === null ? 'subject:—' : `${by}:${path}`) === clusterId
  })
  const ids = new Set(concepts.map((c) => c.id))
  return { ...g, concepts, chains: g.chains.filter((ch) => ids.has(ch.conclusion) && ch.premises.every((id) => ids.has(id))) }
}

export function orphans(g: GraphData): { id: string; reason: 'isolated' | 'no-outgoing' }[] {
  const touched = new Set<string>()
  const premises = new Set<string>()
  for (const ch of g.chains) {
    touched.add(ch.conclusion)
    for (const id of ch.premises) { touched.add(id); premises.add(id) }
  }
  const found: { id: string; reason: 'isolated' | 'no-outgoing'; name: string }[] = []
  for (const c of g.concepts) {
    if (!touched.has(c.id)) found.push({ id: c.id, reason: 'isolated', name: c.name })
    else if (c.depth === 0 && !premises.has(c.id)) found.push({ id: c.id, reason: 'no-outgoing', name: c.name })
  }
  return found
    .sort((a, b) => a.reason.localeCompare(b.reason) || a.name.localeCompare(b.name))
    .map(({ id, reason }) => ({ id, reason }))
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
          (model.descendantsCount.get(c.id) ?? 0) >= 3
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

/**
 * The graph of the notes vive only: concepts born in a note that has a nota viva, the chains among them,
 * and the vault reduced to those notes (no other Obsidian note, no frontier).
 */
export function liveOnly(g: GraphData, index: VaultIndex, paths: string[]): { graph: GraphData; index: VaultIndex } {
  const live = new Set(paths)
  // A concept a nota viva shares with an older note belongs to the graph too, homed in that nota viva.
  const concepts = g.concepts
    .filter((c) => c.notes.some((n) => live.has(n)))
    .map((c) => {
      const notes = c.notes.filter((n) => live.has(n))
      return { ...c, birth: live.has(c.birth) ? c.birth : notes[0], notes }
    })
  const ids = new Set(concepts.map((c) => c.id))
  const chains = g.chains.filter((ch) => ids.has(ch.conclusion) && ch.premises.every((p) => ids.has(p))).map((ch) => ({ ...ch, notes: ch.notes.filter((n) => live.has(n)) }))
  const extracted = Object.fromEntries(Object.entries(g.extracted).filter(([p]) => live.has(p)))
  // No frontier either: only links between notes that exist.
  return { graph: { concepts, chains, extracted, retired: g.retired, dormant: g.dormant }, index: { ...index, notes: index.notes.filter((n) => live.has(n.path)).map((n) => ({ ...n, links: n.links })) } }
}
