// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsDialog } from '../../src/renderer/src/home/SettingsDialog'
import { DEFAULT_ENGINES, type Settings } from '../../src/shared/settings-schema'

afterEach(cleanup)

const settings = { theme: 'trattato', engines: DEFAULT_ENGINES, backgroundExtraction: true, dailyExtractionLimit: 6, reviewSessionSize: 8, gamesInSessions: true } as Settings

/** The glass light switch is the only theme control: it takes the focus when the dialog opens and is on the Tab cycle, and neither may change the theme. */
describe('settings dialog focus', () => {
  it('opens on the theme switch without changing the theme', async () => {
    window.sinapsi = { settings: { set: vi.fn() } } as never
    const onTheme = vi.fn()
    await act(async () => {
      render(<SettingsDialog settings={settings} onTheme={onTheme} onSaved={vi.fn()} onClose={vi.fn()} />)
    })
    expect(document.activeElement).toBe(screen.getByRole('switch'))
    expect(screen.queryByRole('tab', { name: 'Sistema' })).toBeNull()
    expect(onTheme).not.toHaveBeenCalled()
  })

  it('cycles with Tab only through what Tab reaches, and never changes the theme', async () => {
    window.sinapsi = { settings: { set: vi.fn() } } as never
    const onTheme = vi.fn()
    await act(async () => {
      render(<SettingsDialog settings={settings} onTheme={onTheme} onSaved={vi.fn()} onClose={vi.fn()} />)
    })
    const seen = new Set<Element | null>()
    for (let i = 0; i < 40; i++) {
      await act(async () => void fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: i >= 20 }))
      seen.add(document.activeElement)
      expect(document.activeElement?.getAttribute('tabindex')).not.toBe('-1')
    }
    expect(seen.has(screen.getByRole('button', { name: 'Chiudi le impostazioni' }))).toBe(true)
    expect(onTheme).not.toHaveBeenCalled()
  })

  it('changes the theme on a deliberate choice', async () => {
    window.sinapsi = { settings: { set: vi.fn() } } as never
    const onTheme = vi.fn()
    await act(async () => {
      render(<SettingsDialog settings={settings} onTheme={onTheme} onSaved={vi.fn()} onClose={vi.fn()} />)
    })
    const sw = screen.getByRole('switch')
    expect(sw.getAttribute('aria-checked')).toBe('true')
    await act(async () => void fireEvent.keyDown(sw, { key: 'Enter' }))
    expect(onTheme).toHaveBeenCalledWith('lavagna')
  })

  it('saves the optional study pacing toggles', async () => {
    const set = vi.fn(async (p: Partial<Settings>) => ({ ...settings, ...p }))
    window.sinapsi = { settings: { set } } as never
    await act(async () => {
      render(<SettingsDialog settings={settings} onTheme={vi.fn()} onSaved={vi.fn()} onClose={vi.fn()} />)
    })
    await act(async () => void fireEvent.click(screen.getByRole('checkbox', { name: /Micro-pause/ })))
    await act(async () => void fireEvent.click(screen.getByRole('checkbox', { name: /Limite di durata/ })))
    await act(async () => void fireEvent.change(screen.getByRole('spinbutton', { name: /Durata massima/ }), { target: { value: '60' } }))
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Salva' })))
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ microPauses: true, sessionLimit: true, sessionLimitMinutes: 60 }))
  })
})
