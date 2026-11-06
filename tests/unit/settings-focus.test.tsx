// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsDialog } from '../../src/renderer/src/home/SettingsDialog'
import { DEFAULT_ENGINES, type Settings } from '../../src/shared/settings-schema'

afterEach(cleanup)

const settings = { theme: 'trattato', engines: DEFAULT_ENGINES, backgroundExtraction: true, dailyExtractionLimit: 6, reviewSessionSize: 8, gamesInSessions: true } as Settings

/** The theme picker takes the focus when the dialog opens and is on the Tab cycle: neither may change the theme. */
describe('settings dialog focus', () => {
  it('opens on the chosen theme without choosing another one', async () => {
    window.sinapsi = { settings: { set: vi.fn() } } as never
    const onTheme = vi.fn()
    await act(async () => {
      render(<SettingsDialog settings={settings} onTheme={onTheme} onSaved={vi.fn()} onClose={vi.fn()} />)
    })
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Trattato' }))
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

  it('changes the theme on a deliberate choice: arrows move the focus, a click chooses', async () => {
    window.sinapsi = { settings: { set: vi.fn() } } as never
    const onTheme = vi.fn()
    await act(async () => {
      render(<SettingsDialog settings={settings} onTheme={onTheme} onSaved={vi.fn()} onClose={vi.fn()} />)
    })
    const trattato = screen.getByRole('tab', { name: 'Trattato' })
    await act(async () => trattato.focus())
    await act(async () => void fireEvent.keyDown(trattato, { key: 'ArrowRight' }))
    // The arrow moved the focus to another option (where it lands is Base UI's): that alone chooses nothing.
    expect(document.activeElement).not.toBe(trattato)
    expect(onTheme).not.toHaveBeenCalled()
    const sistema = screen.getByRole('tab', { name: 'Sistema' })
    await act(async () => void fireEvent.click(sistema))
    expect(onTheme).toHaveBeenCalledWith('system')
  })
})
