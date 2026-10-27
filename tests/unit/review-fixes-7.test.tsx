// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsDialog } from '../../src/renderer/src/home/SettingsDialog'
import { NotebookPanel } from '../../src/renderer/src/home/NotebookPanel'
import { GraphView } from '../../src/renderer/src/graph/GraphView'
import { asMath } from '../../src/renderer/src/nota/math'
import { settingsSchema } from '../../src/shared/settings-schema'
import type { GraphData } from '../../src/shared/graph-types'
import type { VaultIndex } from '../../src/shared/vault-types'

afterEach(cleanup)

describe('settings dialog', () => {
  const settings = settingsSchema('/x').parse({})
  it.each([[''], ['abc']])('refuses "%s" as notes per day', async (v) => {
    const set = vi.fn()
    window.sinapsi = { settings: { set } } as never
    render(<SettingsDialog settings={settings} onTheme={vi.fn()} onSaved={vi.fn()} onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Note al giorno'), { target: { value: v } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Salva' })))
    expect(screen.getByRole('alert').textContent).toMatch(/Note al giorno/)
    expect(set).not.toHaveBeenCalled()
  })
  it('keeps Tab inside, and marks Esc as handled', () => {
    window.sinapsi = { settings: { set: vi.fn() } } as never
    render(<SettingsDialog settings={settings} onTheme={vi.fn()} onSaved={vi.fn()} onClose={vi.fn()} />)
    const dlg = screen.getByRole('dialog', { name: 'Impostazioni' })
    const save = within(dlg).getByRole('button', { name: 'Salva' })
    save.focus()
    fireEvent.keyDown(save, { key: 'Tab' })
    expect(dlg.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).not.toBe(save)
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    window.dispatchEvent(esc)
    expect(esc.defaultPrevented).toBe(true)
  })
  it('the switched engine gets that task’s default model', () => {
    const set = vi.fn(async () => settings)
    window.sinapsi = { settings: { set } } as never
    const s = { ...settings, engines: { ...settings.engines, variants: { engine: 'claude' as const, model: 'sonnet' } } }
    render(<SettingsDialog settings={s} onTheme={vi.fn()} onSaved={vi.fn()} onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Motore · Domande del Ripasso'), { target: { value: 'agy' } })
    expect((screen.getByLabelText('Modello · Domande del Ripasso') as HTMLInputElement).value).toBe('gemini-3.8-flash-high')
  })
})

describe('Importa fonti cancelled', () => {
  it('removes the notebook it had just created', async () => {
    const NB = '22222222-2222-4222-8222-222222222222'
    const api = { list: vi.fn(async () => []), create: vi.fn(async () => NB), remove: vi.fn(async () => undefined), chooseFiles: vi.fn(async () => ({ added: [], rejected: [] })), onUpdate: () => () => undefined }
    window.sinapsi = { notebook: api } as never
    const onOpen = vi.fn()
    render(<NotebookPanel onClose={vi.fn()} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: 'Importa fonti' }))
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Nuovo notebook…' })))
    expect(api.remove).toHaveBeenCalledWith(NB)
    expect(onOpen).not.toHaveBeenCalled()
  })
})

describe('Esc in the graph', () => {
  it('closing the menu keeps the selected concept', async () => {
    const noop = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'canvas' ? {} : () => undefined), set: () => true })
    HTMLCanvasElement.prototype.getContext = vi.fn(() => noop) as never
    const index: VaultIndex = { root: '/v', scannedAt: 1, subjects: [], notes: [{ path: '/v/R.md', title: 'R', folder: '', tags: [], aliases: [], links: [], headings: [], blockIds: [], subject: null, mtime: 1, size: 1, available: true }] }
    const graph: GraphData = { extracted: {}, chains: [], concepts: [{ id: 'n_r', name: 'Teorema di Rolle', statement: 'x', aliases: [], birth: '/v/R.md', notes: ['/v/R.md'], sections: {}, depth: 0 }] }
    window.sinapsi = { graph: { get: vi.fn(async () => graph), status: vi.fn(async () => ({ queued: [] })), extract: vi.fn(), onChange: () => () => undefined, positions: vi.fn(async () => ({})), savePositions: vi.fn(async () => undefined) } } as never
    render(<GraphView menuOpen index={index} onStudy={vi.fn()} onOpenNote={vi.fn()} />)
    const box = await screen.findByRole('combobox', { name: 'Cerca nel grafo' })
    fireEvent.change(box, { target: { value: 'rolle' } })
    fireEvent.click(await screen.findByRole('option', { name: /Teorema di Rolle/ }))
    expect(screen.getByRole('dialog', { name: 'Dettagli' })).toBeTruthy()
    const menuBtn = screen.getByRole('button', { name: 'Vista del grafo' })
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Cerca nel grafo' }), { key: 'Escape' })
    expect(screen.queryByRole('combobox', { name: 'Cerca nel grafo' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Dettagli' })).toBeTruthy()
    fireEvent.click(menuBtn)
    fireEvent.keyDown(menuBtn, { key: 'Escape' })
    expect(screen.queryByRole('combobox', { name: 'Cerca nel grafo' })).toBeNull()
  })
})

describe('asMath and braces', () => {
  it('leaves prose with braces alone', () => {
    expect(asMath('insieme {1,2}')).toBe('insieme {1,2}')
  })
})
