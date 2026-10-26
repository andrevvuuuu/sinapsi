import { describe, expect, it } from 'vitest'
import { matchNote } from '../../src/main/session/note-match'
import { firstMessage, TEACHER_SYSTEM_PROMPT } from '../../src/main/session/prompt'
import type { VaultIndex, VaultNote } from '../../src/shared/vault-types'

const n = (title: string, aliases: string[] = [], available = true): VaultNote => ({
  path: `/v/${title}.md`, title, folder: '', tags: [], aliases, links: [], headings: [], blockIds: [], subject: null, mtime: 0, size: 0, available
})
const idx: VaultIndex = {
  root: '/v', scannedAt: 0, subjects: [],
  notes: [n('Teorema di Lagrange del Valor Medio', ['Teorema di Lagrange']), n('Teorema di Rolle', ['Rolle']), n('Punti Critici o Stazionari'), n('Algebra delle Matrici', [], false)]
}

describe('matchNote', () => {
  it('finds the note by title words', () => {
    expect(matchNote(idx, 'teorema di lagrange')?.title).toBe('Teorema di Lagrange del Valor Medio')
  })
  it('prefers an exact alias', () => {
    expect(matchNote(idx, 'Rolle')?.title).toBe('Teorema di Rolle')
  })
  it('returns null when nothing matches', () => {
    expect(matchNote(idx, 'fotosintesi clorofilliana')).toBeNull()
  })
  it('ignores notes not downloaded from iCloud', () => {
    expect(matchNote(idx, 'algebra delle matrici')).toBeNull()
  })
})

describe('teacher prompt', () => {
  it('names every question role and the JSON protocol', () => {
    for (const r of ['goal', 'probe', 'plan', 'predict', 'check', 'recall']) expect(TEACHER_SYSTEM_PROMPT).toContain(`"${r}"`)
    expect(TEACHER_SYSTEM_PROMPT).toContain('JSON')
  })
  it('truncates long notes with a marker', () => {
    const msg = firstMessage('Lagrange', { title: 'Teorema di Lagrange', text: 'x'.repeat(70_000) })
    expect(msg).toContain('«Teorema di Lagrange»')
    expect(msg).toContain('[…nota troncata]')
    expect(msg.length).toBeLessThan(61_000)
  })
  it('works without a note', () => {
    expect(firstMessage('Glicolisi')).toContain('Glicolisi')
  })
})
