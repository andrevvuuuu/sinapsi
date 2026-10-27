// @vitest-environment jsdom
import { mkdtemp, readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BlockView } from '../../src/renderer/src/nota/BlockView'
import { NotaView } from '../../src/renderer/src/nota/NotaView'
import { findRoots } from '../../src/renderer/src/nota/figure/plot'
import { createNoteGenerator } from '../../src/main/notes/generator'
import { parseNota } from '../../src/shared/nota-schema'
import type { Block } from '../../src/shared/nota-schema'

afterEach(cleanup)
const ID = '11111111-1111-4111-8111-111111111111'
const quiz = (p: string): Block => ({ type: 'quiz', prompt: p, options: ['Sì', 'No'], correct: 1, why: ['sbagliato ' + p, 'giusto ' + p] })

describe('review fixes (phase 3)', () => {
  it('tabs do not carry a quiz answer into the next tab', () => {
    render(<BlockView block={{ type: 'tabs', tabs: [{ label: 'Uno', blocks: [quiz('A')] }, { label: 'Due', blocks: [quiz('B')] }] }} mode="leggi" />)
    fireEvent.click(screen.getByRole('button', { name: /Sì/ }))
    expect(screen.getByText('sbagliato A')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Due' }))
    expect((screen.getByRole('button', { name: /Sì/ }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByText(/sbagliato/)).toBeNull()
  })

  it('rejects figures whose functions call each other in a cycle', () => {
    const raw = JSON.parse(readFileSync(join(__dirname, '../fixtures/nota-min.json'), 'utf8'))
    raw.sections[0].blocks[2].functions = { f: 'g(x) + g(x)', g: 'f(x) + f(x)' }
    raw.sections[0].blocks[2].elements[0].fn = 'f'
    expect(parseNota(raw).dropped).toBe(1)
  })

  it('finds roots at both ends of the range even when not exactly zero', () => {
    const r = findRoots(Math.sin, [0, Math.PI])
    expect(r).toHaveLength(2)
    expect(r[1]).toBeCloseTo(Math.PI, 6)
    expect(findRoots(Math.cos, [-Math.PI / 2, Math.PI / 2])).toHaveLength(2)
  })

  it('does not flood with points when the expression is identically zero', () => {
    expect(findRoots(() => 0, [-1, 1]).length).toBeLessThanOrEqual(1)
  })

  it('starts one generation for two quick Riprova clicks', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-rf3-'))
    let calls = 0
    let release: () => void = () => undefined
    const gate = new Promise<void>((r) => (release = r))
    const raw = JSON.parse(readFileSync(join(__dirname, '../fixtures/nota-min.json'), 'utf8'))
    const ask = vi.fn(async () => {
      calls++
      if (calls === 1) throw new Error('prima')
      await gate
      return { data: parseNota(raw), fromCache: false, engine: 'agy' as const }
    })
    const note = { path: '/v/a.md', title: 'A', folder: '', tags: [], aliases: [], links: [], headings: [], blockIds: [], subject: null, mtime: 1, size: 1, available: true }
    const g = createNoteGenerator({
      bridge: { ask } as never,
      dir: join(dir, 'notes'),
      workDir: join(dir, 'w'),
      vault: async () => ({ root: '/v', notes: [note], subjects: [], scannedAt: 1 }),
      readNote: async () => 'x',
      session: async () => null,
      onUpdate: () => undefined
    })
    const id = await g.create({ sourcePath: '/v/a.md' })
    await vi.waitFor(async () => expect(JSON.parse(await readFile(join(dir, 'notes', `${id}.json`), 'utf8')).status).toBe('error'))
    await Promise.all([g.retry(id), g.retry(id)])
    release()
    await vi.waitFor(async () => expect(JSON.parse(await readFile(join(dir, 'notes', `${id}.json`), 'utf8')).status).toBe('ready'))
    expect(ask).toHaveBeenCalledTimes(2)
  })

  it('shows why Riprova failed and disables it while it runs', async () => {
    let fail: (e: Error) => void = () => undefined
    const retry = vi.fn(() => new Promise<void>((_r, j) => (fail = j)))
    window.sinapsi = { notes: { get: vi.fn(async () => ({ id: ID, createdAt: 1, updatedAt: 1, status: 'error', error: 'Errore.', sourcePath: '/v/a.md', sourceTitle: 'A' })), onUpdate: () => () => undefined, retry } } as never
    render(<NotaView id={ID} onBack={vi.fn()} />)
    const b = (await screen.findByRole('button', { name: 'Riprova' })) as HTMLButtonElement
    fireEvent.click(b)
    expect(b.disabled).toBe(true)
    fail(new Error("Error invoking remote method 'notes:retry': Error: Nota non trovata nel vault"))
    expect(await screen.findByText('Nota non trovata nel vault')).toBeTruthy()
    expect(b.disabled).toBe(false)
  })
})
