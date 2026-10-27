import { mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createIngestor } from '../../src/main/notebook/ingest'
import { fakeMedia } from '../../src/main/notebook/fake-media'
import { isYoutubeUrl, youtubeId } from '../../src/main/notebook/media'
import { notebookStore, type NotebookStore } from '../../src/main/notebook/store'
import { makePdf } from './helpers/pdf'

let dir: string
let store: NotebookStore
let nb: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sinapsi-ingest-'))
  store = notebookStore(join(dir, 'nb'))
  nb = await store.create('Analisi')
})
const sources = async (): Promise<import('../../src/shared/notebook-types').Source[]> => (await store.notebooks())[0].sources

function setup(run = vi.fn(fakeMedia())) {
  const onChange = vi.fn()
  const ing = createIngestor({ store, run, readVault: async () => '## Rolle\nSia f continua.', onChange })
  return { ing, run, onChange }
}

describe('youtube urls', () => {
  it.each([
    ['https://www.youtube.com/watch?v=jNQXAC9IVRw', 'jNQXAC9IVRw'],
    ['https://youtu.be/jNQXAC9IVRw?t=3', 'jNQXAC9IVRw'],
    ['https://m.youtube.com/watch?v=jNQXAC9IVRw&list=x', 'jNQXAC9IVRw']
  ])('accepts %s', (u, id) => {
    expect(isYoutubeUrl(u)).toBe(true)
    expect(youtubeId(u)).toBe(id)
  })
  it.each(['http://www.youtube.com/watch?v=x', 'https://evil.com/youtube.com/watch?v=x', '--exec rm', 'https://www.youtube.com.evil.com/watch?v=x', 'https://www.youtube.com/watch'])('rejects %s', (u) => {
    expect(isYoutubeUrl(u)).toBe(false)
  })
})

describe('ingest', () => {
  it('copies files, reads them one at a time and reports what it found', async () => {
    const pdf = join(dir, 'Dispensa Rolle.pdf')
    await writeFile(pdf, makePdf(['Teorema di Rolle: enunciato completo.', 'Dimostrazione lunga del teorema.']))
    const md = join(dir, 'appunti.md')
    await writeFile(md, '# Derivate\nIl rapporto incrementale.')
    const { ing, onChange } = setup()
    const r = await ing.addFiles(nb, [pdf, md, join(dir, 'foto.heic')])
    expect(r.rejected).toEqual(['foto.heic'])
    expect(r.added).toHaveLength(2)
    expect((await sources()).filter((s) => s.status === 'processing').length).toBeLessThanOrEqual(1)
    await ing.idle()
    const s = await sources()
    expect(s.map((x) => [x.kind, x.title, x.status, x.info])).toEqual([
      ['pdf', 'Dispensa Rolle', 'ready', '2 pagine'],
      ['text', 'appunti', 'ready', '1 sezione']
    ])
    expect(await readdir(store.filesDir(r.added[0]))).toEqual(['Dispensa Rolle.pdf'])
    expect((await store.readText(r.added[0]))!.segments[1].label).toBe('p. 2')
    expect(onChange).toHaveBeenCalled()
  })
  it('records a reader failure as a failed source with the reason', async () => {
    const pdf = join(dir, 'scansione.pdf')
    await writeFile(pdf, makePdf(['']))
    const { ing } = setup()
    await ing.addFiles(nb, [pdf])
    await ing.idle()
    expect((await sources())[0]).toMatchObject({ status: 'failed', error: 'PDF senza testo (scansione): non lo posso leggere' })
  })
  it('transcribes audio with whisper, passing the file after --', async () => {
    const audio = join(dir, 'lezione.m4a')
    await writeFile(audio, 'x')
    const { ing, run } = setup()
    const { added } = await ing.addFiles(nb, [audio])
    await ing.idle()
    const call = run.mock.calls.find((c) => c[0] === 'mlx_whisper')!
    expect(call[1].slice(-2)).toEqual(['--', join(store.filesDir(added[0]), 'lezione.m4a')])
    expect(call[1]).toEqual(expect.arrayContaining(['--model', 'mlx-community/whisper-large-v3-turbo', '--output-format', 'json']))
    const s = (await sources())[0]
    expect(s).toMatchObject({ kind: 'audio', status: 'ready' })
    expect(s.info).toMatch(/min/)
    expect((await store.readText(added[0]))!.segments[0].label).toBe('0:00')
  })
  it('reads YouTube subtitles and takes the video title', async () => {
    const { ing, run } = setup()
    const id = await ing.addYoutube(nb, 'https://www.youtube.com/watch?v=abcdefghijk')
    await ing.idle()
    expect((await sources())[0]).toMatchObject({ kind: 'youtube', title: 'Video di prova', status: 'ready', origin: 'https://www.youtube.com/watch?v=abcdefghijk' })
    expect(run.mock.calls.map((c) => c[0])).toEqual(['yt-dlp'])
    expect(run.mock.calls[0][1].slice(-2)).toEqual(['--', 'https://www.youtube.com/watch?v=abcdefghijk'])
    expect((await store.readText(id))!.segments[0].text).toContain('derivate')
  })
  it('downloads and transcribes the audio when a video has no subtitles', async () => {
    const { ing, run } = setup()
    await ing.addYoutube(nb, 'https://youtu.be/nosubsxxxxx')
    await ing.idle()
    expect(run.mock.calls.map((c) => c[0])).toEqual(['yt-dlp', 'yt-dlp', 'mlx_whisper'])
    expect((await sources())[0]).toMatchObject({ status: 'ready' })
  })
  it('rejects a bad YouTube link before running anything', async () => {
    const { ing, run } = setup()
    await expect(ing.addYoutube(nb, '--exec=rm')).rejects.toThrow('Link YouTube non valido')
    expect(run).not.toHaveBeenCalled()
  })
  it('reads a vault note without touching the vault', async () => {
    const { ing } = setup()
    await ing.addVaultNote(nb, '/v/Rolle.md', 'Rolle')
    await ing.idle()
    expect((await sources())[0]).toMatchObject({ kind: 'vault', title: 'Rolle', status: 'ready', origin: '/v/Rolle.md' })
  })
  it('says which tool is missing', async () => {
    const audio = join(dir, 'a.mp3')
    await writeFile(audio, 'x')
    const { ing } = setup(vi.fn(async () => Promise.reject(Object.assign(new Error('spawn'), { code: 'ENOENT' }))))
    await ing.addFiles(nb, [audio])
    await ing.idle()
    expect((await sources())[0].error).toMatch(/Manca mlx_whisper/)
  })
  it('shows live progress without writing it to the ledger', async () => {
    const audio = join(dir, 'a.mp3')
    await writeFile(audio, 'x')
    let release!: () => void
    const base = fakeMedia()
    const run = vi.fn(async (cmd: string, args: string[], opts: { timeoutMs: number; onOutput?: (c: string) => void }) => {
      opts.onOutput?.(' 42%|████ | 10/24')
      await new Promise<void>((r) => (release = r))
      return base(cmd, args, opts)
    })
    const { ing } = setup(run)
    await ing.addFiles(nb, [audio])
    await vi.waitFor(() => expect(run).toHaveBeenCalled())
    const live = ing.decorate(await store.notebooks())[0].sources[0]
    expect(live).toMatchObject({ status: 'processing', progress: 42 })
    expect((await sources())[0].progress).toBeUndefined()
    release()
    await ing.idle()
  })
  it('marks work interrupted by a quit as failed, and retries it', async () => {
    await store.addSource({ id: 's1', notebookId: nb, kind: 'vault', title: 'Rolle', origin: '/v/Rolle.md' })
    await store.setStatus('s1', { status: 'processing' })
    const { ing } = setup()
    await ing.fixStale()
    expect((await sources())[0]).toMatchObject({ status: 'failed', error: 'Interrotta. Riprova.' })
    await ing.retry('s1')
    await ing.idle()
    expect((await sources())[0].status).toBe('ready')
  })
  it('removes a source and ignores the result of a job already running', async () => {
    const md = join(dir, 'x.md')
    await writeFile(md, 'testo')
    const { ing } = setup()
    const { added } = await ing.addFiles(nb, [md])
    await ing.remove(added[0])
    await ing.idle()
    expect(await sources()).toEqual([])
    expect(await store.readText(added[0])).toBeNull()
  })
})
