import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ChainSource } from '../../src/shared/graph-types'
import { graphStore } from '../../src/main/graph/store'
import { createChainExplainer } from '../../src/main/graph/explain'
import { ExtractReplySchema } from '../../src/main/graph/extract'

const source: ChainSource = { chainId: 'c1', notePath: '/v/n.md', premises: [{ id: 'a', name: 'A', statement: 'A vale.' }], conclusion: { id: 'b', name: 'B', statement: 'B segue.' }, excerpts: [{ conceptId: 'b', heading: '§1', text: 'Dal fatto A segue B.' }] }
const engine = { engine: 'claude' as const, model: 'sonnet' }

describe('chain explanation', () => {
  it('accepts legacy extracted chains without why', () => {
    const parsed = ExtractReplySchema.parse({ propositions: [], chains: [{ premises: ['p1'], conclusion: 'p2' }] })
    expect(parsed.chains[0]).not.toHaveProperty('why')
  })
  it('caches by chain and grounded source, then misses when the source changes', async () => {
    const store = graphStore(await mkdtemp(join(tmpdir(), 'sinapsi-explain-')))
    let calls = 0
    let current = source
    const explain = createChainExplainer({
      bridge: { ask: (async (req: { task: string }) => { calls++; return { data: req.task === 'grade' ? { verdict: 'supported' } : { text: 'A implica B.' }, engine: calls === 1 ? 'claude' : 'agy', fromCache: false } }) as never },
      source: async () => current,
      store,
      engine: async () => engine,
      otherEngine: async () => ({ engine: 'agy', model: 'gemini-3.8-flash-medium' }),
      now: () => 7
    })
    const first = await explain('c1')
    expect(first).toMatchObject({ text: 'A implica B.', verdict: 'supported', at: 7 })
    expect(await explain('c1')).toEqual(first)
    expect(calls).toBe(2)
    current = { ...source, excerpts: [{ conceptId: 'b', heading: '§1', text: 'Testo aggiornato.' }] }
    await explain('c1')
    expect(calls).toBe(4)
  })

  it('returns unverified when no other engine is available', async () => {
    const store = graphStore(await mkdtemp(join(tmpdir(), 'sinapsi-explain-')))
    const explain = createChainExplainer({
      bridge: { ask: (async () => ({ data: { text: 'A implica B.' }, engine: 'claude', fromCache: false })) as never },
      source: async () => source,
      store,
      engine: async () => engine,
      otherEngine: async () => null,
      now: () => 8
    })
    expect((await explain('c1')).verdict).toBe('unverified')
  })
})
