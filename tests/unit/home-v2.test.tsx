// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Home from '../../src/renderer/src/home/Home'
import type { VaultResult } from '../../src/shared/api'
import { settingsSchema } from '../../src/shared/settings-schema'

afterEach(cleanup)
const NB = '22222222-2222-4222-8222-222222222222'
const vnote = (title: string, folder: string, subject: string | null) => ({ path: `/v/${folder}/${title}.md`, title, folder, tags: [], aliases: [], links: [], headings: [], blockIds: [], subject, mtime: 0, size: 0, available: true })
const idx: VaultResult = { root: '/v', scannedAt: 0, subjects: [{ id: 'Analisi', color: '#f00' }], notes: [vnote('Teorema di Lagrange', 'Analisi', 'Analisi'), vnote('Glicolisi', 'Fisiologia', 'Fisiologia')] }

function mount(over: Record<string, unknown> = {}) {
  const settings = settingsSchema('/Users/x').parse({})
  const api = {
    settings: { get: vi.fn(async () => settings), set: vi.fn(async (p: object) => ({ ...settings, ...p })), chooseVault: vi.fn(async () => settings) },
    vault: { index: vi.fn(async () => idx), onChange: () => () => undefined },
    ai: { status: vi.fn(async () => ({ agy: 'idle', claude: 'idle' })), onStatus: () => () => undefined },
    app: { openExternal: vi.fn() },
    session: { list: vi.fn(async () => [{ id: 's1', topic: 'Derivate', phase: 'done', updatedAt: 3 }]), start: vi.fn() },
    practice: { list: vi.fn(async () => [{ id: 'p1', topic: 'Rolle, Lagrange', mode: 'train', done: true, updatedAt: 2 }]) },
    review: { memory: vi.fn(async () => ({})), sessions: vi.fn(async () => [{ id: 'r1', at: 1, count: 4, conceptIds: ['n_l'], topic: 'Teorema di Lagrange' }]) },
    notes: { list: vi.fn(async () => [{ id: 'nv1', createdAt: 1, updatedAt: 1, status: 'ready', sourcePath: '/v/Analisi/Teorema di Lagrange.md', sourceTitle: 'Teorema di Lagrange', title: 'Teorema di Lagrange' }]), onUpdate: () => () => undefined },
    notebook: { list: vi.fn(async () => [{ id: NB, name: 'Analisi 1', subject: null, link: null, createdAt: 1, sources: [] }]), create: vi.fn(async () => NB), chooseFiles: vi.fn(async () => ({ added: ['x'], rejected: [] })), onUpdate: () => () => undefined },
    ...over
  }
  window.sinapsi = api as never
  const props = { onOpenSession: vi.fn(), onOpenPracticeSession: vi.fn(), onOpenReview: vi.fn(), onOpenNota: vi.fn(), onOpenNotebook: vi.fn(), onOpenSource: vi.fn() }
  render(<Home {...props} />)
  return { api, props }
}

describe('left panel', () => {
  it('filters past sessions by kind, Ripasso included, and opens them', async () => {
    const { props } = mount()
    const kinds = await screen.findByRole('group', { name: 'Sessioni da mostrare' })
    expect(within(kinds).getAllByRole('button').map((b) => b.textContent)).toEqual(['Tutte', 'Apprendimento', 'Pratica', 'Ripasso'])
    const list = await screen.findByRole('list', { name: 'Sessioni passate' })
    expect(await within(list).findByText('Teorema di Lagrange')).toBeTruthy()
    expect(within(list).getAllByRole('button')).toHaveLength(3)
    fireEvent.click(within(kinds).getByRole('button', { name: 'Ripasso' }))
    fireEvent.click(within(list).getByRole('button', { name: /Teorema di Lagrange/ }))
    expect(props.onOpenReview).toHaveBeenCalledWith('', ['n_l'])
  })
  it('searches a past session by typing', async () => {
    mount()
    const list = await screen.findByRole('list', { name: 'Sessioni passate' })
    await within(list).findByText('Derivate')
    fireEvent.click(screen.getByRole('button', { name: 'Cerca una sessione' }))
    fireEvent.change(screen.getByLabelText('Cerca tra le sessioni'), { target: { value: 'rolle' } })
    expect(within(list).getAllByRole('button').map((b) => b.querySelector('.t')!.textContent)).toEqual(['Rolle, Lagrange'])
  })
  it('shows the notes vive in folders by topic', async () => {
    const { props } = mount()
    const nv = await screen.findByRole('region', { name: 'Note vive' })
    expect(within(nv).getByText('Analisi')).toBeTruthy()
    fireEvent.click(within(nv).getByRole('button', { name: /Teorema di Lagrange/ }))
    expect(props.onOpenNota).toHaveBeenCalledWith('nv1')
  })
  it('opens the app settings and saves them', async () => {
    const { api } = mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Impostazioni' }))
    const dlg = screen.getByRole('dialog', { name: 'Impostazioni' })
    fireEvent.change(within(dlg).getByLabelText('Note al giorno'), { target: { value: '9' } })
    fireEvent.change(within(dlg).getByLabelText('Motore · Note vive'), { target: { value: 'claude' } })
    await act(async () => fireEvent.click(within(dlg).getByRole('button', { name: 'Salva' })))
    expect(api.settings.set).toHaveBeenCalledWith(expect.objectContaining({ dailyExtractionLimit: 9, engines: expect.objectContaining({ note: { engine: 'claude', model: expect.any(String) } }) }))
  })
})

describe('settings dialog', () => {
  it('closes with Esc after changing the theme', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Impostazioni' }))
    const dlg = screen.getByRole('dialog', { name: 'Impostazioni' })
    const trattato = within(dlg).getByRole('button', { name: 'Trattato' })
    trattato.focus()
    await act(async () => fireEvent.click(trattato))
    expect(document.activeElement).toBe(trattato)
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Impostazioni' })).toBeNull()
  })
})

describe('right panel', () => {
  it('imports sources into a chosen notebook and opens it', async () => {
    const { api, props } = mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Importa fonti' }))
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Analisi 1' })))
    expect(api.notebook.chooseFiles).toHaveBeenCalledWith(NB)
    expect(props.onOpenNotebook).toHaveBeenCalledWith(NB)
  })
  it('creates a notebook first when there is none', async () => {
    const { api } = mount({ notebook: { list: vi.fn(async () => []), create: vi.fn(async () => NB), chooseFiles: vi.fn(async () => ({ added: [], rejected: [] })), onUpdate: () => () => undefined } })
    fireEvent.click(await screen.findByRole('button', { name: 'Importa fonti' }))
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Nuovo notebook…' })))
    expect(api.notebook.create).toHaveBeenCalledWith('Notebook')
  })
  it('holds the Obsidian notes by folder and the vault chooser', async () => {
    const { api, props } = mount()
    const obs = await screen.findByRole('region', { name: 'Note di Obsidian' })
    fireEvent.click(await within(obs).findByText('Fisiologia'))
    fireEvent.click(within(obs).getByText('Glicolisi'))
    expect(props.onOpenSource).toHaveBeenCalledWith('/v/Fisiologia/Glicolisi.md')
    fireEvent.click(screen.getByRole('button', { name: 'Cambia cartella del vault' }))
    expect(api.settings.chooseVault).toHaveBeenCalled()
  })
})

describe('centre', () => {
  it('keeps the mode slider detached above the field', async () => {
    mount()
    const modes = await screen.findByRole('group', { name: 'Tipo di sessione' })
    const field = screen.getByLabelText('Cosa vuoi studiare?')
    expect(modes.closest('.shell')).toBeNull()
    expect(field.closest('.shell')).toBeTruthy()
  })
  it('opens the graph menu from a round button, and Esc closes it giving focus back', async () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never
    mount({ graph: { get: vi.fn(async () => ({ concepts: [], chains: [], extracted: {} })), status: vi.fn(async () => ({ queued: [] })), onChange: () => () => undefined, positions: vi.fn(async () => ({})), savePositions: vi.fn(), extract: vi.fn() } })
    const btn = await screen.findByRole('button', { name: 'Vista del grafo' })
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('combobox', { name: 'Cerca nel grafo' })).toBeNull()
    fireEvent.click(btn)
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    const search = screen.getByRole('combobox', { name: 'Cerca nel grafo' })
    fireEvent.keyDown(search, { key: 'Escape' })
    fireEvent.keyDown(search, { key: 'Escape' })
    expect(screen.queryByRole('combobox', { name: 'Cerca nel grafo' })).toBeNull()
    expect(document.activeElement).toBe(btn)
  })
})
