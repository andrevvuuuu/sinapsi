import { describe, expect, it } from 'vitest'
import { buildTree } from '../../src/renderer/src/home/build-tree'
import type { VaultNote } from '../../src/shared/vault-types'

const note = (folder: string, title: string, available = true): VaultNote => ({
  path: `/v/${folder ? folder + '/' : ''}${title}.md`, title, folder, tags: [], aliases: [], links: [], headings: [], blockIds: [], subject: null, mtime: 0, size: 0, available
})

describe('buildTree', () => {
  it('puts folders before notes and sorts with Italian rules', () => {
    const t = buildTree([note('', 'zeta'), note('Matematica', 'Rolle'), note('', 'Èra'), note('', 'Era'), note('Arte', 'Dada')])
    expect(t.map((n) => n.name)).toEqual(['Arte', 'Matematica', 'Era', 'Èra', 'zeta'])
  })

  it('nests sub-folders', () => {
    const t = buildTree([note('Scuola/Storia', 'Crisi del 1929')])
    expect(t[0].name).toBe('Scuola')
    expect(t[0].children![0].name).toBe('Storia')
    expect(t[0].children![0].children![0].note!.title).toBe('Crisi del 1929')
  })

  it('keeps unavailable notes with their flag', () => {
    const t = buildTree([note('', 'Algebra delle Matrici', false)])
    expect(t[0].note!.available).toBe(false)
  })
})
