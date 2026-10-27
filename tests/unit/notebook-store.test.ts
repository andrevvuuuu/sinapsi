import { appendFile, mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { notebookStore, type NotebookStore } from '../../src/main/notebook/store'

let dir: string
let s: NotebookStore
let t = 1000
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sinapsi-nb-'))
  s = notebookStore(dir, () => t++)
})

describe('notebooks', () => {
  it('creates, updates and lists notebooks, newest first', async () => {
    const a = await s.create('Analisi 1')
    const b = await s.create('Fisiologia')
    await s.update(a, { link: 'https://notebooklm.google.com/notebook/x', subject: 'Analisi' })
    await s.update(a, { name: 'Analisi I' })
    const list = await s.notebooks()
    expect(list.map((n) => n.name)).toEqual(['Fisiologia', 'Analisi I'])
    expect(list[1]).toMatchObject({ id: a, subject: 'Analisi', link: 'https://notebooklm.google.com/notebook/x', sources: [] })
    await s.update(a, { link: null })
    expect((await s.notebooks()).find((n) => n.id === a)!.link).toBeNull()
    await s.remove(b)
    expect((await s.notebooks()).map((n) => n.id)).toEqual([a])
  })
})

describe('sources', () => {
  it('derives the last status and hides removed sources and their files', async () => {
    const nb = await s.create('A')
    await s.addSource({ id: 'src1', notebookId: nb, kind: 'pdf', title: 'Dispensa', origin: 'dispensa.pdf' })
    await s.addSource({ id: 'src2', notebookId: nb, kind: 'youtube', title: 'Video', origin: 'https://youtu.be/x' })
    await s.setStatus('src1', { status: 'processing', progress: 40 })
    await s.setStatus('src1', { status: 'ready', info: '12 pagine' })
    await s.writeText('src1', { segments: [{ label: 'p. 1', text: 'ciao' }], warnings: [] })
    await mkdir(s.filesDir('src1'), { recursive: true })
    await writeFile(join(s.filesDir('src1'), 'dispensa.pdf'), 'x')
    let src = (await s.notebooks())[0].sources
    expect(src.map((x) => [x.id, x.status])).toEqual([['src1', 'ready'], ['src2', 'queued']])
    expect(src[0]).toMatchObject({ info: '12 pagine', title: 'Dispensa' })
    expect(src[0].progress).toBeUndefined()
    expect(await s.readText('src1')).toEqual({ segments: [{ label: 'p. 1', text: 'ciao' }], warnings: [] })
    await s.removeSource('src1')
    src = (await s.notebooks())[0].sources
    expect(src.map((x) => x.id)).toEqual(['src2'])
    expect(await s.readText('src1')).toBeNull()
    expect(await readdir(join(dir, 'files'))).toEqual([])
  })
  it('finds a source by id and skips damaged lines', async () => {
    const nb = await s.create('A')
    await s.addSource({ id: 'src1', notebookId: nb, kind: 'text', title: 'T', origin: 't.md' })
    await appendFile(join(dir, 'sources.jsonl'), '{"op":"add"\n{"nope":1}\n')
    expect((await s.source('src1'))!.title).toBe('T')
    expect(await s.source('zzz')).toBeNull()
  })
})

describe('chat', () => {
  it('appends and reads the turns of one notebook', async () => {
    const nb = await s.create('A')
    await s.appendChat(nb, { role: 'user', text: 'Che cos’è?', at: 1, sourceIds: ['src1'] })
    await s.appendChat(nb, { role: 'assistant', at: 2, claims: [{ text: 'Questo.', sources: [1] }], missing: null, dropped: 0, excerpts: [{ n: 1, sourceId: 'src1', title: 'T', label: 'p. 1', text: 'Questo.' }] })
    await s.appendChat(nb, { role: 'error', at: 3, text: 'quota' })
    expect((await s.chat(nb)).map((x) => x.role)).toEqual(['user', 'assistant', 'error'])
    expect(await s.chat('altro')).toEqual([])
  })
})
