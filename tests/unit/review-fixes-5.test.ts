import { mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createIngestor } from '../../src/main/notebook/ingest'
import { fetchYoutube } from '../../src/main/notebook/media'
import { isSlidePart } from '../../src/main/notebook/readers'
import { chunk } from '../../src/main/notebook/retrieve'
import { notebookStore } from '../../src/main/notebook/store'

const tmp = (): Promise<string> => mkdtemp(join(tmpdir(), 'sinapsi-rf5-'))

describe('chunks keep the text as it is', () => {
  it('leaves a short segment untouched: decimals, theorem numbers, line breaks', () => {
    const text = 'Teorema 3.2.1 dice che pi = 3.14 circa.\nf(x) = x^2\ng(x) = 2x'
    expect(chunk('s', 'T', { segments: [{ label: 'p. 1', text }], warnings: [] })[0].text).toBe(text)
  })
  it('splits a long segment only at real sentence ends, keeping numbers and newlines', () => {
    const text = Array.from({ length: 60 }, (_, i) => `Per il Teorema ${i}.2 vale 3.14 circa.\nRiga ${i}`).join('\n')
    const pieces = chunk('s', 'T', { segments: [{ label: 'p. 1', text }], warnings: [] }, 300)
    expect(pieces.length).toBeGreaterThan(1)
    for (const p of pieces) expect(p.text).not.toMatch(/\d\. \d/)
    expect(pieces.some((p) => p.text.includes('\n'))).toBe(true)
  })
})

describe('YouTube subtitles', () => {
  it('asks first for manual subtitles, then only for original auto captions, never translated ones', async () => {
    const dir = await tmp()
    const run = vi.fn(async (_c: string, args: string[]) => {
      if (args.includes('--write-auto-subs')) await writeFile(join(dir, 'sub.en-orig.vtt'), 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nhello\n')
      return { stdout: 'Titolo\n', stderr: '', code: 0, timedOut: false }
    })
    const r = await fetchYoutube(run, 'https://youtu.be/abcdefghijk', dir, () => undefined)
    expect(r.text.segments[0].text).toBe('hello')
    const [first, second] = run.mock.calls.map((c) => c[1])
    expect(first).toContain('--write-subs')
    expect(first).not.toContain('--write-auto-subs')
    expect(first[first.indexOf('--sub-langs') + 1]).toBe('it,en')
    expect(second[second.indexOf('--sub-langs') + 1]).toBe('.*-orig')
  })
  it('falls back to the audio when the subtitle download fails', async () => {
    const dir = await tmp()
    const run = vi.fn(async (cmd: string, args: string[]) => {
      if (cmd === 'yt-dlp' && args.includes('--skip-download')) return { stdout: '', stderr: 'ERROR: HTTP Error 429', code: 1, timedOut: false }
      if (cmd === 'mlx_whisper') await writeFile(join(dir, 'trascrizione.json'), JSON.stringify({ segments: [{ start: 0, text: 'ciao' }] }))
      return { stdout: '', stderr: '', code: 0, timedOut: false }
    })
    const r = await fetchYoutube(run, 'https://youtu.be/abcdefghijk', dir, () => undefined)
    expect(r.text.segments[0].text).toBe('ciao')
    expect(run.mock.calls.at(-1)![0]).toBe('mlx_whisper')
  })
})

describe('stopping and retrying', () => {
  async function setupAudio() {
    const dir = await tmp()
    const store = notebookStore(join(dir, 'nb'))
    const nb = await store.create('A')
    const f = join(dir, 'lezione.m4a')
    await writeFile(f, 'x')
    return { store, nb, f }
  }
  it('removing a source stops its transcription and leaves no files behind', async () => {
    const { store, nb, f } = await setupAudio()
    let signal: AbortSignal | undefined
    const run = vi.fn(async (_c: string, args: string[], opts: { signal?: AbortSignal }) => {
      signal = opts.signal
      await new Promise<void>((r) => opts.signal?.addEventListener('abort', () => r()))
      // a tool that still writes its output while being killed
      await writeFile(join(args[args.indexOf('--output-dir') + 1], 'trascrizione.json'), '{}').catch(() => undefined)
      return { stdout: '', stderr: '', code: null, timedOut: false }
    })
    const ing = createIngestor({ store, run: run as never, readVault: async () => '', onChange: vi.fn() })
    const { added } = await ing.addFiles(nb, [f])
    await vi.waitFor(() => expect(run).toHaveBeenCalled())
    await ing.remove(added[0])
    await ing.idle()
    expect(signal?.aborted).toBe(true)
    expect(existsSync(store.filesDir(added[0]))).toBe(false)
  })
  it('a double click on Riprova queues the source once', async () => {
    const { store, nb } = await setupAudio()
    await store.addSource({ id: 's1', notebookId: nb, kind: 'vault', title: 'R', origin: '/v/R.md' })
    await store.setStatus('s1', { status: 'failed', error: 'x' })
    const readVault = vi.fn(async () => '# R\ntesto')
    const ing = createIngestor({ store, run: vi.fn() as never, readVault, onChange: vi.fn() })
    await Promise.all([ing.retry('s1'), ing.retry('s1')])
    await ing.idle()
    expect(readVault).toHaveBeenCalledTimes(1)
  })
})

describe('slides', () => {
  it('only inflates the slide and notes parts of a presentation, not its media', () => {
    expect(isSlidePart('ppt/slides/slide3.xml')).toBe(true)
    expect(isSlidePart('ppt/slides/_rels/slide3.xml.rels')).toBe(true)
    expect(isSlidePart('ppt/notesSlides/notesSlide1.xml')).toBe(true)
    expect(isSlidePart('ppt/media/video1.mp4')).toBe(false)
    expect(isSlidePart('ppt/media/image1.png')).toBe(false)
  })
})

void readdir
