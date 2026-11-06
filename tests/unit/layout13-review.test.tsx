// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReviewView } from '../../src/renderer/src/review/ReviewView'

afterEach(cleanup)
const css = readFileSync('src/renderer/src/review/review.css', 'utf8')

describe('review layout', () => {
  it('"Inizia ripasso" lives in a bar pinned to the bottom of the column, always in view', async () => {
    const item = { conceptId: 'n_a', name: 'Rolle', noteTitle: 'R', R: null, exercise: { type: 'open', prompt: 'p', answer: 'a' } }
    window.sinapsi = { review: { plan: vi.fn(async () => ({ items: [item], due: 0 })), intervals: vi.fn(async () => ({})) }, settings: { get: vi.fn(async () => ({ exerciseTypes: ['open'], reviewSessionSize: 12 })), set: vi.fn() } } as never
    render(<ReviewView onBack={vi.fn()} onStudy={vi.fn()} onOpenNote={vi.fn()} />)
    const go = await screen.findByRole('button', { name: 'Inizia ripasso' })
    expect(go.parentElement?.className).toBe('rv-go')
    expect(css).toMatch(/\.rv-go \{\s*position: sticky;\s*bottom: 0;/)
  })
  it('uses the shared sizes: top bar 72, buttons 44, exercise-type chips 44', () => {
    expect(css).toMatch(/\.rv-top \{[^}]*min-height: var\(--topbar-h\);/)
    expect(css).toMatch(/\.rv-top \.pill \{\s*min-height: var\(--ctl\);/)
    expect(css).toMatch(/\.rv \.pri \{[^}]*min-height: var\(--ctl\);/)
    expect(css).toMatch(/\.rv-chips button \{\s*min-height: var\(--ctl\);/)
  })
})
