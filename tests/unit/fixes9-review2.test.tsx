// @vitest-environment jsdom
import { createHash } from 'node:crypto'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EngineMissingError } from '../../src/main/ai/errors'
import { deriveGraph } from '../../src/main/graph/derive'
import { detectMoves, detectOfflineMoves } from '../../src/main/graph/moves'
import { readPdf } from '../../src/main/notebook/readers'
import { transcribePhoto } from '../../src/main/practice/photo'
import { parseWikilinks } from '../../src/main/vault/links'
import { MathSelect } from '../../src/renderer/src/components/MathSelect'
import { QuestionDock } from '../../src/renderer/src/session/QuestionDock'
import type { VaultIndex, VaultNote } from '../../src/shared/vault-types'
import { makePdf } from './helpers/pdf'

afterEach(cleanup)
const tmp = (): Promise<string> => mkdtemp(join(tmpdir(), 'sinapsi-r9-'))
const note = (path: string, title: string): VaultNote => ({ path, title, folder: '', tags: [], aliases: [], links: [], headings: [], blockIds: [], subject: null, mtime: 1, size: 1, available: true })
const idx = (root: string, ...notes: VaultNote[]): VaultIndex => ({ root, scannedAt: 1, subjects: [], notes })
const h = (t: string) => createHash('sha256').update(t).digest('hex')

describe('links to notes with dotted numbers', () => {
  it('are kept; real attachments are not', () => {
    expect(parseWikilinks('[[Teorema 2.10]] [[Esercizio 3.14]] ![[grafico.png]] [[dispensa.pdf]]').map((l) => l.target)).toEqual(['Teorema 2.10', 'Esercizio 3.14'])
  })
})

describe('PDF content', () => {
  it('keeps numbers and repeated lines in the text; headers only affect scan detection', async () => {
    const dir = await tmp()
    const f = join(dir, 'a.pdf')
    await writeFile(f, makePdf(['Corso - pag. 1\nDimostrazione.\nMatrice:\n1\n2\nfine della pagina uno', 'Corso - pag. 2\nDimostrazione.\n3\n4\nfine della pagina due', 'Corso - pag. 3\nDimostrazione.\nx = 0\nfine della pagina tre']))
    const t = await readPdf(f)
    expect(t.segments).toHaveLength(3)
    expect(t.segments[0].text).toContain('Dimostrazione.')
    expect(t.segments[0].text).toMatch(/\n1\n2\n/)
  })
})

describe('renamed notes', () => {
  it('are found at startup even if renamed while the app was closed', async () => {
    const now = idx('/v', note('/v/Teorema di Rolle.md', 'Teorema di Rolle'), note('/v/Altro.md', 'Altro'))
    const moves = await detectOfflineMoves(now, { '/v/Rolle.md': { hash: h('testo'), at: 1 }, '/v/Altro.md': { hash: h('x'), at: 1 } }, async (p) => (p === '/v/Teorema di Rolle.md' ? 'testo' : ''))
    expect(moves).toEqual([{ from: '/v/Rolle.md', to: '/v/Teorema di Rolle.md' }])
  })
  it('a different vault is not a rename', async () => {
    const moves = await detectMoves(idx('/a', note('/a/Rolle.md', 'Rolle')), idx('/b', note('/b/Rolle.md', 'Rolle')), { '/a/Rolle.md': { hash: 'x', at: 1 } }, async () => '')
    expect(moves).toEqual([])
  })
  it('a rename and its undo leave the concepts where they are now', () => {
    const g = deriveGraph({
      props: [{ id: 'n', name: 'N', statement: 's', notePath: '/v/B.md', at: 2 }],
      chains: [],
      extractions: [],
      moves: [{ from: '/v/A.md', to: '/v/B.md', at: 1 }, { from: '/v/B.md', to: '/v/A.md', at: 3 }]
    } as never)
    expect(g.concepts[0].birth).toBe('/v/A.md')
  })
})

describe('MathSelect for screen readers', () => {
  it('announces the highlighted option, and closes when focus leaves', () => {
    render(
      <div>
        <MathSelect label="Spazio 1" options={['a', 'b', 'c']} value={null} onChange={vi.fn()} />
        <button type="button">altro</button>
      </div>
    )
    const box = screen.getByRole('combobox')
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    const list = screen.getByRole('listbox')
    expect(box.getAttribute('aria-controls')).toBe(list.id)
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    const active = box.getAttribute('aria-activedescendant')!
    expect(document.getElementById(active)?.textContent).toContain('b')
    fireEvent.keyDown(box, { key: 'End' })
    expect(document.getElementById(box.getAttribute('aria-activedescendant')!)?.textContent).toContain('c')
    fireEvent.blur(box, { relatedTarget: screen.getByRole('button', { name: 'altro' }) })
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})

describe('session plan question', () => {
  it('has one focusable heading', () => {
    const { container } = render(<QuestionDock question={{ id: 'q', role: 'plan', kind: 'open', prompt: 'Va bene il piano?' }} onAnswer={vi.fn()} onSay={vi.fn()} />)
    expect(container.querySelectorAll('.q-head')).toHaveLength(1)
  })
})

describe('photos', () => {
  it('a new photo never overwrites a kept one', async () => {
    const dir = await tmp()
    await writeFile(join(dir, 'foglio-2.jpg'), 'vecchia')
    const ask = vi.fn(async (req: { prompt: string; schema: { parse(x: unknown): unknown } }) => ({ data: req.schema.parse({ readable: true, text: 'ok' }), fromCache: false, engine: 'claude' as const }))
    await transcribePhoto({ bridge: { ask } as never, dir, bytes: new Uint8Array([0xff, 0xd8, 0xff]) })
    expect(ask.mock.calls[0][0].prompt).toContain('«foglio-3.jpg»')
  })
  it('says that Claude is needed when it is missing', async () => {
    const dir = await tmp()
    const ask = vi.fn(async () => Promise.reject(new EngineMissingError('claude')))
    await expect(transcribePhoto({ bridge: { ask } as never, dir, bytes: new Uint8Array([0xff, 0xd8, 0xff]) })).rejects.toThrow(/serve Claude Code/)
  })
})
