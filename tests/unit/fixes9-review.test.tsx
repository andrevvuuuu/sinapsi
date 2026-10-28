// @vitest-environment jsdom
import { createHash } from 'node:crypto'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { deriveGraph } from '../../src/main/graph/derive'
import { detectMoves } from '../../src/main/graph/moves'
import { createReviewService } from '../../src/main/memory/review'
import { memoryStore } from '../../src/main/memory/store'
import { variantsStore } from '../../src/main/memory/variants'
import { ExerciseView } from '../../src/renderer/src/review/ExerciseView'
import { parseItalianNumber } from '../../src/shared/numbers'
import Home from '../../src/renderer/src/home/Home'
import type { VaultIndex, VaultNote } from '../../src/shared/vault-types'
import { settingsSchema } from '../../src/shared/settings-schema'

afterEach(cleanup)

describe('numbers written the Italian way', () => {
  it.each([
    ['1.000,5', 1000.5],
    ['1000,5', 1000.5],
    ['1.000', 1000],
    ['3,05', 3.05],
    ['3.05', 3.05],
    ['-2,5', -2.5],
    ['1 000,5', 1000.5],
    ['abc', NaN]
  ])('%s → %s', (s, v) => {
    expect(parseItalianNumber(s)).toBe(v)
  })
})

describe('formulas in steps to order', () => {
  it('are rendered, not raw', () => {
    const { container } = render(<ExerciseView locked={false} onChange={vi.fn()} exercise={{ type: 'order', prompt: 'Ordina', steps: ['$f(a)=f(b)$', 'Rolle su $g$', 'Conclusione $\\frac{1}{2}$'], answer: 'x' }} />)
    expect(container.querySelectorAll('.rv-order .katex').length).toBeGreaterThanOrEqual(3)
  })
})

describe('variants prepared after an extraction', () => {
  it('generates the variants of a freshly extracted note', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-prep-'))
    const ask = vi.fn(async (req: { prompt: string; schema: { parse(x: unknown): unknown } }) => ({ data: req.schema.parse({ concepts: [{ id: 'n_a', exercises: [{ type: 'open', prompt: 'q', answer: 'a' }] }] }), fromCache: false, engine: 'agy' as const }))
    const graph = { concepts: [{ id: 'n_a', name: 'A', statement: 's', aliases: [], birth: '/v/A.md', notes: ['/v/A.md'], sections: {}, depth: 0 }, { id: 'n_b', name: 'B', statement: 's', aliases: [], birth: '/v/B.md', notes: ['/v/B.md'], sections: {}, depth: 0 }], chains: [], extracted: {} }
    const vars = variantsStore(dir)
    const svc = createReviewService({ bridge: { ask } as never, memory: memoryStore(dir), variants: vars, graph: async () => graph, vault: async () => null, readNote: async () => '', settings: async () => ({ reviewSessionSize: 12, exerciseTypes: ['open'] }), workDir: join(dir, 'w') })
    await svc.prepare('/v/A.md')
    expect(ask).toHaveBeenCalledTimes(1)
    expect(ask.mock.calls[0][0].prompt).toContain('n_a |')
    expect(ask.mock.calls[0][0].prompt).not.toContain('n_b |')
    expect((await vars.read()).map((v) => v.conceptId)).toEqual(['n_a'])
  })
})

describe('the due badge', () => {
  it('refreshes when the window comes back into focus', async () => {
    let due = 0
    const settings = settingsSchema('/x').parse({})
    window.sinapsi = {
      settings: { get: vi.fn(async () => settings), set: vi.fn(), chooseVault: vi.fn() },
      vault: { index: vi.fn(async () => ({ root: '/v', scannedAt: 0, subjects: [], notes: [] })), onChange: () => () => undefined },
      ai: { status: vi.fn(async () => ({ agy: 'idle', claude: 'idle' })), onStatus: () => () => undefined },
      app: { openExternal: vi.fn() },
      review: { memory: vi.fn(async () => Object.fromEntries(Array.from({ length: due }, (_, i) => [`c${i}`, { due: 1 }]))), sessions: vi.fn(async () => []) }
    } as never
    render(<Home />)
    await screen.findByRole('group', { name: 'Tipo di sessione' })
    due = 3
    await act(async () => void window.dispatchEvent(new Event('focus')))
    expect((await screen.findByText('3')).className).toBe('due')
  })
})

const note = (path: string, title: string): VaultNote => ({ path, title, folder: '', tags: [], aliases: [], links: [], headings: [], blockIds: [], subject: null, mtime: 1, size: 1, available: true })
const idx = (...notes: VaultNote[]): VaultIndex => ({ root: '/v', scannedAt: 1, subjects: [], notes })
const h = (t: string) => createHash('sha256').update(t).digest('hex')

describe('a renamed or moved note keeps its concepts', () => {
  it('detects a move by content, or by the same title in another folder', async () => {
    const prev = idx(note('/v/Rolle.md', 'Rolle'), note('/v/Analisi/Lagrange.md', 'Lagrange'), note('/v/Fermat.md', 'Fermat'))
    const next = idx(note('/v/Teorema di Rolle.md', 'Teorema di Rolle'), note('/v/Matematica/Lagrange.md', 'Lagrange'), note('/v/Fermat.md', 'Fermat'))
    const texts: Record<string, string> = { '/v/Teorema di Rolle.md': 'testo di rolle', '/v/Matematica/Lagrange.md': 'cambiato' }
    const moves = await detectMoves(prev, next, { '/v/Rolle.md': { hash: h('testo di rolle'), at: 1 }, '/v/Analisi/Lagrange.md': { hash: h('vecchio'), at: 1 } }, async (p) => texts[p] ?? '')
    expect(moves).toEqual([
      { from: '/v/Rolle.md', to: '/v/Teorema di Rolle.md' },
      { from: '/v/Analisi/Lagrange.md', to: '/v/Matematica/Lagrange.md' }
    ])
  })
  it('the derived graph follows the moves', () => {
    const g = deriveGraph({
      props: [{ id: 'n_r', name: 'Rolle', statement: 's', notePath: '/v/Rolle.md', at: 1 }],
      chains: [],
      extractions: [{ notePath: '/v/Rolle.md', hash: 'h', at: 1, reason: 'manual', nodes: 1, chains: 0, dropped: 0, ok: true }],
      moves: [{ from: '/v/Rolle.md', to: '/v/Teorema di Rolle.md', at: 2 }]
    } as never)
    expect(g.concepts[0]).toMatchObject({ birth: '/v/Teorema di Rolle.md', notes: ['/v/Teorema di Rolle.md'] })
    expect(Object.keys(g.extracted)).toEqual(['/v/Teorema di Rolle.md'])
  })
})

describe('subject labels in the overview', () => {
  it('never overlap: moved up, or left out when there is no room', async () => {
    const { placeLabels } = await import('../../src/renderer/src/graph/draw')
    const items = Array.from({ length: 60 }, (_, i) => ({ key: `s${i}`, X: 100 + (i % 3) * 5, Y: 200, w: 80 }))
    const out = placeLabels(items)
    for (let a = 0; a < out.length; a++)
      for (let b = a + 1; b < out.length; b++) {
        const p = out[a]
        const q = out[b]
        const apart = Math.abs(p.X - q.X) >= (p.w + q.w) / 2 + 16 || Math.abs(p.Y - q.Y) >= 36
        expect(apart).toBe(true)
      }
    expect(out.length).toBeLessThan(60)
  })
})
