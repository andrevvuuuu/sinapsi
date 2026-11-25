import { describe, expect, it } from 'vitest'
import { resolvePath } from '../../src/main/graph/resolve-path'

describe('resolvePath', () => {
  it('follows ordered rename chains and stops safely at cycles', () => {
    const moves = [
      { from: 'A.md', to: 'B.md', at: 1 },
      { from: 'B.md', to: 'C.md', at: 2 },
      { from: 'C.md', to: 'B.md', at: 3 }
    ]

    expect(resolvePath('A.md', moves)).toBe('C.md')
  })
})
