import { describe, expect, it } from 'vitest'
import { learnerBubble } from '../../src/renderer/src/practice/submission-copy'
import type { Submission } from '../../src/shared/practice-protocol'

describe('submission-copy: learnerBubble', () => {
  it('maps hint to "Mi serve un indizio"', () => {
    expect(learnerBubble({ kind: 'hint' })).toBe('Mi serve un indizio')
  })

  it('maps next to "Prossimo problema"', () => {
    expect(learnerBubble({ kind: 'next' })).toBe('Prossimo problema')
  })

  it('maps dismiss to "Lascio questo problema"', () => {
    expect(learnerBubble({ kind: 'dismiss' })).toBe('Lascio questo problema')
  })

  it('maps end to "Basta così per oggi"', () => {
    expect(learnerBubble({ kind: 'end' })).toBe('Basta così per oggi')
  })

  it('maps thinking, ask, restate to trimmed text or null if empty', () => {
    expect(learnerBubble({ kind: 'thinking', text: '  provo con Taylor  ' })).toBe('provo con Taylor')
    expect(learnerBubble({ kind: 'thinking', text: '   ' })).toBeNull()
    expect(learnerBubble({ kind: 'thinking' })).toBeNull()

    expect(learnerBubble({ kind: 'ask', text: 'Perché vale?' })).toBe('Perché vale?')
    expect(learnerBubble({ kind: 'ask', text: '' })).toBeNull()

    expect(learnerBubble({ kind: 'restate', text: 'Riformulo la tesi' })).toBe('Riformulo la tesi')
    expect(learnerBubble({ kind: 'restate', text: '   ' })).toBeNull()
  })

  it('maps triage to "Strumento: ${text}" or null if empty', () => {
    expect(learnerBubble({ kind: 'triage', text: 'Integrazione per parti' })).toBe('Strumento: Integrazione per parti')
    expect(learnerBubble({ kind: 'triage', text: '   ' })).toBeNull()
    expect(learnerBubble({ kind: 'triage' })).toBeNull()
  })

  it('maps compass to brief text with the three parts (So già / Mi blocco / Domanda)', () => {
    const res = learnerBubble({
      kind: 'compass',
      compass: { known: 'la formula base', stuck: 'sul segno', question: 'come si calcola?' }
    })
    expect(res).toBe('So già: la formula base / Mi blocco: sul segno / Domanda: come si calcola?')
  })

  it('returns null for start', () => {
    expect(learnerBubble({ kind: 'start', text: 'anything' })).toBeNull()
  })

  it('returns null for unknown kind', () => {
    expect(learnerBubble({ kind: 'unknown_kind' as never })).toBeNull()
  })

  it('never outputs «gradino», «tentativo», or «protocollo»', () => {
    const sampleSubmissions: Submission[] = [
      { kind: 'hint' },
      { kind: 'next' },
      { kind: 'dismiss' },
      { kind: 'end' },
      { kind: 'triage', text: 'matrice' },
      { kind: 'compass', compass: { known: 'a', stuck: 'b', question: 'c' } },
      { kind: 'start', text: 'start' }
    ]

    for (const sub of sampleSubmissions) {
      const out = learnerBubble(sub)
      if (out) {
        expect(out.toLowerCase()).not.toContain('gradino')
        expect(out.toLowerCase()).not.toContain('tentativo')
        expect(out.toLowerCase()).not.toContain('protocollo')
      }
    }
  })
})
