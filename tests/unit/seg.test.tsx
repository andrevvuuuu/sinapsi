// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { Seg } from '../../src/renderer/src/components/glass'

afterEach(cleanup)

function Prova({ track }: { track?: 'glass' | 'plain' }): React.JSX.Element {
  const [v, setV] = useState<'a' | 'b' | 'c'>('a')
  return (
    <Seg
      label="Prova"
      className="seg"
      track={track}
      value={v}
      onChange={setV}
      options={(['a', 'b', 'c'] as const).map((k) => ({ value: k, label: k }))}
    />
  )
}

const selected = (): string[] =>
  screen.getAllByRole('tab').filter((t) => t.getAttribute('aria-selected') === 'true').map((t) => t.textContent ?? '')
const indicator = (): HTMLElement => document.querySelector<HTMLElement>('.lg-tab-indicator')!

/**
 * The segmented control is the library's tabs: a glass selection (the old lens) that moves to the option chosen, over a
 * glass track. Its sliding is the library's (the e2e glass test measures it on screen); here, what it says and does.
 */
describe('segmented control', () => {
  it('names its options and marks the chosen one, with the selection hidden from assistive tech', () => {
    render(<Prova />)
    expect(screen.getByRole('tablist', { name: 'Prova' })).toBeTruthy()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['a', 'b', 'c'])
    expect(selected()).toEqual(['a'])
    expect(indicator()).not.toBeNull()
    expect(indicator().getAttribute('role')).toBe('presentation')
  })

  it('moves to the option clicked, which stays the chosen one', async () => {
    render(<Prova />)
    await act(async () => fireEvent.click(screen.getByRole('tab', { name: 'c' })))
    expect(selected()).toEqual(['c'])
  })

  it('moves the focus with the arrow keys, and chooses only on purpose (focus never selects)', async () => {
    render(<Prova />)
    const a = screen.getByRole('tab', { name: 'a' })
    a.focus()
    await act(async () => fireEvent.keyDown(a, { key: 'ArrowRight' }))
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'b' }))
    expect(selected()).toEqual(['a'])
    await act(async () => fireEvent.click(screen.getByRole('tab', { name: 'b' })))
    expect(selected()).toEqual(['b'])
  })

  it('does not choose the option that takes the focus, on either track', async () => {
    for (const track of ['glass', 'plain'] as const) {
      const v = render(<Prova track={track} />)
      await act(async () => screen.getByRole('tab', { name: 'c' }).focus())
      expect(selected()).toEqual(['a'])
      v.unmount()
    }
  })

  it('is a glass track with a glass selection, or on glass a plain track with a full lens', () => {
    const glass = render(<Prova />)
    expect(screen.getByRole('tablist').classList.contains('lg-surface')).toBe(true)
    expect(indicator().classList.contains('lg-surface')).toBe(true)
    glass.unmount()
    // On glass or on a solid core neither is glass: the selection is the same moving indicator, drawn as a full lens.
    render(<Prova track="plain" />)
    expect(screen.getByRole('tablist').classList.contains('lg-surface')).toBe(false)
    expect(indicator().classList.contains('lg-surface')).toBe(false)
    expect(indicator().classList.contains('seg-lens')).toBe(true)
  })
})
