// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MaterialDialog } from '../../src/renderer/src/practice/MaterialDialog'

afterEach(cleanup)
const catalog = { subjects: [{ name: 'Analisi', notes: [{ path: '/v/R.md', title: 'Rolle', concepts: [{ id: 'a', name: 'A', R: null, due: false, practiced: false }, { id: 'b', name: 'B', R: null, due: false, practiced: false }] }] }], sources: [], suggested: [] }

describe('group checkboxes in «Scegli il materiale»', () => {
  it('have a 28 px target around the 18 px box: a click beside it selects, and does not fold the group', () => {
    const onConfirm = vi.fn()
    const { container } = render(<MaterialDialog catalog={catalog as never} concepts={new Set()} sources={new Set()} onConfirm={onConfirm} onClose={vi.fn()} />)
    const box = screen.getByRole('checkbox', { name: 'Seleziona tutto Rolle' }) as HTMLInputElement
    const hit = box.parentElement!
    expect(hit.className).toBe('mt-hit')
    const details = hit.closest('details')!
    const wasOpen = details.open
    fireEvent.click(hit)
    expect(box.checked).toBe(true)
    expect(details.open).toBe(wasOpen)
    expect(container.querySelectorAll('.mt-hit').length).toBeGreaterThanOrEqual(2)
    const css = readFileSync('src/renderer/src/practice/practice.css', 'utf8')
    expect(css).toMatch(/\.pr \.mt-hit\{display:inline-grid;place-items:center;flex:none;width:var\(--hit-min\);height:var\(--hit-min\);margin:calc\(\(18px - var\(--hit-min\)\) \/ 2\);cursor:pointer\}/)
  })
})
