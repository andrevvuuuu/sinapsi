import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { makeNotebookHandlers } from '../../src/main/ipc-handlers'
import { notebookSourcesFor } from '../../src/main/notebook/for-notes'
import { notebookStore } from '../../src/main/notebook/store'
import { buildNotePrompt } from '../../src/main/notes/prompt'

async function setup() {
  const store = notebookStore(await mkdtemp(join(tmpdir(), 'sinapsi-ipcnb-')))
  const nb = await store.bucketFor('Analisi')
  const ingest = {
    addFiles: vi.fn(async () => ({ added: [], rejected: [] })),
    addYoutube: vi.fn(async () => 'id'),
    retry: vi.fn(),
    remove: vi.fn(),
    removeNotebook: vi.fn(),
    decorate: vi.fn((x) => x)
  }
  const h = makeNotebookHandlers({
    store,
    ingest: ingest as never,
    chooseFiles: async () => ['/Users/a/x.pdf']
  })
  return { h, store, nb, ingest }
}

describe('notebook handlers', () => {
  it('returns the subject bucket, creating it when missing', async () => {
    const { h, store } = await setup()
    const id = await h.bucketFor(' Fisica ')
    expect(await h.bucketFor('Fisica')).toBe(id)
    expect((await store.notebooks()).find((n) => n.id === id)).toMatchObject({
      name: 'Fisica',
      subject: 'Fisica'
    })
    await expect(h.bucketFor('   ')).rejects.toThrow()
    await expect(h.bucketFor('x'.repeat(201))).rejects.toThrow()
  })
  it('only adds sources to an existing notebook, from absolute paths', async () => {
    const { h, nb, ingest } = await setup()
    await expect(h.addFiles('11111111-1111-4111-8111-111111111111', ['/a.pdf'])).rejects.toThrow(
      'Notebook non trovato'
    )
    await expect(h.addFiles(nb, ['relativo.pdf'])).rejects.toThrow()
    await h.addFiles(nb, ['/Users/a/b.pdf'])
    expect(ingest.addFiles).toHaveBeenCalledWith(nb, ['/Users/a/b.pdf'])
    await h.chooseFiles(nb)
    expect(ingest.addFiles).toHaveBeenLastCalledWith(nb, ['/Users/a/x.pdf'])
  })
})

describe('nota viva with notebook sources', () => {
  it('adds a sources section to the prompt only when there are excerpts', () => {
    const without = buildNotePrompt({ noteTitle: 'Rolle', noteText: 'x' })
    expect(without).not.toContain('FONTI DEL NOTEBOOK')
    const p = buildNotePrompt({
      noteTitle: 'Rolle',
      noteText: 'x',
      sources: [
        { n: 1, sourceId: 's', title: 'Dispensa', label: 'p. 12', text: 'Lemma del cammello.' }
      ]
    })
    expect(p).toContain('FONTI DEL NOTEBOOK')
    expect(p).toContain('(Dispensa, p. 12) Lemma del cammello.')
    expect(p).toContain('la nota Obsidian resta la base')
  })
  it('takes excerpts from the notebooks of the note subject only', async () => {
    const store = notebookStore(await mkdtemp(join(tmpdir(), 'sinapsi-fornotes-')))
    const a = await store.bucketFor('Analisi')
    const b = await store.bucketFor('Biologia')
    for (const [id, nb, text] of [
      ['s1', a, 'Rolle: nel corso è il lemma del cammello.'],
      ['s2', b, 'Rolle in biologia? No: glicolisi.']
    ] as const) {
      await store.addSource({ id, notebookId: nb, kind: 'text', title: id, origin: 'x.md' })
      await store.writeText(id, { segments: [{ label: 'inizio', text }], warnings: [] })
      await store.setStatus(id, { status: 'ready' })
    }
    const find = notebookSourcesFor({ store, vault: async () => null })
    const ex = await find('/v/Rolle.md', 'Rolle', '## Enunciato')
    expect(ex.map((e) => e.sourceId)).toEqual(['s1'])
    expect(await find('/v/Altro.md', 'Altro', '')).toEqual([])
  })
})
