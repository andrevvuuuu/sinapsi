import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { makeNotebookHandlers } from '../../src/main/ipc-handlers'
import { notebookSourcesFor } from '../../src/main/notebook/for-notes'
import { notebookStore } from '../../src/main/notebook/store'
import { buildNotePrompt } from '../../src/main/notes/prompt'
import type { VaultIndex, VaultNote } from '../../src/shared/vault-types'

const vnote = (title: string, subject: string | null): VaultNote => ({ path: `/v/${title}.md`, title, folder: '', tags: [], aliases: [], links: [], headings: [], blockIds: [], subject, mtime: 1, size: 1, available: true })
const index: VaultIndex = { root: '/v', scannedAt: 1, subjects: [], notes: [vnote('Rolle', 'Analisi'), vnote('Lagrange', 'Analisi')] }

async function setup() {
  const store = notebookStore(await mkdtemp(join(tmpdir(), 'sinapsi-ipcnb-')))
  const nb = await store.create('Analisi')
  const ingest = {
    addFiles: vi.fn(async () => ({ added: [], rejected: [] })),
    addYoutube: vi.fn(async () => 'id'),
    addVaultNote: vi.fn(async () => 'id'),
    retry: vi.fn(),
    remove: vi.fn(),
    decorate: vi.fn((x) => x)
  }
  const chat = { ask: vi.fn(async () => undefined) }
  const h = makeNotebookHandlers({ store, ingest: ingest as never, chat, vault: async () => index, chooseFiles: async () => ['/Users/a/x.pdf'], openPath: vi.fn() })
  return { h, store, nb, ingest, chat }
}

describe('notebook handlers', () => {
  it('validates names and NotebookLM links', async () => {
    const { h, nb, store } = await setup()
    await expect(h.create('')).rejects.toThrow()
    await expect(h.update(nb, { link: 'https://evil.com/notebooklm.google.com' })).rejects.toThrow()
    await expect(h.update(nb, { link: 'javascript:alert(1)' })).rejects.toThrow()
    await h.update(nb, { link: 'https://notebooklm.google.com/notebook/abc', subject: 'Analisi' })
    await h.update(nb, { name: '  Analisi 1 ' })
    expect((await store.notebooks())[0]).toMatchObject({ name: 'Analisi 1', link: 'https://notebooklm.google.com/notebook/abc', subject: 'Analisi' })
    await h.update(nb, { link: null })
    expect((await store.notebooks())[0].link).toBeNull()
    await expect(h.update(nb, { color: 'red' })).rejects.toThrow()
  })
  it('only adds sources to a notebook that exists, from absolute paths and real vault notes', async () => {
    const { h, nb, ingest } = await setup()
    await expect(h.addFiles('11111111-1111-4111-8111-111111111111', ['/a.pdf'])).rejects.toThrow('Notebook non trovato')
    await expect(h.addFiles(nb, ['relativo.pdf'])).rejects.toThrow()
    await h.addFiles(nb, ['/Users/a/b.pdf'])
    expect(ingest.addFiles).toHaveBeenCalledWith(nb, ['/Users/a/b.pdf'])
    await expect(h.addVault(nb, '/etc/passwd')).rejects.toThrow('Nota non trovata nel vault')
    await h.addVault(nb, '/v/Rolle.md')
    expect(ingest.addVaultNote).toHaveBeenCalledWith(nb, '/v/Rolle.md', 'Rolle')
    await h.chooseFiles(nb)
    expect(ingest.addFiles).toHaveBeenLastCalledWith(nb, ['/Users/a/x.pdf'])
  })
  it('passes a question with its selected sources', async () => {
    const { h, nb, chat } = await setup()
    await expect(h.ask(nb, '  ', [])).rejects.toThrow()
    await expect(h.ask(nb, 'Che cos’è?', ['../x'])).rejects.toThrow()
    await h.ask(nb, 'Che cos’è?', [])
    expect(chat.ask).toHaveBeenCalledWith(nb, 'Che cos’è?', [])
  })
})

describe('nota viva with notebook sources', () => {
  it('adds a sources section to the prompt only when there are excerpts', () => {
    const without = buildNotePrompt({ noteTitle: 'Rolle', noteText: 'x' })
    expect(without).not.toContain('FONTI DEL NOTEBOOK')
    const p = buildNotePrompt({ noteTitle: 'Rolle', noteText: 'x', sources: [{ n: 1, sourceId: 's', title: 'Dispensa', label: 'p. 12', text: 'Lemma del cammello.' }] })
    expect(p).toContain('FONTI DEL NOTEBOOK')
    expect(p).toContain('(Dispensa, p. 12) Lemma del cammello.')
    expect(p).toContain('la nota Obsidian resta la base')
  })
  it('takes excerpts from the notebooks of the note subject only', async () => {
    const store = notebookStore(await mkdtemp(join(tmpdir(), 'sinapsi-fornotes-')))
    const a = await store.create('Analisi')
    const b = await store.create('Fisiologia')
    await store.update(a, { subject: 'Analisi' })
    await store.update(b, { subject: 'Biologia' })
    for (const [id, nb, text] of [['s1', a, 'Rolle: nel corso è il lemma del cammello.'], ['s2', b, 'Rolle in biologia? No: glicolisi.']] as const) {
      await store.addSource({ id, notebookId: nb, kind: 'text', title: id, origin: 'x.md' })
      await store.writeText(id, { segments: [{ label: 'inizio', text }], warnings: [] })
      await store.setStatus(id, { status: 'ready' })
    }
    const find = notebookSourcesFor({ store, vault: async () => index })
    const ex = await find('/v/Rolle.md', 'Rolle', '## Enunciato')
    expect(ex.map((e) => e.sourceId)).toEqual(['s1'])
    expect(await find('/v/Altro.md', 'Altro', '')).toEqual([])
  })
})
