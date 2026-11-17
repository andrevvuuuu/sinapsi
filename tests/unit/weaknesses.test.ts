import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { weaknessStore } from '../../src/main/memory/store'

describe('weaknessStore', () => {
  it('tracks latest status and resolves all active weaknesses for a concept', async () => {
    const store = weaknessStore(await mkdtemp(join(tmpdir(), 'sinapsi-weak-')))
    await store.append({ id: 'w_a', conceptId: 'n_a', text: 'wrong rule', kind: 'misconception', source: 'practice', at: 1, status: 'active' })
    await store.append({ id: 'w_b', conceptId: 'n_a', text: 'missed condition', kind: 'gap', source: 'review', at: 2, status: 'active' })
    await store.append({ id: 'w_c', conceptId: 'n_b', text: 'other', kind: 'execution', source: 'practice', at: 3, status: 'active' })
    expect((await store.activeFor(['n_a'])).map((w) => w.id)).toEqual(['w_a', 'w_b'])
    await store.resolveByEvidence('n_a', 4, 'retest:1')
    expect((await store.active()).map((w) => w.id)).toEqual(['w_c'])
    expect((await store.read()).filter((w) => w.status === 'resolved')).toHaveLength(2)
  })
})
