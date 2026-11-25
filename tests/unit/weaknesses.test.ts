import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { weaknessStore } from '../../src/main/memory/store'
import { misconceptionConceptIds, type WeaknessLine } from '../../src/shared/memory-types'

describe('misconceptionConceptIds', () => {
  it('filters active weaknesses of kind misconception and discrimination only', () => {
    const ws: WeaknessLine[] = [
      { id: '1', conceptId: 'c1', text: 'err', kind: 'misconception', source: 'session', at: 1, status: 'active' },
      { id: '2', conceptId: 'c2', text: 'err', kind: 'discrimination', source: 'practice', at: 1, status: 'active' },
      { id: '3', conceptId: 'c3', text: 'err', kind: 'gap', source: 'review', at: 1, status: 'active' },
      { id: '4', conceptId: 'c4', text: 'err', kind: 'execution', source: 'session', at: 1, status: 'active' },
      { id: '5', conceptId: 'c1', text: 'err duplicate', kind: 'misconception', source: 'session', at: 1, status: 'active' },
      { id: '6', conceptId: 'c5', text: 'err', kind: 'misconception', source: 'session', at: 1, status: 'resolved' },
      { id: '7', text: 'err no concept', kind: 'misconception', source: 'session', at: 1, status: 'active' }
    ]
    const ids = misconceptionConceptIds(ws)
    expect(ids).toEqual(new Set(['c1', 'c2']))
  })
})

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

  it('is idempotent when resolving with the same ref and does not duplicate resolved lines', async () => {
    const store = weaknessStore(await mkdtemp(join(tmpdir(), 'sinapsi-weak-idemp-')))
    await store.append({ id: 'w_1', conceptId: 'n_a', text: 'err', kind: 'misconception', source: 'session', at: 1, status: 'active' })
    await store.append({ id: 'w_2', conceptId: 'n_a', text: 'disc', kind: 'discrimination', source: 'practice', at: 2, status: 'active' })

    // First resolution
    await store.resolveByEvidence('n_a', 10, 'session:s1:q1')
    expect(await store.active()).toHaveLength(0)
    const resolvedFirst = (await store.read()).filter((w) => w.status === 'resolved')
    expect(resolvedFirst).toHaveLength(2)

    // Second resolution with identical ref
    await store.resolveByEvidence('n_a', 20, 'session:s1:q1')
    const resolvedSecond = (await store.read()).filter((w) => w.status === 'resolved')
    expect(resolvedSecond).toHaveLength(2)

    // Third resolution with different ref for already resolved weaknesses
    await store.resolveByEvidence('n_a', 30, 'session:s2:q2')
    const resolvedThird = (await store.read()).filter((w) => w.status === 'resolved')
    expect(resolvedThird).toHaveLength(2)
  })

  it('does not duplicate resolved lines under concurrent resolution', async () => {
    const store = weaknessStore(await mkdtemp(join(tmpdir(), 'sinapsi-weak-conc-')))
    await store.append({ id: 'w_a', conceptId: 'n_a', text: 'err', kind: 'misconception', source: 'practice', at: 1, status: 'active' })
    await Promise.all([
      store.resolveByEvidence('n_a', 2, 'ref:1'),
      store.resolveByEvidence('n_a', 2, 'ref:1')
    ])
    const lines = await store.read()
    expect(lines.filter((l) => l.status === 'resolved')).toHaveLength(1)
  })
})
