// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SourceList } from '../../src/renderer/src/notebook/SourceList'

afterEach(cleanup)
const css = readFileSync('src/renderer/src/notebook/notebook.css', 'utf8')
const nb = { id: 'n', name: 'A', subject: null, link: null, createdAt: 1, sources: [{ id: 's', notebookId: 'n', kind: 'vault', title: 'Teorema di Rolle', origin: '/v/R.md', addedAt: 1, status: 'ready' }] }

describe('notebook layout', () => {
  it('the «use» checkbox has a 28 px target: its label', () => {
    window.sinapsi = { notebook: {} } as never
    const onToggle = vi.fn()
    render(<SourceList notebook={nb as never} excluded={new Set()} onToggle={onToggle} onView={vi.fn()} notes={[]} onMessage={vi.fn()} />)
    const box = screen.getByRole('checkbox', { name: 'Usa Teorema di Rolle' })
    const hit = box.parentElement!
    expect(hit.tagName).toBe('LABEL')
    expect(hit.className).toBe('nb-hit')
    fireEvent.click(hit)
    expect(onToggle).toHaveBeenCalledWith('s')
    expect(css).toMatch(/\.nb-hit\{display:inline-grid;place-items:center;width:var\(--hit-min\);height:var\(--hit-min\)/)
  })
  it('a source row gives the title the whole width; its actions sit below, on the right', () => {
    expect(css).toMatch(/\.nb-src\{display:grid;grid-template-columns:auto 1fr;[^}]*\}/)
    expect(css).toMatch(/\.nb-src-act\{display:flex;gap:4px;align-items:center;grid-column:2;justify-content:flex-end\}/)
    expect(css).toMatch(/\.nb-src-act \.x\{width:var\(--ctl-sm\);min-height:var\(--ctl-sm\)/)
  })
  it('top bar 72, its controls 44; example questions and the link field 36', () => {
    expect(css).toMatch(/\.nb-top\{[^}]*min-height:var\(--topbar-h\)/)
    expect(css).toMatch(/\.nb-top \.pill\{min-height:var\(--ctl\)/)
    expect(css).toMatch(/\.nb-subject select\{min-height:var\(--ctl\)/)
    expect(css).toMatch(/\.nb \.ghost\{min-height:var\(--ctl\)/)
    expect(css).toMatch(/\.nb \.pri\{min-height:var\(--ctl\)/)
    expect(css).toMatch(/\.nb-starters button\{min-height:var\(--ctl-sm\)/)
    expect(css).toMatch(/\.nb-inline input\{[^}]*min-height:var\(--ctl-sm\)/)
  })
})
