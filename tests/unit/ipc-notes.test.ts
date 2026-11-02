import { describe, expect, it, vi } from 'vitest'
import { makeNoteHandlers } from '../../src/main/ipc-handlers'
import type { NoteGenerator } from '../../src/main/notes/generator'

const ID = '11111111-1111-4111-8111-111111111111'
function setup() {
  const gen: NoteGenerator = {
    create: vi.fn(async () => ID),
    retry: vi.fn(async () => undefined),
    refresh: vi.fn(async () => 0),
    list: vi.fn(async () => []),
    get: vi.fn(async () => ({}) as never)
  }
  return { gen, h: makeNoteHandlers(gen) }
}

describe('note handlers', () => {
  it('creates from a source path', async () => {
    const { h, gen } = setup()
    expect(await h.create({ sourcePath: '/v/a.md' })).toBe(ID)
    expect(gen.create).toHaveBeenCalledWith({ sourcePath: '/v/a.md' })
  })
  it('creates from a session id', async () => {
    const { h, gen } = setup()
    await h.create({ sessionId: ID })
    expect(gen.create).toHaveBeenCalledWith({ sessionId: ID })
  })
  it('rejects a request with neither source nor session', async () => {
    await expect(setup().h.create({})).rejects.toThrow()
  })
  it('rejects ids that are not UUIDs', async () => {
    await expect(setup().h.get('../x')).rejects.toThrow()
    await expect(setup().h.retry('x')).rejects.toThrow()
    await expect(setup().h.create({ sessionId: 'nope' })).rejects.toThrow()
  })
  it('rejects an overlong path', async () => {
    await expect(setup().h.create({ sourcePath: 'a'.repeat(1025) })).rejects.toThrow()
  })
})
