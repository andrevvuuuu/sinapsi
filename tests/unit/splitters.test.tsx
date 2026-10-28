// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Splitter } from '../../src/renderer/src/home/Splitter'
import { clampLayout, DEFAULT_LAYOUT, loadLayout } from '../../src/renderer/src/home/layout'
import Home from '../../src/renderer/src/home/Home'
import { settingsSchema } from '../../src/shared/settings-schema'

afterEach(cleanup)
beforeEach(() => {
  const data = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k), clear: () => data.clear() })
})

describe('Splitter', () => {
  it('moves with the keyboard within its limits', () => {
    const onChange = vi.fn()
    render(<Splitter orientation="vertical" label="Larghezza del pannello" value={300} min={220} max={480} onChange={onChange} />)
    const s = screen.getByRole('separator', { name: 'Larghezza del pannello' })
    expect(s.getAttribute('aria-valuenow')).toBe('300')
    fireEvent.keyDown(s, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith(316)
    fireEvent.keyDown(s, { key: 'End' })
    expect(onChange).toHaveBeenLastCalledWith(480)
    fireEvent.keyDown(s, { key: 'Home' })
    expect(onChange).toHaveBeenLastCalledWith(220)
  })
  it('follows the pointer, inverted for a panel on the right, and clamps', () => {
    const onChange = vi.fn()
    render(<Splitter orientation="vertical" label="Pannello destro" value={320} min={260} max={520} invert onChange={onChange} />)
    const s = screen.getByRole('separator')
    fireEvent.pointerDown(s, { clientX: 1000, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 960, pointerId: 1 })
    expect(onChange).toHaveBeenLastCalledWith(360)
    fireEvent.pointerMove(window, { clientX: 500, pointerId: 1 })
    expect(onChange).toHaveBeenLastCalledWith(520)
    fireEvent.pointerUp(window, { pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 900, pointerId: 1 })
    expect(onChange).toHaveBeenCalledTimes(2)
  })
})

describe('layout', () => {
  it('falls back to the defaults when the saved layout is missing or damaged', () => {
    expect(loadLayout()).toEqual(DEFAULT_LAYOUT)
    localStorage.setItem('sinapsi.layout.v1', '{rotto')
    expect(loadLayout()).toEqual(DEFAULT_LAYOUT)
  })
  it('keeps at least 360 px for the graph in a small window', () => {
    const l = clampLayout({ ...DEFAULT_LAYOUT, left: 480, right: 520 }, 1100, 800)
    expect(1100 - l.left - l.right).toBeGreaterThanOrEqual(360)
  })
  it('Home restores the saved sizes and saves new ones', async () => {
    localStorage.setItem('sinapsi.layout.v1', JSON.stringify({ ...DEFAULT_LAYOUT, left: 300, sessions: 260 }))
    const settings = settingsSchema('/x').parse({})
    window.sinapsi = {
      settings: { get: vi.fn(async () => settings), set: vi.fn(), chooseVault: vi.fn() },
      vault: { index: vi.fn(async () => ({ root: '/v', scannedAt: 0, subjects: [], notes: [] })), onChange: () => () => undefined },
      ai: { status: vi.fn(async () => ({ agy: 'idle', claude: 'idle' })), onStatus: () => () => undefined },
      app: { openExternal: vi.fn() }
    } as never
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
    render(<Home />)
    const left = await screen.findByRole('separator', { name: 'Larghezza del pannello sinistro' })
    expect(left.getAttribute('aria-valuenow')).toBe('300')
    expect(screen.getByRole('separator', { name: 'Altezza delle sessioni' }).getAttribute('aria-valuenow')).toBe('260')
    expect(screen.getByRole('separator', { name: 'Larghezza del pannello destro' })).toBeTruthy()
    expect(screen.getByRole('separator', { name: 'Altezza dei notebook' })).toBeTruthy()
    fireEvent.keyDown(left, { key: 'ArrowRight' })
    expect(JSON.parse(localStorage.getItem('sinapsi.layout.v1')!).left).toBe(316)
  })
})
