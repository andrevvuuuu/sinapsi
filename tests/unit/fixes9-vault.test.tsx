// @vitest-environment jsdom
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseWikilinks } from '../../src/main/vault/links'
import { scanVault } from '../../src/main/vault/scan'
import { createRewatcher } from '../../src/main/vault/watch'
import Home from '../../src/renderer/src/home/Home'

afterEach(cleanup)

describe('wikilinks', () => {
  it('reads an escaped pipe inside a table as the alias', () => {
    expect(parseWikilinks('| [[Teorema di Rolle\\|Rolle]] | x |')).toEqual([{ target: 'Teorema di Rolle', alias: 'Rolle' }])
  })
  it('leaves attachments out (embedded images and PDFs)', () => {
    expect(parseWikilinks('![[grafico.png]] ![[dispensa.pdf#page=3]] [[slide.pdf]] ![[Nota incorporata]] [[Nota]]')).toEqual([{ target: 'Nota incorporata' }, { target: 'Nota' }])
  })
  it('keeps the folder written in the link as a hint', () => {
    expect(parseWikilinks('[[Fisica/Intro|i]]')).toEqual([{ target: 'Intro', alias: 'i', folder: 'Fisica' }])
  })
})

describe('notes with the same title', () => {
  it('resolve to the closest one, or to the folder written in the link', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sinapsi-dup-'))
    for (const d of ['Analisi', 'Fisica', 'Altro']) await mkdir(join(root, d))
    await writeFile(join(root, 'Analisi/Intro.md'), 'analisi')
    await writeFile(join(root, 'Fisica/Intro.md'), 'fisica')
    await writeFile(join(root, 'Analisi/Limiti.md'), 'vedi [[Intro]]')
    await writeFile(join(root, 'Fisica/Moto.md'), 'vedi [[Intro]]')
    await writeFile(join(root, 'Altro/Note.md'), 'vedi [[Fisica/Intro]]')
    const idx = await scanVault(root, [])
    const link = (title: string) => idx.notes.find((n) => n.title === title)!.links[0]
    expect(link('Limiti')).toMatchObject({ resolved: true, path: join(root, 'Analisi/Intro.md') })
    expect(link('Moto')).toMatchObject({ resolved: true, path: join(root, 'Fisica/Intro.md') })
    expect(link('Note')).toMatchObject({ resolved: true, path: join(root, 'Fisica/Intro.md') })
  })
})

describe('changing vault quickly', () => {
  it('keeps only the last watcher alive', async () => {
    const stops: ReturnType<typeof vi.fn>[] = []
    const watch = vi.fn(() => {
      const stop = vi.fn()
      stops.push(stop)
      return stop
    })
    let n = 0
    const load = async () => {
      const mine = ++n
      await new Promise((r) => setTimeout(r, mine === 1 ? 30 : 5))
      return { vaultPath: `/v${mine}`, excludedFolders: [] }
    }
    const rewatch = createRewatcher(load, watch, vi.fn())
    await Promise.all([rewatch(), rewatch()])
    const alive = stops.filter((s) => s.mock.calls.length === 0)
    expect(alive).toHaveLength(1)
    expect(watch.mock.calls.at(-1)![0]).toBe('/v2')
  })
})

describe('home that cannot load', () => {
  it('says why and lets you retry', async () => {
    const get = vi.fn().mockRejectedValueOnce(new Error('disco pieno')).mockResolvedValue({ theme: 'system', vaultPath: '/v', engines: {} })
    window.sinapsi = {
      settings: { get, set: vi.fn(), chooseVault: vi.fn() },
      vault: { index: vi.fn(async () => ({ root: '/v', scannedAt: 0, subjects: [], notes: [] })), onChange: () => () => undefined },
      ai: { status: vi.fn(async () => ({ agy: 'idle', claude: 'idle' })), onStatus: () => () => undefined },
      app: { openExternal: vi.fn() }
    } as never
    render(<Home />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/Non riesco a caricare.*disco pieno/)
    fireEvent.click(screen.getByRole('button', { name: 'Riprova' }))
    expect(get).toHaveBeenCalledTimes(2)
  })
})
