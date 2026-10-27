import { polygonHull } from 'd3-polygon'
import { BASE, SPACING, type Layout, type SimNode } from './layout'
import type { GraphModel } from './model'

/** Canvas drawing of the union graph, ported from docs/prototipi/grafo-v2.html. */
export type Colors = Record<'bg' | 'ink' | 'muted' | 'hair' | 'accent' | 'good' | 'warn' | 'bad' | 'pen' | 'surface', string>
export type Sel = { kind: 'concept' | 'region' | 'note'; id: string }
export type DrawState = {
  model: GraphModel
  layout: Layout
  T: { k: number; x: number; y: number }
  W: number
  H: number
  C: Colors
  dark: boolean
  mode: 'radial' | 'vertical' | 'free'
  show: { regions: boolean; wikilinks: boolean; frontier: boolean }
  hov: Sel | null
  sel: Sel | null
  path: Set<string> | null
  subjectColor: (s: string | null | undefined) => string
  offscreen: HTMLCanvasElement
}
export type DrawOut = { regionLabels: Map<string, [number, number, number, number]> }

export const rgba = (color: string, a: number): string => {
  const h = color.trim().replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(h)) return color
  const n = parseInt(h, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}
const ease = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t))
export const radiusOf = (m: GraphModel, n: SimNode): number => 4.2 + (m.concepts.find((c) => c.id === n.id)?.notes.length ?? 1) * 1.6 + Math.min(3, (m.kids.get(n.id)?.length ?? 0) * 0.6)

/** Which nodes stay lit while something is hovered, selected, or a path is shown. */
export function focusSet(s: Pick<DrawState, 'model' | 'hov' | 'sel' | 'path'>): Set<string> | null {
  if (s.path) return s.path
  const f = s.hov ?? s.sel
  if (!f) return null
  if (f.kind === 'concept') return new Set([f.id, ...(s.model.parents.get(f.id) ?? []), ...(s.model.kids.get(f.id) ?? [])])
  if (f.kind === 'region') return new Set(s.model.concepts.filter((c) => c.notes.includes(f.id)).map((c) => c.id))
  return new Set([f.id])
}

export function draw(ctx: CanvasRenderingContext2D, s: DrawState): DrawOut {
  const { model, layout, T, W, H, C } = s
  const k = T.k
  const sx = (x: number): number => x * k + T.x
  const sy = (y: number): number => y * k + T.y
  const node = (id: string): SimNode | undefined => layout.byId.get(id)
  const tSubj = 1 - ease((k - 0.3) / 0.18)
  const tNote = ease((k - 0.34) / 0.16) * (1 - ease((k - 1.25) / 0.45))
  const tProp = ease((k - 1.15) / 0.5)
  const F = focusSet(s)
  const dim = (id: string): number => (F && !F.has(id) ? 0.13 : 1)
  const out: DrawOut = { regionLabels: new Map() }

  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, W, H)

  const centroids = new Map<string, { x: number; y: number }>()
  for (const r of model.regions) {
    const ns = r.concepts.map(node).filter((n): n is SimNode => !!n)
    if (ns.length) centroids.set(r.notePath, { x: ns.reduce((a, n) => a + n.x!, 0) / ns.length, y: ns.reduce((a, n) => a + n.y!, 0) / ns.length })
  }

  // Depth rings: the edge of what you know.
  if (s.mode === 'radial' && model.concepts.length) {
    ctx.save()
    ctx.strokeStyle = rgba(C.ink, 0.05)
    ctx.lineWidth = 1
    for (let d = 0; d <= model.maxDepth; d++) {
      ctx.beginPath()
      ctx.arc(sx(0), sy(0), (BASE + d * SPACING) * k, 0, 7)
      ctx.stroke()
    }
    ctx.setLineDash([2, 6])
    ctx.strokeStyle = rgba(C.ink, 0.16)
    ctx.beginPath()
    ctx.arc(sx(0), sy(0), (BASE + model.maxDepth * SPACING + 60) * k, 0, 7)
    ctx.stroke()
    ctx.restore()
    if (k > 0.5) {
      ctx.font = '500 11px "Geist Mono",monospace'
      ctx.fillStyle = rgba(C.muted, 0.8)
      ctx.textAlign = 'center'
      ctx.fillText('limite di ciò che sai', sx(0), sy(-(BASE + model.maxDepth * SPACING + 60)) - 8)
      ctx.fillText('basi', sx(0), sy(0) + 4)
    }
  }

  // Regions: a blurred low-resolution bitmap behind everything (Learn Harness), plus dashed hulls.
  if (s.show.regions && model.regions.length) {
    const sc = 0.25
    const off = s.offscreen
    off.width = Math.ceil(W * sc)
    off.height = Math.ceil(H * sc)
    const o = off.getContext('2d')
    if (o) {
      o.clearRect(0, 0, off.width, off.height)
      for (const r of model.regions) {
        o.fillStyle = r.hue
        o.beginPath()
        for (const id of r.concepts) {
          const n = node(id)
          if (!n) continue
          const rr = Math.max(3, 46 * k) * sc
          o.moveTo(sx(n.x!) * sc + rr, sy(n.y!) * sc)
          o.arc(sx(n.x!) * sc, sy(n.y!) * sc, rr, 0, 7)
        }
        o.fill()
      }
      ctx.save()
      ctx.globalAlpha = s.dark ? 0.2 : 0.26
      ctx.filter = `blur(${Math.max(8, 40 * Math.min(1.4, k))}px)`
      ctx.drawImage(off, 0, 0, W, H)
      ctx.filter = 'none'
      ctx.restore()
    }
    if (tNote > 0.05 && tProp < 0.9) {
      ctx.save()
      ctx.setLineDash([3, 5])
      ctx.lineWidth = 1
      for (const r of model.regions) {
        const pts: [number, number][] = []
        for (const id of r.concepts) {
          const n = node(id)
          if (!n) continue
          for (let a = 0; a < 6; a++) pts.push([sx(n.x! + Math.cos(a * 1.047) * 26), sy(n.y! + Math.sin(a * 1.047) * 26)])
        }
        const h = polygonHull(pts)
        if (!h) continue
        ctx.beginPath()
        h.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])))
        ctx.closePath()
        ctx.strokeStyle = rgba(r.hue, tNote * 0.55)
        ctx.stroke()
      }
      ctx.restore()
    }
  }

  // Frontier: notes your MOCs cite that you have not written yet.
  if (s.show.frontier)
    for (const n of layout.nodes) {
      if (n.kind !== 'frontier') continue
      ctx.beginPath()
      ctx.arc(sx(n.x!), sy(n.y!), Math.max(1, 1.6 * Math.sqrt(k)), 0, 7)
      ctx.fillStyle = rgba(C.muted, F ? 0.08 : 0.45)
      ctx.fill()
    }

  // Obsidian links you wrote: between regions (curved) and between plain notes.
  if (s.show.wikilinks && tProp < 0.95) {
    ctx.save()
    ctx.setLineDash([3, 4])
    ctx.lineWidth = 1.2
    for (const [a, b] of model.wikilinks) {
      const A = centroids.get(a) ?? node(a)
      const B = centroids.get(b) ?? node(b)
      if (!A || !B || A.x === undefined || B.x === undefined) continue
      const on = s.sel?.kind === 'region' && (s.sel.id === a || s.sel.id === b)
      ctx.strokeStyle = rgba(C.muted, (on ? 0.75 : 0.28) * (1 - tProp))
      const mx = (A.x + B.x!) / 2
      const my = (A.y! + B.y!) / 2
      const nx = -(B.y! - A.y!) * 0.18
      const ny = (B.x! - A.x) * 0.18
      ctx.beginPath()
      ctx.moveTo(sx(A.x), sy(A.y!))
      ctx.quadraticCurveTo(sx(mx + nx), sy(my + ny), sx(B.x!), sy(B.y!))
      ctx.stroke()
    }
    ctx.restore()
  }

  // Chains: premises converge on a junction, one arrow leaves it.
  ctx.lineWidth = 1.15
  for (const l of layout.links) {
    if (l.wikilink) continue
    const a = l.source as SimNode
    const b = l.target as SimNode
    const lit = !F || (F.has(a.id) || a.kind === 'junction') && (F.has(b.id) || b.kind === 'junction') && (F.has(a.id) || F.has(b.id))
    const al = (0.18 + 0.5 * tProp) * (lit ? 1 : 0.06)
    ctx.strokeStyle = rgba(C.ink, al)
    const [x1, y1, x2, y2] = [sx(a.x!), sy(a.y!), sx(b.x!), sy(b.y!)]
    if (l.head) {
      const dx = x2 - x1
      const dy = y2 - y1
      const L = Math.hypot(dx, dy) || 1
      const [ux, uy] = [dx / L, dy / L]
      const er = radiusOf(model, b) * Math.sqrt(k) * 0.9 + 2
      const ah = Math.max(3, 6 * Math.min(1.4, k))
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2 - ux * (er + ah), y2 - uy * (er + ah))
      ctx.stroke()
      if (k > 0.45) {
        ctx.beginPath()
        ctx.moveTo(x2 - ux * er, y2 - uy * er)
        ctx.lineTo(x2 - ux * (er + ah) - uy * ah * 0.5, y2 - uy * (er + ah) + ux * ah * 0.5)
        ctx.lineTo(x2 - ux * (er + ah) + uy * ah * 0.5, y2 - uy * (er + ah) - ux * ah * 0.5)
        ctx.closePath()
        ctx.fillStyle = rgba(C.ink, al)
        ctx.fill()
      }
    } else {
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    }
  }

  // Obsidian notes not extracted yet.
  for (const n of layout.nodes) {
    if (n.kind !== 'note') continue
    const moc = model.notes.find((x) => x.path === n.id)?.moc
    ctx.globalAlpha = dim(n.id) === 1 ? 1 : 0.15
    ctx.beginPath()
    ctx.arc(sx(n.x!), sy(n.y!), Math.max(2.5, (moc ? 9 : 5) * Math.sqrt(k)), 0, 7)
    ctx.fillStyle = C.bg
    ctx.fill()
    ctx.lineWidth = 1.6
    ctx.strokeStyle = s.subjectColor(n.subject)
    ctx.stroke()
    if ((s.sel?.kind === 'note' && s.sel.id === n.id) || (s.hov?.kind === 'note' && s.hov.id === n.id)) {
      ctx.beginPath()
      ctx.arc(sx(n.x!), sy(n.y!), Math.max(2.5, 5 * Math.sqrt(k)) + 7, 0, 7)
      ctx.strokeStyle = C.ink
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  // Concepts: filled with their region's colour; a dashed ring when they appear in several notes.
  const regionOf = new Map(model.regions.map((r) => [r.notePath, r]))
  for (const c of model.concepts) {
    const n = node(c.id)
    if (!n) continue
    const X = sx(n.x!)
    const Y = sy(n.y!)
    if (X < -30 || Y < -30 || X > W + 30 || Y > H + 30) continue
    const r = Math.max(1.8, radiusOf(model, n) * Math.sqrt(k) * 0.9)
    ctx.globalAlpha = dim(c.id)
    if (c.notes.length > 1) {
      ctx.beginPath()
      ctx.arc(X, Y, r + 3.5, 0, 7)
      ctx.setLineDash([2, 2])
      ctx.strokeStyle = rgba(C.ink, 0.45)
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.setLineDash([])
    }
    ctx.beginPath()
    ctx.arc(X, Y, r, 0, 7)
    ctx.fillStyle = regionOf.get(c.region)?.hue ?? C.muted
    ctx.fill()
    if (s.sel?.kind === 'concept' && s.sel.id === c.id) {
      ctx.beginPath()
      ctx.arc(X, Y, r + 9, 0, 7)
      ctx.strokeStyle = C.ink
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
    if (s.hov?.kind === 'concept' && s.hov.id === c.id) {
      ctx.beginPath()
      ctx.arc(X, Y, r + 12, 0, 7)
      ctx.fillStyle = rgba(regionOf.get(c.region)?.hue ?? C.muted, 0.18)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  // Labels: subjects › notes › concepts cross-fade with the zoom.
  ctx.textAlign = 'center'
  if (tSubj > 0.02) {
    ctx.globalAlpha = tSubj
    const bySubject = new Map<string, SimNode[]>()
    for (const n of layout.nodes) {
      const subj = n.kind === 'note' ? n.subject : n.kind === 'concept' ? regionOf.get(n.region!)?.subject : undefined
      if (!subj) continue
      bySubject.set(subj, [...(bySubject.get(subj) ?? []), n])
    }
    // Subject names avoid each other, like the region labels.
    const placed: { X: number; Y: number; w: number }[] = []
    ctx.font = '400 30px "Instrument Serif",serif'
    const order = [...bySubject].map(([subj, ns]) => ({ subj, X: sx(ns.reduce((a, n) => a + n.x!, 0) / ns.length), Y: Math.min(...ns.map((n) => sy(n.y!))) - 26 })).sort((a, b) => a.Y - b.Y)
    for (const o of order) {
      const label = model.subjectName(o.subj)
      const w = ctx.measureText(label).width
      let tries = 0
      while (tries++ < 40 && placed.some((p) => Math.abs(p.X - o.X) < (p.w + w) / 2 + 10 && Math.abs(p.Y - o.Y) < 34)) o.Y -= 10
      placed.push({ X: o.X, Y: o.Y, w })
      ctx.fillStyle = s.subjectColor(o.subj)
      ctx.fillText(label, o.X, o.Y)
    }
    ctx.globalAlpha = 1
  }
  if (tNote > 0.02) {
    const placed: { X: number; Y: number; w: number }[] = []
    ctx.font = '400 21px "Instrument Serif",serif'
    const order = model.regions
      .filter((r) => centroids.has(r.notePath))
      .map((r) => ({ r, X: sx(centroids.get(r.notePath)!.x), Y: sy(centroids.get(r.notePath)!.y) }))
      .sort((a, b) => a.Y - b.Y)
    for (const o of order) {
      const t = shortTitle(o.r.title)
      const w = ctx.measureText(t).width + 28
      let tries = 0
      while (tries++ < 40 && placed.some((p) => Math.abs(p.X - o.X) < (p.w + w) / 2 + 6 && Math.abs(p.Y - o.Y) < 46)) o.Y += 8
      placed.push({ X: o.X, Y: o.Y, w })
      let a = tNote
      if (s.sel?.kind === 'region' && s.sel.id !== o.r.notePath) a *= 0.3
      ctx.globalAlpha = a
      ctx.fillStyle = rgba(C.surface, 0.82)
      roundRect(ctx, o.X - w / 2, o.Y - 21, w, 40, 20)
      ctx.fill()
      ctx.strokeStyle = rgba(o.r.hue, 0.7)
      ctx.lineWidth = 1.2
      ctx.stroke()
      ctx.fillStyle = C.ink
      ctx.font = '400 21px "Instrument Serif",serif'
      ctx.fillText(t, o.X, o.Y + 1)
      ctx.font = '500 10px "Geist Mono",monospace'
      ctx.fillStyle = C.muted
      ctx.fillText(`${o.r.concepts.length} concetti`, o.X, o.Y + 13)
      out.regionLabels.set(o.r.notePath, [o.X - w / 2, o.Y - 21, w, 40])
    }
    ctx.globalAlpha = 1
    if (tNote > 0.3) {
      ctx.font = '500 12px Geist,sans-serif'
      for (const n of layout.nodes) {
        if (n.kind !== 'note') continue
        const t = model.notes.find((x) => x.path === n.id)?.title ?? ''
        ctx.globalAlpha = tNote * (F ? 0.3 : 0.85)
        ctx.fillStyle = C.muted
        ctx.fillText(t.length > 28 ? t.slice(0, 26) + '…' : t, sx(n.x!), sy(n.y!) + 20)
      }
      ctx.globalAlpha = 1
    }
  }
  if (tProp > 0.02) {
    ctx.font = '500 12px Geist,sans-serif'
    for (const c of model.concepts) {
      const n = node(c.id)
      if (!n) continue
      const X = sx(n.x!)
      const Y = sy(n.y!)
      if (X < -150 || X > W + 150 || Y < -20 || Y > H + 40) continue
      let a = tProp * dim(c.id)
      if ((s.hov?.kind === 'concept' && s.hov.id === c.id) || (s.sel?.kind === 'concept' && s.sel.id === c.id)) a = 1
      if (a < 0.03) continue
      ctx.globalAlpha = a
      ctx.fillStyle = C.ink
      wrap(ctx, c.name, X, Y + radiusOf(model, n) * Math.sqrt(k) * 0.9 + 15, Math.max(110, 26 * k))
    }
    ctx.globalAlpha = 1
  }
  return out
}

export const shortTitle = (t: string): string => (t.length > 30 ? t.replace('Teorema di ', 'Teor. ').replace(' Relativi e Assoluti', '').replace(' Fondamentali', '').replace(' sui Punti Stazionari', '') : t)

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function wrap(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, w: number): void {
  let line = ''
  let yy = y
  for (const wd of t.split(' ')) {
    const tt = line ? `${line} ${wd}` : wd
    if (ctx.measureText(tt).width > w && line) {
      ctx.fillText(line, x, yy)
      line = wd
      yy += 15
    } else line = tt
  }
  ctx.fillText(line, x, yy)
}
