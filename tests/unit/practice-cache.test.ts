import { appendFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/main/store/jsonl', async (orig) => {
  const real = await orig<typeof import('../../src/main/store/jsonl')>()
  return { ...real, readJsonl: vi.fn(real.readJsonl) }
})
const { readJsonl } = await import('../../src/main/store/jsonl')
const { createPracticeRunner } = await import('../../src/main/practice/runner')
const { memoryStore } = await import('../../src/main/memory/store')

const problem = { id: 'p1', statement: 'Mostra che…', mode: 'recall' as const, targets: ['n_1'], modelSolution: 'x' }

describe('practice runner read cache', () => {
  it('reads an unchanged session file once, and again only after it changes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-pcache-'))
    const turns = [{ phase: 'warmup', blocks: [], problem }]
    const converse = vi.fn(async (req: { conversationId: string; schema: { parse(x: unknown): unknown } }) => ({ data: req.schema.parse(turns.shift()), conversationId: req.conversationId, engine: 'claude' as const }))
    const runner = createPracticeRunner({ bridge: { converse, ask: vi.fn() } as never, dir: join(dir, 'p'), material: async () => 'x', topic: async () => 'Rolle', memory: memoryStore(join(dir, 'm')), onUpdate: vi.fn(), now: () => 1000 })
    const id = await runner.create({ conceptIds: ['n_1'], sourceIds: [], free: '' })
    await runner.retry(id)
    const reads = vi.mocked(readJsonl)
    await runner.practiced()
    reads.mockClear()
    await runner.practiced()
    await runner.list()
    expect(reads).not.toHaveBeenCalled()
    await appendFile(join(dir, 'p', `${id}.jsonl`), JSON.stringify({ t: 'learner', submission: { kind: 'thinking', text: 'idea' }, text: 'idea', at: 2000 }) + '\n')
    const s = await runner.get(id)
    expect(reads).toHaveBeenCalledTimes(1)
    expect(s.items.at(-1)).toMatchObject({ kind: 'learner', text: 'idea' })
    // A state built from the cache can be changed without touching the next one.
    s.items.length = 0
    expect((await runner.get(id)).items.length).toBeGreaterThan(0)
  })
})
