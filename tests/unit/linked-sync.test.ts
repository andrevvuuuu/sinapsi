import { describe, expect, it, vi } from 'vitest'
import { createLinkedSync, linkedTo } from '../../src/main/vault/linked'
import type { VaultIndex, VaultNote } from '../../src/shared/vault-types'

const note = (title: string, links: string[] = [], extra: Partial<VaultNote> = {}): VaultNote => ({
  path: `/v/${title}.md`,
  title,
  folder: '',
  tags: [],
  aliases: [],
  links: links.map((t) => ({ target: t, path: `/v/${t}.md`, resolved: true })),
  headings: [],
  blockIds: [],
  subject: null,
  mtime: 1,
  size: 1,
  available: true,
  ...extra
})
const index: VaultIndex = {
  root: '/v',
  notes: [
    note('Densità', ['Archimede']),
    note('Archimede', ['Sup']),
    note('Sup'),
    note('Radice', ['Archimede']),
    note('Lontana'),
    note('Analisi MOC', ['Densità', 'Archimede', 'Sup', 'Radice', 'Lontana'], { type: 'MOC' })
  ],
  subjects: [],
  scannedAt: 1
}

describe('linkedTo', () => {
  it('finds the notes linked both ways, leaving out MOCs and the edited note', () => {
    expect(linkedTo(index, ['/v/Archimede.md']).sort()).toEqual(['/v/Densità.md', '/v/Radice.md', '/v/Sup.md'])
  })
  it('does not spread from a MOC', () => {
    expect(linkedTo(index, ['/v/Analisi MOC.md'])).toEqual([])
  })
  it('ignores notes it does not know (deleted ones)', () => {
    expect(linkedTo(index, ['/v/Sparita.md'])).toEqual([])
  })
})

function setup(texts: Record<string, string>, studied = ['/v/Archimede.md', '/v/Densità.md', '/v/Sup.md']) {
  const refreshNote = vi.fn(async () => 1)
  const reextract = vi.fn(async () => undefined)
  const sync = createLinkedSync({
    vault: async () => index,
    readNote: async (p) => {
      if (!(p in texts)) throw new Error('ENOENT')
      return texts[p]
    },
    studied: async () => new Set(studied),
    refreshNote,
    reextract
  })
  return { sync, refreshNote, reextract }
}

describe('linked sync', () => {
  it('rewrites the edited note and extracts again the studied notes linked to it', async () => {
    const { sync, refreshNote, reextract } = setup({ '/v/Archimede.md': 'a' })
    sync.changed(['/v/Archimede.md'])
    await sync.flush()
    expect(refreshNote.mock.calls).toEqual([['/v/Archimede.md']])
    expect(reextract.mock.calls.map((c) => c[0]).sort()).toEqual(['/v/Densità.md', '/v/Sup.md'])
  })
  it('does nothing when the text is the same as last time', async () => {
    const texts = { '/v/Archimede.md': 'a' }
    const { sync, refreshNote } = setup(texts)
    sync.changed(['/v/Archimede.md'])
    await sync.flush()
    sync.changed(['/v/Archimede.md'])
    await sync.flush()
    expect(refreshNote).toHaveBeenCalledTimes(1)
    texts['/v/Archimede.md'] = 'b'
    sync.changed(['/v/Archimede.md'])
    await sync.flush()
    expect(refreshNote).toHaveBeenCalledTimes(2)
  })
  it('a new note without a nota viva still updates the studied notes that link to it', async () => {
    const { sync, refreshNote, reextract } = setup({ '/v/Sup.md': 's' }, ['/v/Archimede.md'])
    sync.changed(['/v/Sup.md'])
    await sync.flush()
    expect(refreshNote).not.toHaveBeenCalled()
    expect(reextract.mock.calls).toEqual([['/v/Archimede.md']])
  })
  it('waits until the note stops changing', async () => {
    vi.useFakeTimers()
    try {
      const { sync, refreshNote } = setup({ '/v/Archimede.md': 'a' })
      sync.changed(['/v/Archimede.md'])
      await vi.advanceTimersByTimeAsync(100_000)
      sync.changed(['/v/Archimede.md'])
      await vi.advanceTimersByTimeAsync(100_000)
      expect(refreshNote).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(30_000)
      expect(refreshNote).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
  it('changing only the frontmatter does not count as an edit', async () => {
    const texts: Record<string, string> = { '/v/Archimede.md': '---\nA: 1\n---\nTesto' }
    const { sync, refreshNote } = setup(texts)
    sync.changed(['/v/Archimede.md'])
    await sync.flush()
    texts['/v/Archimede.md'] = '---\nA: 1\nLezioni:\n  - 2026-10-26\n---\nTesto'
    sync.changed(['/v/Archimede.md'])
    await sync.flush()
    expect(refreshNote).toHaveBeenCalledTimes(1)
  })
  it('skips deleted notes', async () => {
    const { sync, refreshNote, reextract } = setup({})
    sync.changed(['/v/Archimede.md'])
    await sync.flush()
    expect(refreshNote).not.toHaveBeenCalled()
    expect(reextract).not.toHaveBeenCalled()
  })
})
