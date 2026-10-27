import { describe, expect, it, vi } from 'vitest'
import { makeGraphHandlers } from '../../src/main/ipc-handlers'
import type { Extractor } from '../../src/main/graph/jobs'

function setup(stored: unknown = {}) {
  const x: Extractor = { request: vi.fn(async () => undefined), backgroundTick: vi.fn(), status: vi.fn(() => ({ queued: [] })), graph: vi.fn(async () => ({ concepts: [], chains: [], extracted: {} })) }
  const pos = { read: vi.fn(async () => stored), write: vi.fn(async () => undefined) }
  return { x, pos, h: makeGraphHandlers(x, pos) }
}

describe('graph handlers', () => {
  it('extracts on request as a manual extraction', async () => {
    const { h, x } = setup()
    await h.extract('/v/a.md')
    expect(x.request).toHaveBeenCalledWith('/v/a.md', 'manual')
    await expect(h.extract(42)).rejects.toThrow()
  })
  it('returns empty positions for a corrupt file', async () => {
    expect(await setup({ n_a: ['x', 1] }).h.positions()).toEqual({})
    expect(await setup('rotto').h.positions()).toEqual({})
    expect(await setup({ n_a: [1, 2] }).h.positions()).toEqual({ n_a: [1, 2] })
  })
  it('refuses non-finite positions', async () => {
    await expect(setup().h.savePositions({ n_a: [Infinity, 1] })).rejects.toThrow()
  })
})
