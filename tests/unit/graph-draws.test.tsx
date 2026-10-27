// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { GraphView } from '../../src/renderer/src/graph/GraphView'
import type { GraphData } from '../../src/shared/graph-types'
import type { VaultIndex } from '../../src/shared/vault-types'

afterEach(cleanup)

it('draws the graph once it has loaded (regression: the canvas stayed empty)', async () => {
  const calls: string[] = []
  const fn = (name: string) => (...a: unknown[]) => {
    calls.push(name)
    if (name === 'measureText') return { width: 10 }
    if (name.startsWith('create')) return { addColorStop: () => undefined }
    void a
    return undefined
  }
  const ctx = new Proxy({}, { get: (_t, k) => (k === 'canvas' ? {} : fn(String(k))), set: () => true })
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as never
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 5) as unknown as number)
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
  const index: VaultIndex = { root: '/v', scannedAt: 1, subjects: [], notes: [{ path: '/v/R.md', title: 'R', folder: '', tags: [], aliases: [], links: [], headings: [], blockIds: [], subject: null, mtime: 1, size: 1, available: true }] }
  const graph: GraphData = { extracted: {}, chains: [], concepts: [{ id: 'n_r', name: 'Rolle', statement: 'x', aliases: [], birth: '/v/R.md', notes: ['/v/R.md'], sections: {}, depth: 0 }] }
  window.sinapsi = { graph: { get: vi.fn(async () => graph), status: vi.fn(async () => ({ queued: [] })), extract: vi.fn(), onChange: () => () => undefined, positions: vi.fn(async () => ({})), savePositions: vi.fn(async () => undefined) } } as never
  render(<GraphView menuOpen index={index} onStudy={vi.fn()} onOpenNote={vi.fn()} />)
  await screen.findByText(/1 concetti da 1 note/)
  await vi.waitFor(() => expect(calls).toContain('arc'), { timeout: 2000 })
  vi.unstubAllGlobals()
})
