// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeGraphHandlers } from '../../src/main/ipc-handlers'
import { readySources } from '../../src/main/notes/store'
import { liveOnly } from '../../src/renderer/src/graph/model'
import { clampLayout, DEFAULT_LAYOUT } from '../../src/renderer/src/home/layout'
import { LeftPanel } from '../../src/renderer/src/home/LeftPanel'
import { Splitter } from '../../src/renderer/src/home/Splitter'
import type { GraphData } from '../../src/shared/graph-types'
import type { VaultIndex, VaultNote } from '../../src/shared/vault-types'

afterEach(cleanup)
const vnote = (title: string, links: VaultNote['links'] = []): VaultNote => ({ path: `/v/${title}.md`, title, folder: '', tags: [], aliases: [], links, headings: [], blockIds: [], subject: null, mtime: 1, size: 1, available: true })

describe('the graph of the notes vive', () => {
  const graph: GraphData = {
    extracted: {},
    concepts: [
      { id: 'n_r', name: 'Rolle', statement: 's', aliases: [], birth: '/v/Rolle.md', notes: ['/v/Rolle.md', '/v/Lagrange.md'], sections: {}, depth: 0 },
      { id: 'n_l', name: 'Lagrange', statement: 's', aliases: [], birth: '/v/Lagrange.md', notes: ['/v/Lagrange.md'], sections: {}, depth: 1 },
      { id: 'n_x', name: 'Altro', statement: 's', aliases: [], birth: '/v/Rolle.md', notes: ['/v/Rolle.md'], sections: {}, depth: 0 }
    ],
    chains: [{ id: 'a', premises: ['n_r'], conclusion: 'n_l', notes: ['/v/Lagrange.md'] }]
  }
  const index: VaultIndex = { root: '/v', scannedAt: 1, subjects: [], notes: [vnote('Rolle'), vnote('Lagrange', [{ target: 'Futura', resolved: false }])] }
  it('keeps the concepts a nota viva shares with older notes, homed in the live note, with their chains', () => {
    const { graph: g, index: i } = liveOnly(graph, index, ['/v/Lagrange.md'])
    expect(g.concepts.map((c) => [c.id, c.birth])).toEqual([['n_r', '/v/Lagrange.md'], ['n_l', '/v/Lagrange.md']])
    expect(g.chains).toHaveLength(1)
    expect(i.notes[0].links).toEqual([])
  })
})

describe('notes eligible for background extraction', () => {
  it('only those with a ready nota viva', () => {
    expect([...readySources([{ sourcePath: '/a', status: 'ready' }, { sourcePath: '/b', status: 'error' }, { sourcePath: '/c', status: 'generating' }] as never)]).toEqual(['/a'])
  })
})

describe('side panels', () => {
  const vis = { left: true, right: true }
  it('dragging the left line never shrinks the right panel', () => {
    const l = clampLayout({ ...DEFAULT_LAYOUT, left: 500 }, 1024, 800, vis, 'left')
    expect(l.right).toBe(DEFAULT_LAYOUT.right)
    expect(l.left).toBe(1024 - DEFAULT_LAYOUT.right - 360)
  })
  it('a closed right panel does not limit the left one', () => {
    expect(clampLayout({ ...DEFAULT_LAYOUT, left: 480 }, 1024, 800, { left: true, right: false }, 'left').left).toBe(480)
  })
  it('dragging the right line widens it at the cost of nothing else', () => {
    const l = clampLayout({ ...DEFAULT_LAYOUT, right: 400 }, 1100, 800, vis, 'right')
    expect(l.left).toBe(DEFAULT_LAYOUT.left)
    expect(l.right).toBe(400)
  })
})

describe('lists in the side panels', () => {
  it('grow with their content up to the dragged size', () => {
    render(<LeftPanel sessions={[]} notes={[]} subjectOf={() => null} onOpenSession={vi.fn()} onOpenNota={vi.fn()} settings={null} onSettings={vi.fn()} onTheme={vi.fn()} onClose={vi.fn()} sessionsHeight={260} onSessionsHeight={vi.fn()} />)
    const sec = screen.getByRole('region', { name: 'Sessioni' })
    expect(sec.style.maxHeight).toBe('260px')
    expect(sec.style.height).toBe('')
  })
})

describe('Splitter', () => {
  it('a cancelled drag ends cleanly, and only the main button drags', () => {
    const onActive = vi.fn()
    const onChange = vi.fn()
    render(<Splitter orientation="vertical" label="L" value={300} min={200} max={400} onChange={onChange} onActive={onActive} />)
    const s = screen.getByRole('separator')
    fireEvent.pointerDown(s, { clientX: 0, button: 2 })
    expect(onActive).not.toHaveBeenCalled()
    fireEvent.pointerDown(s, { clientX: 0, button: 0 })
    fireEvent.pointerCancel(window)
    expect(onActive).toHaveBeenLastCalledWith(false)
    fireEvent.pointerMove(window, { clientX: 50 })
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('graph positions', () => {
  it('are merged, so hidden concepts keep where they were', async () => {
    let file: Record<string, [number, number]> = { a: [1, 1], b: [2, 2] }
    const h = makeGraphHandlers({} as never, { read: async () => file, write: async (p) => void (file = p) })
    await h.savePositions({ a: [5, 5] })
    expect(file).toEqual({ a: [5, 5], b: [2, 2] })
  })
})
