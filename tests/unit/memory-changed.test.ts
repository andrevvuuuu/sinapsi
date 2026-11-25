import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { memoryStore } from '../../src/main/memory/store'

const line = { conceptId: 'c', at: 1, grade: 3, correct: true, via: 'review' } as never

describe('memoryStore onAppend', () => {
  it('runs after each written line', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-mem-'))
    const onAppend = vi.fn()
    const store = memoryStore(dir, onAppend)
    await store.append(line)
    await store.append(line)
    expect(onAppend).toHaveBeenCalledTimes(2)
    expect(await store.read()).toHaveLength(2)
  })

  it('does not run when the line could not be written', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sinapsi-mem-'))
    const blocker = join(root, 'file')
    await writeFile(blocker, 'x')
    const onAppend = vi.fn()
    await expect(memoryStore(join(blocker, 'memory'), onAppend).append(line)).rejects.toThrow()
    expect(onAppend).not.toHaveBeenCalled()
  })
})
