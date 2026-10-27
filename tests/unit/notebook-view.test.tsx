// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NotebookPanel } from '../../src/renderer/src/home/NotebookPanel'
import { NotebookView } from '../../src/renderer/src/notebook/NotebookView'
import type { ChatTurn, Notebook } from '../../src/shared/notebook-types'

afterEach(cleanup)
Element.prototype.scrollIntoView = vi.fn()

const NB = '11111111-1111-4111-8111-111111111111'
const nb = (over: Partial<Notebook> = {}): Notebook => ({
  id: NB,
  name: 'Analisi 1',
  subject: null,
  link: null,
  createdAt: 1,
  sources: [
    { id: 's1', notebookId: NB, kind: 'pdf', title: 'Dispensa', origin: 'd.pdf', addedAt: 1, status: 'ready', info: '12 pagine' },
    { id: 's2', notebookId: NB, kind: 'audio', title: 'Lezione 3', origin: 'l.m4a', addedAt: 2, status: 'processing', progress: 42 },
    { id: 's3', notebookId: NB, kind: 'youtube', title: 'Video', origin: 'https://youtu.be/abcdefghijk', addedAt: 3, status: 'failed', error: 'yt-dlp non è riuscito' },
    { id: 's4', notebookId: NB, kind: 'text', title: 'Appunti', origin: 'a.md', addedAt: 4, status: 'ready', info: '3 sezioni' }
  ],
  ...over
})
const answer: ChatTurn = {
  role: 'assistant',
  at: 2,
  claims: [{ text: 'Nel corso si chiama lemma del cammello.', sources: [2] }],
  missing: 'Chi lo ha dimostrato.',
  dropped: 1,
  excerpts: [{ n: 2, sourceId: 's1', title: 'Dispensa', label: 'p. 2', text: 'lemma del cammello' }]
}

function mount(notebook = nb(), turns: ChatTurn[] = []) {
  const api = {
    notebook: {
      list: vi.fn(async () => [notebook]),
      create: vi.fn(async () => NB),
      update: vi.fn(async () => undefined),
      chat: vi.fn(async () => turns),
      ask: vi.fn(async () => undefined),
      chooseFiles: vi.fn(async () => ({ added: [], rejected: [] })),
      addFiles: vi.fn(async () => ({ added: [], rejected: ['foto.heic'] })),
      addYoutube: vi.fn(async () => 'x'),
      addVault: vi.fn(async () => 'x'),
      retrySource: vi.fn(async () => undefined),
      removeSource: vi.fn(async () => undefined),
      text: vi.fn(async () => ({ segments: [{ label: 'p. 1', text: 'Enunciato.' }, { label: 'p. 2', text: 'Nel corso: lemma del cammello.' }], warnings: [] })),
      openFile: vi.fn(async () => undefined),
      pathForFile: vi.fn((f: File) => `/Users/a/${f.name}`),
      onUpdate: vi.fn(() => () => undefined)
    },
    vault: { index: vi.fn(async () => ({ root: '/v', scannedAt: 1, subjects: [{ id: 'Analisi', color: '#f00' }], notes: [{ path: '/v/Rolle.md', title: 'Rolle', available: true, subject: 'Analisi' }] })) },
    app: { openExternal: vi.fn(async () => undefined) }
  }
  window.sinapsi = api as never
  render(<NotebookView id={NB} onBack={vi.fn()} />)
  return api
}

describe('NotebookView sources', () => {
  it('shows each source with what is happening to it', async () => {
    const api = mount()
    const list = await screen.findByRole('list', { name: 'Fonti' })
    expect(within(list).getByText('12 pagine')).toBeTruthy()
    expect(within(list).getByText('Trascrivo… 42%')).toBeTruthy()
    expect(within(list).getByText('yt-dlp non è riuscito')).toBeTruthy()
    fireEvent.click(within(list).getByRole('button', { name: 'Riprova Video' }))
    expect(api.notebook.retrySource).toHaveBeenCalledWith('s3')
  })
  it('adds a YouTube link and says which dropped files it cannot import', async () => {
    const api = mount()
    fireEvent.click(await screen.findByRole('button', { name: 'YouTube' }))
    fireEvent.change(screen.getByLabelText('Link del video'), { target: { value: 'https://youtu.be/abcdefghijk' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi' }))
    expect(api.notebook.addYoutube).toHaveBeenCalledWith(NB, 'https://youtu.be/abcdefghijk')
    const drop = screen.getByRole('list', { name: 'Fonti' }).closest('section')!
    await act(async () => fireEvent.drop(drop, { dataTransfer: { files: [new File(['x'], 'foto.heic')] } }))
    expect(api.notebook.addFiles).toHaveBeenCalledWith(NB, ['/Users/a/foto.heic'])
    expect(screen.getByRole('alert').textContent).toContain('foto.heic')
  })
})

describe('NotebookView chat', () => {
  it('asks with the selected ready sources only, and says how many', async () => {
    const api = mount()
    expect(await screen.findByText('Risponde solo dalle fonti selezionate (2 di 2 pronte)')).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Usa Appunti' }))
    expect(screen.getByText('Risponde solo dalle fonti selezionate (1 di 2 pronte)')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Chiedi alle tue fonti'), { target: { value: 'Come si chiama Rolle?' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Chiedi' })))
    expect(api.notebook.ask).toHaveBeenCalledWith(NB, 'Come si chiama Rolle?', ['s1'])
  })
  it('shows citations, what the sources do not say and the removed sentences, and opens the cited passage', async () => {
    const api = mount(nb(), [{ role: 'user', text: 'Come si chiama?', at: 1, sourceIds: ['s1'] }, answer])
    expect(await screen.findByText('Nel corso si chiama lemma del cammello.')).toBeTruthy()
    expect(screen.getByText('Le fonti non dicono')).toBeTruthy()
    expect(screen.getByText('Chi lo ha dimostrato.')).toBeTruthy()
    expect(screen.getByText('Ho tolto 1 frase che non citava le fonti.')).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Fonte 2: Dispensa, p. 2' })))
    const viewer = await screen.findByRole('complementary', { name: 'Dispensa' })
    expect(api.notebook.text).toHaveBeenCalledWith('s1')
    expect(within(viewer).getByText('lemma del cammello', { selector: 'mark' })).toBeTruthy()
  })
})

describe('NotebookLM link', () => {
  it('refuses a link that is not NotebookLM and saves a good one', async () => {
    const api = mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Collega NotebookLM' }))
    const input = screen.getByLabelText('Link del notebook su NotebookLM')
    fireEvent.change(input, { target: { value: 'https://google.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva link' }))
    expect(screen.getByRole('alert').textContent).toContain('https://notebooklm.google.com/')
    expect(api.notebook.update).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: ' https://notebooklm.google.com/notebook/abc ' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Salva link' })))
    expect(api.notebook.update).toHaveBeenCalledWith(NB, { link: 'https://notebooklm.google.com/notebook/abc' })
  })
  it('opens the linked notebook', async () => {
    const api = mount(nb({ link: 'https://notebooklm.google.com/notebook/abc' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Apri in NotebookLM' }))
    expect(api.app.openExternal).toHaveBeenCalledWith('https://notebooklm.google.com/notebook/abc')
  })
})

describe('NotebookPanel', () => {
  it('lists notebooks and creates a new one', async () => {
    const api = mount()
    cleanup()
    const onOpen = vi.fn()
    render(<NotebookPanel onClose={vi.fn()} onOpen={onOpen} />)
    fireEvent.click(await screen.findByRole('button', { name: /Analisi 1/ }))
    expect(onOpen).toHaveBeenCalledWith(NB)
    fireEvent.click(screen.getByRole('button', { name: 'Nuovo notebook' }))
    fireEvent.change(screen.getByLabelText('Nome del notebook'), { target: { value: 'Fisiologia' } })
    await act(async () => fireEvent.submit(screen.getByLabelText('Nome del notebook').closest('form')!))
    expect(api.notebook.create).toHaveBeenCalledWith('Fisiologia')
    expect(onOpen).toHaveBeenLastCalledWith(NB)
  })
})

describe('scrolling', () => {
  it('survives a scrollIntoView that returns a promise (newer Chromium) when the answer arrives', async () => {
    const before = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = vi.fn(() => Promise.resolve()) as never
    try {
      let turns: ChatTurn[] = []
      const api = mount(nb(), turns)
      let notify: (e: { notebookId?: string }) => void = () => undefined
      api.notebook.onUpdate.mockImplementation(((cb: typeof notify) => ((notify = cb), () => undefined)) as never)
      cleanup()
      render(<NotebookView id={NB} onBack={vi.fn()} />)
      await screen.findByText('Chiedi alle tue fonti', { selector: 'h2' })
      turns = [{ role: 'user', text: 'Domanda?', at: 1, sourceIds: ['s1'] }, answer]
      api.notebook.chat.mockImplementation(async () => turns)
      await act(async () => notify({ notebookId: NB }))
      expect(await screen.findByText('Nel corso si chiama lemma del cammello.')).toBeTruthy()
      await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Fonte 2: Dispensa, p. 2' })))
      await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Chiudi la fonte' })))
    } finally {
      Element.prototype.scrollIntoView = before
    }
  })
})

describe('partial reading', () => {
  it('says how much of long sources an answer read', async () => {
    mount(nb(), [{ role: 'user', text: 'Riassumi', at: 1, sourceIds: ['s1'] }, { ...answer, coverage: { used: 40, total: 200 } } as ChatTurn])
    expect(await screen.findByText('Ho letto i 40 passaggi più pertinenti su 200: per domande su tutto, seleziona meno fonti.')).toBeTruthy()
  })
})
