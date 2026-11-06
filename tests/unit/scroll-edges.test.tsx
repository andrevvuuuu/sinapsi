// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import type { RefObject } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NotaFrame } from '../../src/renderer/src/nota/NotaView'
import { ChatPane } from '../../src/renderer/src/notebook/ChatPane'

// The library's scroll edges, recorded: which scroller each one fades and on which edges. The fade itself (only where
// content is hidden, none when nothing overflows) is GlassScrollEdges's and needs layout, which jsdom has not.
const edges = vi.hoisted(() => [] as { target: RefObject<HTMLElement | null>; edges?: readonly string[]; size?: number }[])
vi.mock('@glass-sdk/liquid-glass', async (original) => ({
  ...(await original<typeof import('@glass-sdk/liquid-glass')>()),
  GlassScrollEdges: (p: (typeof edges)[number]) => (edges.push(p), null)
}))

afterEach(() => {
  cleanup()
  edges.length = 0
})

describe('scroll edges', () => {
  it('fade the nota where it scrolls under the island: the live content of the scene, at its top', () => {
    const { container } = render(<NotaFrame bar={<nav aria-label="Controlli" />}>testo</NotaFrame>)
    const page = container.querySelector('.nota-scroll')
    expect(page?.classList.contains('lg-content')).toBe(true)
    const e = edges.find((x) => x.target.current === page)
    expect(e?.edges).toEqual(['top'])
    // As deep as the island's room (12 px + 54 px).
    expect(e?.size).toBe(66)
  })

  it('fade the notebook conversation where it passes under the bar', () => {
    Element.prototype.scrollIntoView = vi.fn()
    render(<ChatPane turns={[]} pending={false} selected={1} ready={1} onAsk={vi.fn()} onRetry={vi.fn()} onCite={vi.fn()} />)
    const turns = screen.getByRole('region', { name: 'Chat sulle fonti' }).querySelector('.nb-turns')
    expect(edges.find((x) => x.target.current === turns)?.edges).toEqual(['top'])
  })
})
