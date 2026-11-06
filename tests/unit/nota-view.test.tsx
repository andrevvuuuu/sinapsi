// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NotaView } from '../../src/renderer/src/nota/NotaView'
import { NotePicker } from '../../src/renderer/src/nota/NotePicker'
import { SessionView } from '../../src/renderer/src/session/SessionView'
import { parseNota } from '../../src/shared/nota-schema'
import type { NoteMeta, SessionState, StoredNote } from '../../src/shared/api'

afterEach(cleanup)
const ID = '11111111-1111-4111-8111-111111111111'
const raw = JSON.parse(readFileSync(join(__dirname, '../fixtures/nota-min.json'), 'utf8'))
raw.sections[0].blocks.push({ type: 'tryit', prompt: 'Calcola $f(0)$.', solution: 'Vale $-1+1$.' })
const { nota } = parseNota(raw)
const ready: StoredNote = { id: ID, createdAt: 1, updatedAt: 2, status: 'ready', sourcePath: '/v/Rolle.md', sourceTitle: 'Teorema di Rolle', dropped: 1, nota }
const PATH = '/vault/Matematica/Teorema di Rolle.md'

function mountNota(stored: StoredNote) {
  const notes = { get: vi.fn(async () => stored), onUpdate: () => () => undefined, retry: vi.fn(async () => undefined), create: vi.fn(), list: vi.fn(async () => []) }
  window.sinapsi = { notes } as never
  render(<NotaView id={ID} onBack={vi.fn()} />)
  return notes
}

describe('NotaView', () => {
  it('shows the title, the summary, the table of contents and the provenance', async () => {
    mountNota(ready)
    expect(await screen.findByRole('heading', { level: 1, name: /Teorema di Rolle/ })).toBeTruthy()
    expect(screen.getByText(/Weierstrass dà massimo e minimo/)).toBeTruthy()
    const toc = screen.getByRole('navigation', { name: 'Indice' })
    expect(toc.textContent).toContain('Enunciato')
    expect(toc.textContent).toContain('Dimostrazione')
    expect(screen.getByText('1 blocco scartato perché non valido')).toBeTruthy()
    expect(screen.getByText('Cosa ricordare', { exact: false })).toBeTruthy()
  })
  it('covers solutions in "Prova da solo"', async () => {
    mountNota(ready)
    expect(await screen.findByText(/Vale/)).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Prova da solo' }))
    expect(screen.queryByText(/Vale/)).toBeNull()
  })
  it('hides quizzes when the Quiz layer is switched off', async () => {
    mountNota(ready)
    expect(await screen.findByText(/garantisce l'unicità/)).toBeTruthy()
    const layer = screen.getByRole('button', { name: 'Quiz' })
    expect(layer.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(layer)
    expect(screen.queryByText(/garantisce l'unicità/)).toBeNull()
  })
  it('shows progress while generating', async () => {
    mountNota({ ...ready, status: 'generating', nota: undefined })
    expect(await screen.findByText('Sto scrivendo la nota viva…')).toBeTruthy()
    expect(screen.getByText(/Teorema di Rolle/)).toBeTruthy()
  })
  it('offers Riprova after an error', async () => {
    const notes = mountNota({ ...ready, status: 'error', error: 'Gemini ci ha messo troppo tempo.', nota: undefined })
    expect(await screen.findByText('Gemini ci ha messo troppo tempo.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Riprova' }))
    expect(notes.retry).toHaveBeenCalledWith(ID)
  })
})

describe('NotePicker', () => {
  const meta: NoteMeta = { id: ID, createdAt: Date.UTC(2026, 9, 26), updatedAt: 1, status: 'ready', sourcePath: PATH, sourceTitle: 'Teorema di Rolle', title: 'Teorema di Rolle' }
  function mountPicker(list: NoteMeta[]) {
    const onOpenNota = vi.fn()
    const notes = { list: vi.fn(async () => list), create: vi.fn(async () => '22222222-2222-4222-8222-222222222222'), onUpdate: () => () => undefined }
    const app = { openExternal: vi.fn(async () => undefined) }
    const vault = { index: vi.fn(async () => ({ root: '/vault', notes: [{ path: PATH, title: 'Teorema di Rolle', available: true }], subjects: [], scannedAt: 1 })) }
    const graph = {
      extract: vi.fn(async () => undefined),
      get: vi.fn(async () => ({ concepts: [{ id: 'n_a', notes: [PATH] }, { id: 'n_b', notes: ['/x.md'] }], chains: [], extracted: {} })),
      onChange: () => () => undefined
    }
    window.sinapsi = { notes, app, vault, graph } as never
    render(<NotePicker path={PATH} onOpenNota={onOpenNota} onBack={vi.fn()} />)
    return { notes, onOpenNota, app, graph }
  }
  it('does not extract on opening: only a note with a nota viva goes in the graph, and can be re-extracted', async () => {
    const { graph } = mountPicker([meta])
    expect(await screen.findByText('1 concetto nel grafo')).toBeTruthy()
    expect(graph.extract).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Estrai di nuovo i concetti' }))
    expect(graph.extract).toHaveBeenLastCalledWith(PATH)
  })
  it('without a nota viva it offers no extraction', async () => {
    mountPicker([])
    await screen.findByRole('button', { name: 'Crea la nota viva' })
    expect(screen.queryByRole('button', { name: 'Estrai di nuovo i concetti' })).toBeNull()
  })
  it('creates a nota viva from the Obsidian note and opens it', async () => {
    const { notes, onOpenNota } = mountPicker([])
    fireEvent.click(await screen.findByRole('button', { name: 'Crea la nota viva' }))
    expect(notes.create).toHaveBeenCalledWith({ sourcePath: PATH })
    await vi.waitFor(() => expect(onOpenNota).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222'))
  })
  it('lists the existing notes vive of that note', async () => {
    const { onOpenNota } = mountPicker([meta, { ...meta, id: 'x', sourcePath: '/altro.md' }])
    const open = await screen.findByRole('button', { name: /Apri la nota viva del/ })
    expect(screen.getAllByRole('button', { name: /Apri la nota viva del/ })).toHaveLength(1)
    fireEvent.click(open)
    expect(onOpenNota).toHaveBeenCalledWith(ID)
  })
  it('still opens the note in Obsidian', async () => {
    const { app } = mountPicker([])
    fireEvent.click(await screen.findByRole('button', { name: 'Apri in Obsidian' }))
    expect(app.openExternal).toHaveBeenCalledWith('obsidian://open?path=' + encodeURIComponent(PATH))
  })
})

describe('session summary', () => {
  const done: SessionState = {
    id: ID, topic: 'Rolle', noteTitle: 'Teorema di Rolle', phase: 'done', doneNodeIds: [], awaiting: 'learner', hasTeacherTurn: true, createdAt: 1, updatedAt: 1,
    summary: { learned: ['Fermat'], shaky: [], misconceptions: [] },
    items: [{ kind: 'teacher', turn: { phase: 'done', blocks: [{ type: 'text', md: 'Fine.' }], summary: { learned: ['Fermat'], shaky: [], misconceptions: [] } } }]
  }
  function mountSession(state: SessionState) {
    const notes = { create: vi.fn(async () => '33333333-3333-4333-8333-333333333333') }
    const onOpenNota = vi.fn()
    window.sinapsi = { session: { get: vi.fn(async () => state), onUpdate: () => () => undefined, retry: vi.fn(), answer: vi.fn(), say: vi.fn() }, notes } as never
    render(<SessionView id={ID} onBack={vi.fn()} onOpenNota={onOpenNota} />)
    return { notes, onOpenNota }
  }
  it('offers to write the nota viva when the session has a vault note', async () => {
    const { notes, onOpenNota } = mountSession({ ...done, notePath: PATH })
    fireEvent.click(await screen.findByRole('button', { name: 'Crea la nota viva' }))
    expect(notes.create).toHaveBeenCalledWith({ sessionId: ID })
    await vi.waitFor(() => expect(onOpenNota).toHaveBeenCalledWith('33333333-3333-4333-8333-333333333333'))
  })
  it('does not offer it without a vault note', async () => {
    mountSession(done)
    expect(await screen.findByText('Fine.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Crea la nota viva' })).toBeNull()
  })
})
