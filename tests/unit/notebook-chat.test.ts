import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildAskPrompt, createNotebookChat, groundReply, NotebookReplySchema } from '../../src/main/notebook/chat'
import { notebookStore, type NotebookStore } from '../../src/main/notebook/store'
import type { Excerpt } from '../../src/shared/notebook-types'

const ex = (n: number, text = `testo ${n}`): Excerpt => ({ n, sourceId: 's1', title: 'Dispensa', label: `p. ${n}`, text })

describe('prompt', () => {
  it('forbids general knowledge, tools and the web, and lists the excerpts with their place', () => {
    const p = buildAskPrompt({
      notebookName: 'Analisi',
      excerpts: [ex(1, 'Rolle si chiama lemma del cammello.'), { ...ex(2), sourceId: 's2', title: 'Lezione', label: '12:05', start: 725 }],
      history: [
        { role: 'user', text: 'Che cos’è Rolle?', at: 1, sourceIds: [] },
        { role: 'assistant', at: 2, claims: [{ text: 'Un teorema.', sources: [1] }], missing: null, dropped: 0, excerpts: [] }
      ],
      question: 'Come si chiama nel corso?'
    })
    expect(p).toContain('SOLO')
    expect(p).toContain('Non usare la tua conoscenza generale')
    expect(p).toContain('non usare strumenti, non cercare sul web')
    expect(p).toContain('[1] (Dispensa, p. 1) Rolle si chiama lemma del cammello.')
    expect(p).toContain('[2] (Lezione, 12:05) testo 2')
    expect(p).toMatch(/CONVERSAZIONE PRECEDENTE \(non è una fonte/)
    expect(p).toContain('Andrea: Che cos’è Rolle?')
    expect(p).toContain('Notebook: Un teorema.')
    expect(p).toContain('DOMANDA\nCome si chiama nel corso?')
    expect(p).toContain('"missing"')
  })
})

describe('reply schema and grounding', () => {
  it('accepts a single number or numeric strings as sources, and a missing "null"', () => {
    const r = NotebookReplySchema.parse({ claims: [{ text: 'a', sources: 2 }, { text: 'b', sources: ['1', '[3]'] }], missing: 'null' })
    expect(r).toEqual({ claims: [{ text: 'a', sources: [2] }, { text: 'b', sources: [1, 3] }], missing: null })
    expect(NotebookReplySchema.parse({ claims: [] })).toEqual({ claims: [], missing: null })
  })
  it('keeps only valid citations and drops claims left without one', () => {
    const g = groundReply(
      { claims: [{ text: 'Vero [1].', sources: [1, 9] }, { text: 'Inventato.', sources: [] }, { text: 'Citazione falsa.', sources: [7] }, { text: '  ', sources: [1] }], missing: 'L’anno.' },
      [ex(1), ex(2)]
    )
    expect(g).toEqual({ claims: [{ text: 'Vero.', sources: [1] }], missing: 'L’anno.', dropped: 2 })
  })
})

let dir: string
let store: NotebookStore
let nb: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sinapsi-chat-'))
  store = notebookStore(dir, () => 5)
  nb = await store.create('Analisi')
  await store.addSource({ id: 's1', notebookId: nb, kind: 'pdf', title: 'Dispensa', origin: 'd.pdf' })
  await store.writeText('s1', { segments: [{ label: 'p. 1', text: 'Rolle: f(a)=f(b).' }, { label: 'p. 2', text: 'Nel corso è il lemma del cammello.' }], warnings: [] })
  await store.setStatus('s1', { status: 'ready' })
  await store.addSource({ id: 's2', notebookId: nb, kind: 'text', title: 'Altro', origin: 'a.md' })
  await store.writeText('s2', { segments: [{ label: 'inizio', text: 'Non selezionata.' }], warnings: [] })
  await store.setStatus('s2', { status: 'ready' })
})

function setup(reply: unknown = { claims: [{ text: 'Si chiama lemma del cammello.', sources: [2] }], missing: null }) {
  const ask = vi.fn(async (req: { schema: { parse(x: unknown): unknown } }) => ({ data: req.schema.parse(reply), fromCache: false, engine: 'agy' as const }))
  const onTurn = vi.fn()
  const chat = createNotebookChat({ bridge: { ask } as never, store, workDir: join(dir, 'w'), now: () => 9, onTurn })
  return { chat, ask, onTurn }
}

describe('ask', () => {
  it('asks Gemini over the selected ready sources only and keeps the cited excerpts', async () => {
    const { chat, ask, onTurn } = setup()
    await chat.ask(nb, 'Come si chiama Rolle nel corso?', ['s1'])
    const req = ask.mock.calls[0][0] as unknown as { task: string; prompt: string; timeoutMs: number; cwd: string }
    expect(req).toMatchObject({ task: 'notebook', timeoutMs: 180_000, cwd: join(dir, 'w') })
    expect(req.prompt).toContain('[2] (Dispensa, p. 2) Nel corso è il lemma del cammello.')
    expect(req.prompt).not.toContain('Non selezionata.')
    const turns = await store.chat(nb)
    expect(turns[0]).toEqual({ role: 'user', text: 'Come si chiama Rolle nel corso?', at: 9, sourceIds: ['s1'] })
    expect(turns[1]).toEqual({
      role: 'assistant',
      at: 9,
      claims: [{ text: 'Si chiama lemma del cammello.', sources: [2] }],
      missing: null,
      dropped: 0,
      excerpts: [{ n: 2, sourceId: 's1', title: 'Dispensa', label: 'p. 2', text: 'Nel corso è il lemma del cammello.' }]
    })
    expect(onTurn).toHaveBeenCalledWith(nb)
  })
  it('says so when the answer has nothing grounded', async () => {
    const { chat } = setup({ claims: [{ text: 'Lo so io.', sources: [] }], missing: null })
    await chat.ask(nb, 'Chi era Rolle?', ['s1'])
    const a = (await store.chat(nb))[1]
    expect(a).toMatchObject({ role: 'assistant', claims: [], dropped: 1, missing: 'Le fonti selezionate non rispondono a questa domanda.' })
  })
  it('records an error turn when the engine fails', async () => {
    const ask = vi.fn(async () => Promise.reject(new Error('agy: quota finita')))
    const chat = createNotebookChat({ bridge: { ask } as never, store, workDir: dir, now: () => 9, onTurn: vi.fn() })
    await chat.ask(nb, 'x', ['s1'])
    expect((await store.chat(nb))[1]).toEqual({ role: 'error', at: 9, text: 'agy: quota finita' })
  })
  it('refuses to answer without ready sources, without calling the AI', async () => {
    await store.setStatus('s1', { status: 'failed', error: 'x' })
    const { chat, ask } = setup()
    await chat.ask(nb, 'x', ['s1'])
    expect(ask).not.toHaveBeenCalled()
    expect((await store.chat(nb))[1]).toMatchObject({ role: 'error', text: 'Nessuna fonte pronta tra quelle selezionate.' })
  })
})

describe('work folder', () => {
  it('creates the AI work folder before calling the engine (a missing cwd looks like a missing program)', async () => {
    const { existsSync } = await import('node:fs')
    const work = join(dir, 'non-ancora', 'w')
    let existed = false
    const ask = vi.fn(async (req: { cwd: string; schema: { parse(x: unknown): unknown } }) => {
      existed = existsSync(req.cwd)
      return { data: req.schema.parse({ claims: [], missing: 'x' }), fromCache: false, engine: 'agy' as const }
    })
    const chat = createNotebookChat({ bridge: { ask } as never, store, workDir: work, onTurn: vi.fn() })
    await chat.ask(nb, 'x', ['s1'])
    expect(existed).toBe(true)
  })
})
