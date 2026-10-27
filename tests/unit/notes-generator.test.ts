import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AiTimeoutError } from '../../src/main/ai/errors'
import { createNoteGenerator, type NoteMeta } from '../../src/main/notes/generator'
import { reduceSession } from '../../src/main/session/events'
import { parseNota } from '../../src/shared/nota-schema'
import type { VaultIndex, VaultNote } from '../../src/shared/vault-types'
import type { Bridge } from '../../src/main/ai/bridge'

const raw = JSON.parse(readFileSync(join(__dirname, '../fixtures/nota-min.json'), 'utf8'))
const note = (title: string, available = true): VaultNote => ({
  path: `/vault/Matematica/${title}.md`,
  title,
  folder: 'Matematica',
  tags: [],
  aliases: [],
  links: [],
  headings: [],
  blockIds: [],
  subject: 'Matematica',
  mtime: 1,
  size: 10,
  available
})
const index: VaultIndex = { root: '/vault', notes: [note('Teorema di Rolle'), note('Nuvola', false)], subjects: [], scannedAt: 1 }
const ID_RE = /^[0-9a-f-]{36}$/

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sinapsi-notes-'))
})

function setup(ask: Bridge['ask'] = vi.fn(async () => ({ data: parseNota(raw), fromCache: false, engine: 'agy' as const })) as never) {
  const updates: NoteMeta[] = []
  const g = createNoteGenerator({
    bridge: { ask },
    dir: join(dir, 'notes'),
    workDir: join(dir, 'ai-work'),
    vault: async () => index,
    readNote: async () => '## 1. Enunciato\ntesto',
    session: async (id) =>
      id === '22222222-2222-4222-8222-222222222222'
        ? reduceSession([{ t: 'created', id, topic: 'Rolle', noteTitle: 'Teorema di Rolle', notePath: '/vault/Matematica/Teorema di Rolle.md', at: 1 }])
        : id === '33333333-3333-4333-8333-333333333333'
          ? reduceSession([{ t: 'created', id, topic: 'Boh', at: 1 }])
          : null,
    onUpdate: (m) => updates.push(m)
  })
  return { g, ask, updates }
}
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 20))

describe('note generator', () => {
  it('creates a note from a vault note in the background', async () => {
    const { g, ask, updates } = setup()
    const id = await g.create({ sourcePath: '/vault/Matematica/Teorema di Rolle.md' })
    expect(id).toMatch(ID_RE)
    await settle()
    const stored = await g.get(id)
    expect(stored.status).toBe('ready')
    expect(stored.nota?.title).toBe('Teorema di Rolle')
    expect(stored.dropped).toBe(0)
    expect(stored.sourceTitle).toBe('Teorema di Rolle')
    const req = (ask as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(req).toMatchObject({ task: 'note', timeoutMs: 480_000, cwd: join(dir, 'ai-work') })
    expect(req.prompt).toContain('## 1. Enunciato')
    expect(updates.map((u) => u.status)).toEqual(['generating', 'ready'])
    expect(JSON.parse(await readFile(join(dir, 'notes', `${id}.json`), 'utf8')).status).toBe('ready')
  })
  it('rejects a path that is not in the vault index', async () => {
    await expect(setup().g.create({ sourcePath: '/etc/passwd' })).rejects.toThrow('Nota non trovata nel vault')
  })
  it('rejects an iCloud placeholder', async () => {
    await expect(setup().g.create({ sourcePath: '/vault/Matematica/Nuvola.md' })).rejects.toThrow('Nota non trovata nel vault')
  })
  it('uses the note linked to a session and puts the session in the prompt', async () => {
    const { g, ask } = setup()
    const id = await g.create({ sessionId: '22222222-2222-4222-8222-222222222222' })
    await settle()
    expect((await g.get(id)).sessionId).toBe('22222222-2222-4222-8222-222222222222')
    expect((ask as ReturnType<typeof vi.fn>).mock.calls[0][0].prompt).toContain('SESSIONE DI STUDIO')
  })
  it('rejects a session without a vault note', async () => {
    await expect(setup().g.create({ sessionId: '33333333-3333-4333-8333-333333333333' })).rejects.toThrow('La sessione non è collegata a una nota del vault')
  })
  it('records a friendly error when the engine times out, and retry recovers', async () => {
    let n = 0
    const ask = vi.fn(async () => {
      if (n++ === 0) throw new AiTimeoutError('agy', 480_000)
      return { data: parseNota(raw), fromCache: false, engine: 'agy' as const }
    })
    const { g } = setup(ask as never)
    const id = await g.create({ sourcePath: '/vault/Matematica/Teorema di Rolle.md' })
    await settle()
    const failed = await g.get(id)
    expect(failed.status).toBe('error')
    expect(failed.error).toMatch(/tempo/)
    await g.retry(id)
    await settle()
    expect((await g.get(id)).status).toBe('ready')
  })
  it('reports a generation interrupted by a restart', async () => {
    await mkdir(join(dir, 'notes'), { recursive: true })
    const id = '44444444-4444-4444-8444-444444444444'
    await writeFile(join(dir, 'notes', `${id}.json`), JSON.stringify({ id, createdAt: 1, updatedAt: 1, status: 'generating', sourcePath: '/vault/Matematica/Teorema di Rolle.md', sourceTitle: 'Teorema di Rolle' }))
    const { g } = setup()
    const list = await g.list()
    expect(list[0]).toMatchObject({ id, status: 'error', error: 'Generazione interrotta. Riprova.', title: 'Teorema di Rolle' })
    expect((await g.get(id)).status).toBe('error')
  })
  it('lists newest first, titled by the nota', async () => {
    const { g } = setup()
    const a = await g.create({ sourcePath: '/vault/Matematica/Teorema di Rolle.md' })
    await settle()
    await new Promise((r) => setTimeout(r, 5))
    const b = await g.create({ sourcePath: '/vault/Matematica/Teorema di Rolle.md' })
    await settle()
    const list = await g.list()
    expect(list.map((m) => m.id)).toEqual([b, a])
    expect(list[0].title).toBe('Teorema di Rolle')
    expect('nota' in list[0]).toBe(false)
  })
})

describe('fake note (e2e seam)', () => {
  it('is a complete nota with nothing dropped', async () => {
    const { FAKE_NOTA } = await import('../../src/main/notes/fake-note')
    expect(parseNota(FAKE_NOTA).dropped).toBe(0)
  })
})
