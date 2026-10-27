// @vitest-environment jsdom
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNotebookChat } from '../../src/main/notebook/chat'
import { fakeMedia } from '../../src/main/notebook/fake-media'
import { createIngestor } from '../../src/main/notebook/ingest'
import { isYoutubeUrl, youtubeId, transcribe } from '../../src/main/notebook/media'
import { readPdf, readTextDoc } from '../../src/main/notebook/readers'
import { notebookStore } from '../../src/main/notebook/store'
import { statusText } from '../../src/renderer/src/notebook/status'
import { NotebookView } from '../../src/renderer/src/notebook/NotebookView'
import { makePdf } from './helpers/pdf'

afterEach(cleanup)
Element.prototype.scrollIntoView = vi.fn()
const tmp = (): Promise<string> => mkdtemp(join(tmpdir(), 'sinapsi-f9n-'))

describe('YouTube links as people paste them', () => {
  it.each([
    ['www.youtube.com/watch?v=jNQXAC9IVRw', 'jNQXAC9IVRw'],
    ['http://youtu.be/jNQXAC9IVRw', 'jNQXAC9IVRw'],
    ['https://music.youtube.com/watch?v=jNQXAC9IVRw', 'jNQXAC9IVRw']
  ])('%s', (u, id) => {
    expect(isYoutubeUrl(u)).toBe(true)
    expect(youtubeId(u)).toBe(id)
  })
})

describe('readers', () => {
  it('strips the frontmatter of a file saved on Windows', () => {
    expect(readTextDoc('---\r\ntags: [x]\r\n---\r\n# Titolo\r\nTesto').segments[0].text).not.toContain('tags')
  })
  it('a scan with a printed running header is still a scan', async () => {
    const dir = await tmp()
    const f = join(dir, 'scan.pdf')
    await writeFile(f, makePdf(['Universita di Roma - Analisi 1 - pag. 1', 'Universita di Roma - Analisi 1 - pag. 2', 'Universita di Roma - Analisi 1 - pag. 3', 'Universita di Roma - Analisi 1 - pag. 4\nTeorema di Rolle: enunciato completo e dimostrazione.']))
    const t = await readPdf(f)
    expect(t.segments.map((s) => s.label)).toEqual(['p. 4'])
    expect(t.warnings[0]).toMatch(/^3 pagine senza testo/)
  })
})

describe('Whisper', () => {
  it('says when it is downloading its model the first time', async () => {
    const dir = await tmp()
    const stages: string[] = []
    await transcribe(fakeMedia(), join(dir, 'a.m4a'), dir, () => undefined, undefined, (s) => stages.push(s), join(dir, 'no-model-here'))
    expect(stages[0]).toBe('download')
    expect(statusText({ id: 's', notebookId: 'n', kind: 'audio', title: 'L', origin: 'l.m4a', addedAt: 1, status: 'processing', progress: 30, stage: 'download' } as never)).toBe('Scarico il modello di trascrizione (solo la prima volta)… 30%')
  })
})

describe('ingest', () => {
  async function setup(run = vi.fn(fakeMedia())) {
    const store = notebookStore(await tmp())
    const nb = await store.create('A')
    const ing = createIngestor({ store, run, readVault: vi.fn(async () => '# Rolle\nnuovo testo'), onChange: vi.fn() })
    return { store, nb, ing, run }
  }
  it('a document never waits behind a recording', async () => {
    let release!: () => void
    const base = fakeMedia()
    const run = vi.fn(async (cmd: string, args: string[], opts: { timeoutMs: number }) => {
      await new Promise<void>((r) => (release = r))
      return base(cmd, args, opts)
    })
    const { store, nb, ing } = await setup(run as never)
    const dir = await tmp()
    await writeFile(join(dir, 'lezione.m4a'), 'x')
    await writeFile(join(dir, 'note.md'), '# Note\ntesto')
    await ing.addFiles(nb, [join(dir, 'lezione.m4a')])
    await vi.waitFor(() => expect(run).toHaveBeenCalled())
    await ing.addFiles(nb, [join(dir, 'note.md')])
    await vi.waitFor(async () => expect((await store.notebooks())[0].sources.find((s) => s.kind === 'text')?.status).toBe('ready'))
    release()
    await ing.idle()
  })
  it('re-reads a vault note on "Aggiorna"', async () => {
    const { store, nb, ing } = await setup()
    const id = await ing.addVaultNote(nb, '/v/Rolle.md', 'Rolle')
    await ing.idle()
    await ing.refresh(id)
    await ing.idle()
    expect((await store.readText(id))!.segments[0].text).toContain('nuovo testo')
  })
  it('deletes a notebook with its sources and stops their work; quitting stops everything', async () => {
    let signal: AbortSignal | undefined
    const run = vi.fn(async (_c: string, _a: string[], opts: { signal?: AbortSignal }) => {
      signal = opts.signal
      await new Promise<void>((r) => opts.signal?.addEventListener('abort', () => r()))
      return { stdout: '', stderr: '', code: null, timedOut: false }
    })
    const { store, nb, ing } = await setup(run as never)
    const dir = await tmp()
    await writeFile(join(dir, 'l.m4a'), 'x')
    await ing.addFiles(nb, [join(dir, 'l.m4a')])
    await vi.waitFor(() => expect(run).toHaveBeenCalled())
    await ing.removeNotebook(nb)
    expect(signal?.aborted).toBe(true)
    expect(await store.notebooks()).toEqual([])
    const again = await setup(run as never)
    await again.ing.addFiles(again.nb, [join(dir, 'l.m4a')])
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2))
    again.ing.stopAll()
    expect(signal?.aborted).toBe(true)
  })
})

describe('chat', () => {
  it('refuses a second question while one is pending, and says it is busy', async () => {
    const store = notebookStore(await tmp())
    const nb = await store.create('A')
    await store.addSource({ id: 's1', notebookId: nb, kind: 'text', title: 'T', origin: 'x.md' })
    await store.writeText('s1', { segments: [{ label: 'a', text: 'b' }], warnings: [] })
    await store.setStatus('s1', { status: 'ready' })
    let release!: () => void
    const ask = vi.fn(async (req: { schema: { parse(x: unknown): unknown } }) => {
      await new Promise<void>((r) => (release = r))
      return { data: req.schema.parse({ claims: [], missing: 'x' }), fromCache: false, engine: 'agy' as const }
    })
    const chat = createNotebookChat({ bridge: { ask } as never, store, workDir: await tmp(), onTurn: vi.fn() })
    const first = chat.ask(nb, 'uno', ['s1'])
    await vi.waitFor(() => expect(ask).toHaveBeenCalled())
    expect(chat.busy(nb)).toBe(true)
    await expect(chat.ask(nb, 'due', ['s1'])).rejects.toThrow('una domanda in corso')
    release()
    await first
    expect(chat.busy(nb)).toBe(false)
  })
})

describe('the notebook view', () => {
  const NB = '11111111-1111-4111-8111-111111111111'
  function mount(over: Record<string, unknown> = {}) {
    let push: (e: { notebookId?: string }) => void = () => undefined
    const api = {
      notebook: {
        list: vi.fn(async () => [{ id: NB, name: 'A', subject: null, link: null, createdAt: 1, sources: [] }]),
        chat: vi.fn(async () => [
          { role: 'user', text: 'q', at: 1, sourceIds: [] },
          { role: 'assistant', at: 2, claims: [{ text: 'Risposta.', sources: [1] }], missing: null, dropped: 0, excerpts: [{ n: 1, sourceId: 'gone', title: 'Dispensa', label: 'p. 2', text: 'il passo citato' }] }
        ]),
        busy: vi.fn(async () => false),
        remove: vi.fn(async () => undefined),
        onUpdate: vi.fn((cb: typeof push) => ((push = cb), () => undefined)),
        ...over
      },
      vault: { index: vi.fn(async () => ({ root: '/v', scannedAt: 1, subjects: [], notes: [] })) },
      app: { openExternal: vi.fn() }
    }
    window.sinapsi = api as never
    const onBack = vi.fn()
    render(<NotebookView id={NB} onBack={onBack} />)
    return { api, onBack, push: (e: { notebookId?: string }) => act(() => push(e)) }
  }
  it('a citation of a removed source still shows the stored passage', async () => {
    mount()
    const chip = await screen.findByRole('button', { name: 'Fonte 1: Dispensa, p. 2' })
    await act(async () => fireEvent.click(chip))
    expect(screen.getByText('il passo citato')).toBeTruthy()
  })
  it('progress of the sources does not reload the chat', async () => {
    const { api, push } = mount()
    await screen.findByText('Risposta.')
    const n = api.notebook.chat.mock.calls.length
    await push({})
    expect(api.notebook.chat.mock.calls.length).toBe(n)
  })
  it('deletes the notebook after a confirmation', async () => {
    const { api, onBack } = mount()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const del = await screen.findByRole('button', { name: 'Elimina notebook' })
    await act(async () => fireEvent.click(del))
    expect(api.notebook.remove).toHaveBeenCalledWith(NB)
    expect(onBack).toHaveBeenCalled()
  })
  it('knows a question is pending when it is opened again', async () => {
    mount({ busy: vi.fn(async () => true) })
    expect(await screen.findByText('Cerco nelle tue fonti…')).toBeTruthy()
  })
})
