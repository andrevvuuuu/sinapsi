import { describe, expect, it } from 'vitest'
import { createLayout } from '../../src/renderer/src/graph/layout'
import { buildModel } from '../../src/renderer/src/graph/model'
import type { Concept, GraphData } from '../../src/shared/graph-types'
import type { VaultIndex, VaultNote } from '../../src/shared/vault-types'

const vnote = (title: string, subject = 'matematica'): VaultNote => ({ path: `/v/${title}.md`, title, folder: '', tags: [], aliases: [], links: [], headings: [], blockIds: [], subject, mtime: 1, size: 1, available: true })
const index: VaultIndex = { root: '/v', scannedAt: 1, subjects: [{ id: 'matematica', color: '#de77a9' }], notes: ['A', 'B', 'C'].map((t) => vnote(t)).concat(vnote('Bicipite', 'bodybuilding')) }
const C = (id: string, birth: string, depth: number): Concept => ({ id, name: id, statement: id, aliases: [], birth: `/v/${birth}.md`, notes: [`/v/${birth}.md`], sections: {}, depth })
// three chains of depth 0 → 1 → 2 → 3 in three notes
const concepts: Concept[] = []
const chains: GraphData['chains'] = []
for (const note of ['A', 'B', 'C'])
  for (let d = 0; d < 4; d++) {
    concepts.push(C(`${note}${d}`, note, d))
    if (d > 0) chains.push({ id: `arg_${note}${d}`, premises: [`${note}${d - 1}`], conclusion: `${note}${d}`, notes: [`/v/${note}.md`] })
  }
const model = buildModel({ concepts, chains, extracted: {} }, index)
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length

describe('createLayout', () => {
  it('radial: deeper concepts sit farther from the centre', () => {
    const l = createLayout(model, { mode: 'radial' })
    l.tick(300)
    const r = (d: number): number => mean(concepts.filter((c) => c.depth === d).map((c) => Math.hypot(l.byId.get(c.id)!.x!, l.byId.get(c.id)!.y!)))
    expect(r(1)).toBeGreaterThan(r(0))
    expect(r(3)).toBeGreaterThan(r(1))
  })
  it('vertical: deeper concepts sit higher (smaller y)', () => {
    const l = createLayout(model, { mode: 'vertical' })
    l.tick(300)
    const y = (d: number): number => mean(concepts.filter((c) => c.depth === d).map((c) => l.byId.get(c.id)!.y!))
    expect(y(3)).toBeLessThan(y(0))
  })
  it('starts from saved positions and ignores unknown or broken entries', () => {
    const saved = { A0: [500, -500] as [number, number], ghost: [1, 1] as [number, number], A1: [NaN, 3] as [number, number] }
    const l = createLayout(model, { mode: 'free', saved })
    expect(l.byId.get('A0')).toMatchObject({ x: 500, y: -500 })
    expect(Number.isFinite(l.byId.get('A1')!.x)).toBe(true)
    expect(l.byId.has('ghost')).toBe(false)
  })
  it('round-trips positions', () => {
    const l = createLayout(model, { mode: 'radial' })
    l.tick(20)
    const p = l.positions()
    const again = createLayout(model, { mode: 'radial', saved: p })
    expect(again.byId.get('B2')!.x).toBeCloseTo(p.B2[0])
    expect(Object.keys(p)).toContain('/v/Bicipite.md')
  })
})
