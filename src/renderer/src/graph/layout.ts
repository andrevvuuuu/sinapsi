import { forceCollide, forceLink, forceManyBody, forceRadial, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force'
import type { GraphModel } from './model'

/** Learn Harness layout forces, as in the approved prototype (docs/prototipi/grafo-v2.html). */
export type LayoutMode = 'radial' | 'vertical' | 'free'
export type SimNode = SimulationNodeDatum & {
  id: string
  kind: 'concept' | 'junction' | 'note' | 'frontier'
  region?: string
  depth: number
  subject?: string | null
}
export type SimLink = SimulationLinkDatum<SimNode> & { wikilink?: boolean; chain?: string; head?: boolean }
export type Layout = {
  nodes: SimNode[]
  links: SimLink[]
  byId: Map<string, SimNode>
  sim: Simulation<SimNode, SimLink>
  /** How many ticks to run before the first frame: fewer when saved positions were reused. */
  warmup: number
  rim: number
  tick(n: number): void
  setMode(m: LayoutMode): void
  positions(): Record<string, [number, number]>
}

export const BASE = 90
export const SPACING = 62

export function createLayout(model: GraphModel, opts: { mode: LayoutMode; saved?: Record<string, [number, number]> }): Layout {
  let mode = opts.mode
  const rim = BASE + model.maxDepth * SPACING + 120
  const regionAngle = new Map(model.regions.map((r, i) => [r.notePath, -Math.PI / 2 + (i / Math.max(1, model.regions.length)) * Math.PI * 2]))
  const subjects = [...new Set(model.notes.map((n) => n.subject ?? '—'))]
  const subjectCentre = new Map(subjects.map((s, i) => {
    const a = -Math.PI * 0.15 + (i / Math.max(1, subjects.length)) * Math.PI * 2
    return [s, { x: Math.cos(a) * (rim + 520), y: Math.sin(a) * (rim + 430) }]
  }))

  const nodes: SimNode[] = []
  for (const c of model.concepts) {
    const a = (regionAngle.get(c.region) ?? 0) + (Math.random() - 0.5) * 0.5
    const r = BASE + c.depth * SPACING
    nodes.push({ id: c.id, kind: 'concept', region: c.region, depth: c.depth, x: Math.cos(a) * r, y: Math.sin(a) * r })
  }
  for (const j of model.junctions) nodes.push({ id: j.id, kind: 'junction', depth: j.depth, x: 0, y: 0 })
  for (const n of model.notes) {
    const c = subjectCentre.get(n.subject ?? '—')!
    nodes.push({ id: n.path, kind: 'note', depth: 0, subject: n.subject, x: c.x + (Math.random() - 0.5) * 160, y: c.y + (Math.random() - 0.5) * 160 })
  }
  model.frontier.forEach((f, i) => {
    const a = (i / Math.max(1, model.frontier.length)) * Math.PI * 2
    nodes.push({ id: `g:${f.course}:${f.name}`, kind: 'frontier', depth: 0, x: Math.cos(a) * rim, y: Math.sin(a) * rim })
  })
  const byId = new Map(nodes.map((n) => [n.id, n]))
  for (const j of model.junctions) {
    const c = byId.get(j.conclusion)!
    byId.get(j.id)!.x = c.x! * 0.9
    byId.get(j.id)!.y = c.y! * 0.9
  }

  let reused = 0
  for (const [id, p] of Object.entries(opts.saved ?? {})) {
    const n = byId.get(id)
    if (!n || !Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue
    n.x = p[0]
    n.y = p[1]
    reused++
  }

  const links: SimLink[] = model.arrows.map((a) => ({ source: a.from, target: a.to, chain: a.chain, head: a.head }))
  for (const [a, b] of model.wikilinks) if (byId.get(a)?.kind === 'note' && byId.get(b)?.kind === 'note') links.push({ source: a, target: b, wikilink: true })

  // Concepts of one note gather around their region's centre.
  const clusterPull = (strength: number) => {
    const f = (alpha: number): void => {
      const cen = new Map<string, { x: number; y: number; n: number }>()
      for (const p of nodes) {
        if (p.kind !== 'concept') continue
        const c = cen.get(p.region!) ?? { x: 0, y: 0, n: 0 }
        c.x += p.x!
        c.y += p.y!
        c.n++
        cen.set(p.region!, c)
      }
      for (const p of nodes) {
        if (p.kind !== 'concept') continue
        const c = cen.get(p.region!)!
        p.vx! += (c.x / c.n - p.x!) * strength * alpha
        p.vy! += (c.y / c.n - p.y!) * strength * alpha
      }
    }
    return f
  }
  // Depth anchoring: foundations at the centre (or bottom), what derives from them outwards (or up).
  const depthForce = () => (alpha: number): void => {
    const k = 0.8 * alpha
    for (const n of nodes) {
      if (n.kind !== 'concept' && n.kind !== 'junction') continue
      if (mode === 'radial') {
        const r = BASE + n.depth * SPACING
        const d = Math.hypot(n.x!, n.y!) || 1
        const dr = (r - d) * k * 0.12
        n.vx! += (n.x! / d) * dr
        n.vy! += (n.y! / d) * dr
        if (n.kind === 'concept') {
          const a = regionAngle.get(n.region!) ?? 0
          n.vx! += (Math.cos(a) * r - n.x!) * k * 0.035
          n.vy! += (Math.sin(a) * r - n.y!) * k * 0.035
        }
      } else if (mode === 'vertical') n.vy! += (260 - n.depth * SPACING * 1.25 - n.y!) * k * 0.12
    }
  }
  const verticalX = (n: SimNode): number => (((regionAngle.get(n.region!) ?? 0) + Math.PI / 2) / (Math.PI * 2)) * 900 - 450

  const sim = forceSimulation<SimNode, SimLink>(nodes)
    .force('link', forceLink<SimNode, SimLink>(links).id((n) => n.id).distance((l) => (l.wikilink ? 90 : 40)).strength((l) => (l.wikilink ? 0.15 : 0.7)))
    .force('charge', forceManyBody<SimNode>().strength((n) => (n.kind === 'frontier' ? -2 : n.kind === 'junction' ? -30 : n.kind === 'note' ? -160 : -240)).distanceMax(500))
    .force('cluster', clusterPull(0.15))
    .force('depth', depthForce())
    .force('gx', forceX<SimNode>((n) => (n.kind === 'note' ? subjectCentre.get(n.subject ?? '—')!.x : mode === 'vertical' && n.kind === 'concept' ? verticalX(n) : 0)).strength((n) => strengthXY(n)))
    .force('gy', forceY<SimNode>((n) => (n.kind === 'note' ? subjectCentre.get(n.subject ?? '—')!.y : 0)).strength((n) => strengthY(n)))
    .force('rim', forceRadial<SimNode>(rim, 0, 0).strength((n) => (n.kind === 'frontier' ? 0.6 : 0)))
    .force('col', forceCollide<SimNode>((n) => (n.kind === 'frontier' ? 3 : n.kind === 'junction' ? 2 : n.kind === 'note' ? 14 : 11)))
    .stop()
  function strengthY(n: SimNode): number {
    return n.kind === 'note' ? 0.08 : mode === 'free' && n.kind !== 'frontier' ? 0.04 : 0
  }
  function strengthXY(n: SimNode): number {
    if (n.kind === 'note') return 0.08
    if (n.kind === 'frontier') return 0
    return mode === 'vertical' && n.kind === 'concept' ? 0.06 : mode === 'free' ? 0.04 : 0
  }

  return {
    nodes,
    links,
    byId,
    sim,
    rim,
    warmup: reused >= nodes.length * 0.8 ? 60 : 400,
    tick: (n) => {
      sim.tick(n)
    },
    setMode(m) {
      mode = m
      // Re-evaluate the accessor-based strengths for the new mode.
      ;(sim.force('gx') as ReturnType<typeof forceX<SimNode>>).strength((n) => strengthXY(n))
      ;(sim.force('gy') as ReturnType<typeof forceY<SimNode>>).strength((n) => strengthY(n))
      ;(sim.force('gx') as ReturnType<typeof forceX<SimNode>>).x((n) => (n.kind === 'note' ? subjectCentre.get(n.subject ?? '—')!.x : mode === 'vertical' && n.kind === 'concept' ? verticalX(n) : 0))
    },
    positions: () => Object.fromEntries(nodes.filter((n) => Number.isFinite(n.x) && Number.isFinite(n.y)).map((n) => [n.id, [n.x!, n.y!] as [number, number]]))
  }
}
