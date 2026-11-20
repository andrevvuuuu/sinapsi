import { describe, expect, it, vi } from 'vitest'
import { createVaultIndexCache } from '../../src/main/vault/index-cache'
import { scanVault } from '../../src/main/vault/scan'
import { graphStore } from '../../src/main/graph/store'
import { createExtractor } from '../../src/main/graph/jobs'
import type { VaultIndex, VaultNote } from '../../src/shared/vault-types'
import type { Dirent } from 'node:fs'
import { mkdtemp, writeFile, appendFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dummyIndex = (root = '/v', notes: VaultNote[] = []): VaultIndex => ({
  root,
  notes,
  subjects: [],
  scannedAt: Date.now()
})

describe('createVaultIndexCache', () => {
  it('criterio 1: due vaultIndex() di seguito senza modifiche -> una sola scansione', async () => {
    let scanCalls = 0
    const fakeScan = vi.fn(async (root: string) => {
      scanCalls++
      return dummyIndex(root)
    })

    const cache = createVaultIndexCache({ scan: fakeScan })
    const idx1 = await cache.get('/v', [])
    const idx2 = await cache.get('/v', [])

    expect(scanCalls).toBe(1)
    expect(idx1).toBe(idx2)
  })

  it('criterio 2: dopo invalidate() -> riscansione; con memo, un file non cambiato non viene riletto', async () => {
    const files: Record<string, { text: string; mtimeMs: number; size: number }> = {
      '/v/Note1.md': { text: '# Note 1\nContenuto', mtimeMs: 1000, size: 20 },
      '/v/Note2.md': { text: '# Note 2\nAltro contenuto', mtimeMs: 1000, size: 25 }
    }

    let readCount = 0
    const fakeReadFile = vi.fn(async (path: string) => {
      readCount++
      const f = files[path]
      if (!f) throw new Error('ENOENT')
      return f.text
    })

    const fakeReaddir = vi.fn(async () => [
      { name: 'Note1.md', isDirectory: () => false } as Dirent,
      { name: 'Note2.md', isDirectory: () => false } as Dirent
    ])

    const fakeStat = vi.fn(async (path: string) => {
      const f = files[path]
      if (!f) throw new Error('ENOENT')
      return { mtimeMs: f.mtimeMs, size: f.size }
    })

    const cache = createVaultIndexCache({
      scan: (root, excluded, partial, memo) =>
        scanVault(
          root,
          excluded,
          {
            readFile: fakeReadFile,
            readdir: fakeReaddir,
            stat: fakeStat,
            ...partial
          },
          memo
        )
    })

    // Prima scansione: entrambi i file vengono letti
    const idx1 = await cache.get('/v', [])
    expect(idx1.notes).toHaveLength(2)
    expect(readCount).toBe(2)

    // invalidate() forza una nuova scansione
    cache.invalidate()

    // Modifichiamo solo Note2 (mtimeMs diverso)
    files['/v/Note2.md'] = { text: '# Note 2\nNuovo testo', mtimeMs: 2000, size: 23 }

    const idx2 = await cache.get('/v', [])
    expect(idx2.notes).toHaveLength(2)
    // Note1 non deve essere stata riletta, solo Note2!
    // readCount totale deve essere 2 (iniziali) + 1 (Note2 cambiata) = 3
    expect(readCount).toBe(3)
  })

  it('criterio 3: chiamate concorrenti durante una scansione -> una sola scansione', async () => {
    let scanCalls = 0
    let resolveScan!: (idx: VaultIndex) => void
    const scanPromise = new Promise<VaultIndex>((resolve) => {
      resolveScan = resolve
    })

    const fakeScan = vi.fn(async (root: string) => {
      scanCalls++
      return scanPromise
    })

    const cache = createVaultIndexCache({ scan: fakeScan })
    const p1 = cache.get('/v', [])
    const p2 = cache.get('/v', [])
    const p3 = cache.get('/v', [])

    resolveScan(dummyIndex('/v'))
    const [r1, r2, r3] = await Promise.all([p1, p2, p3])

    expect(scanCalls).toBe(1)
    expect(r1).toBe(r2)
    expect(r2).toBe(r3)
  })

  it('un errore di scansione non resta in cache', async () => {
    let fail = true
    const fakeScan = vi.fn(async (root: string) => {
      if (fail) throw new Error('Disk error')
      return dummyIndex(root)
    })

    const cache = createVaultIndexCache({ scan: fakeScan })
    await expect(cache.get('/v', [])).rejects.toThrow('Disk error')

    fail = false
    const idx = await cache.get('/v', [])
    expect(idx.root).toBe('/v')
  })

  it('scade dopo ttlMs e riscansione', async () => {
    let scanCalls = 0
    let time = 100_000
    const fakeScan = vi.fn(async (root: string) => {
      scanCalls++
      return dummyIndex(root)
    })

    const cache = createVaultIndexCache({
      scan: fakeScan,
      ttlMs: 30_000,
      now: () => time
    })

    await cache.get('/v', [])
    expect(scanCalls).toBe(1)

    // Prima del TTL
    time += 29_000
    await cache.get('/v', [])
    expect(scanCalls).toBe(1)

    // Dopo il TTL
    time += 2_000
    await cache.get('/v', [])
    expect(scanCalls).toBe(2)
  })

  it('rimuove dal memo i file cancellati', async () => {
    const files: Record<string, { text: string; mtimeMs: number; size: number }> = {
      '/v/Note1.md': { text: '# Note 1', mtimeMs: 1000, size: 10 },
      '/v/Note2.md': { text: '# Note 2', mtimeMs: 1000, size: 10 }
    }
    let dirents = [
      { name: 'Note1.md', isDirectory: () => false } as Dirent,
      { name: 'Note2.md', isDirectory: () => false } as Dirent
    ]

    const cache = createVaultIndexCache({
      scan: (root, excluded, partial, memo) =>
        scanVault(
          root,
          excluded,
          {
            readFile: async (p) => files[p]?.text ?? '',
            readdir: async () => dirents,
            stat: async (p) => {
              const f = files[p]
              if (!f) throw new Error('ENOENT')
              return { mtimeMs: f.mtimeMs, size: f.size }
            },
            ...partial
          },
          memo
        )
    })

    const idx1 = await cache.get('/v', [])
    expect(idx1.notes).toHaveLength(2)

    // Cancelliamo Note2
    delete files['/v/Note2.md']
    dirents = [{ name: 'Note1.md', isDirectory: () => false } as Dirent]

    cache.invalidate()
    const idx2 = await cache.get('/v', [])
    expect(idx2.notes).toHaveLength(1)
    expect(idx2.notes[0].title).toBe('Note1')
  })
})

describe('graphStore signature caching', () => {
  it('restituisce lo stesso oggetto Ledgers se i file non sono modificati, rilegge se modificati', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-store-cache-'))
    const store = graphStore(dir)

    const l1 = await store.read()
    const l2 = await store.read()
    expect(l1).toBe(l2)

    // Aggiungiamo una riga
    await store.append('prop', {
      id: 'n1',
      name: 'N1',
      statement: 'S1',
      notePath: '/v/a.md',
      at: Date.now()
    })

    const l3 = await store.read()
    expect(l3).not.toBe(l1)
    expect(l3.props).toHaveLength(1)

    const l4 = await store.read()
    expect(l4).toBe(l3)
  })
})

describe('extractor graph() memoization', () => {
  it('criterio 4: graph() due volte senza cambi -> stesso oggetto restituito', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-extractor-cache-'))
    const store = graphStore(dir)
    const idx = dummyIndex('/v')

    const extractor = createExtractor({
      bridge: { ask: vi.fn() as never },
      store,
      vault: async () => idx,
      readNote: vi.fn(async () => ''),
      workDir: dir,
      onChange: vi.fn()
    })

    const g1 = await extractor.graph()
    const g2 = await extractor.graph()
    expect(g1).toBe(g2)

    // Se il vault cambia (nuovo oggetto VaultIndex)
    const newIdx = dummyIndex('/v')
    let currentIdx = idx
    const extractor2 = createExtractor({
      bridge: { ask: vi.fn() as never },
      store,
      vault: async () => currentIdx,
      readNote: vi.fn(async () => ''),
      workDir: dir,
      onChange: vi.fn()
    })

    const g3 = await extractor2.graph()
    const g4 = await extractor2.graph()
    expect(g3).toBe(g4)

    // Cambia il vault index
    currentIdx = newIdx
    const g5 = await extractor2.graph()
    expect(g5).not.toBe(g3)
  })
})
