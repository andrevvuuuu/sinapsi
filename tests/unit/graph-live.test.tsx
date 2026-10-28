// @vitest-environment jsdom
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createExtractor } from '../../src/main/graph/jobs'
import { graphStore } from '../../src/main/graph/store'
import { GraphView } from '../../src/renderer/src/graph/GraphView'
import type { GraphData } from '../../src/shared/graph-types'
import type { VaultIndex, VaultNote } from '../../src/shared/vault-types'

beforeAll(() => {
  const noop = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'canvas' ? {} : () => undefined), set: () => true })
  HTMLCanvasElement.prototype.getContext = vi.fn(() => noop) as never
})
afterEach(cleanup)

const vnote = (title: string): VaultNote => ({ path: `/v/${title}.md`, title, folder: '', tags: [], aliases: [], links: [], headings: [], blockIds: [], subject: 'matematica', mtime: 1, size: 1, available: true })
const index: VaultIndex = { root: '/v', scannedAt: 1, subjects: [], notes: [vnote('Rolle'), vnote('Lagrange'), vnote('Limiti')] }
const graph: GraphData = {
  extracted: { '/v/Rolle.md': { hash: 'h', at: 1 }, '/v/Lagrange.md': { hash: 'h', at: 1 } },
  concepts: [
    { id: 'n_r', name: 'Teorema di Rolle', statement: 's', aliases: [], birth: '/v/Rolle.md', notes: ['/v/Rolle.md', '/v/Lagrange.md'], sections: {}, depth: 0 },
    { id: 'n_l', name: 'Teorema di Lagrange', statement: 's', aliases: [], birth: '/v/Lagrange.md', notes: ['/v/Lagrange.md'], sections: {}, depth: 1 }
  ],
  chains: [{ id: 'arg', premises: ['n_r'], conclusion: 'n_l', notes: ['/v/Lagrange.md'] }]
}
function mount(livePaths: string[]) {
  window.sinapsi = { graph: { get: vi.fn(async () => graph), status: vi.fn(async () => ({ queued: [] })), extract: vi.fn(), onChange: () => () => undefined, positions: vi.fn(async () => ({})), savePositions: vi.fn() } } as never
  render(<GraphView menuOpen index={index} livePaths={livePaths} onStudy={vi.fn()} onOpenNote={vi.fn()} />)
}

describe('the graph of the notes vive', () => {
  it('shows only the concepts of notes with a nota viva, shared ones included', async () => {
    mount(['/v/Lagrange.md'])
    expect(await screen.findByText('2 concetti da 1 note · 1 catene · 0 in più note')).toBeTruthy()
  })
  it('explains how it grows when there is no nota viva yet', async () => {
    mount([])
    expect(await screen.findByText(/Il grafo nasce dalle note vive/)).toBeTruthy()
  })
})

describe('background extraction', () => {
  it('only touches notes that have a nota viva', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-live-'))
    const ask = vi.fn()
    const x = createExtractor({ bridge: { ask } as never, store: graphStore(dir), vault: async () => index, readNote: async () => 't', workDir: dir, onChange: vi.fn(), eligible: async () => new Set<string>() })
    expect(await x.backgroundTick({ idleSeconds: 600, enabled: true, dailyLimit: 6 })).toBeNull()
    expect(ask).not.toHaveBeenCalled()
  })
})
