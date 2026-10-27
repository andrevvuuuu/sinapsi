import { describe, expect, it } from 'vitest'
import { checkTurnAgainst, formatSubmission, practiceJsonSchema, PracticeTurnSchema, SubmissionSchema } from '../../src/shared/practice-protocol'

const problem = { id: 'p1', statement: 'Mostra che $|\\sin a-\\sin b|\\le|a-b|$.', mode: 'recall' as const, targets: ['n_1'], modelSolution: 'Valor medio.' }

describe('PracticeTurnSchema', () => {
  it('accepts a pose, a hint, a conclusion and a final summary', () => {
    expect(PracticeTurnSchema.safeParse({ phase: 'warmup', blocks: [{ type: 'text', md: 'Si parte.' }], problem }).success).toBe(true)
    expect(PracticeTurnSchema.safeParse({ phase: 'warmup', blocks: [], hint: { rung: 1, md: 'Una differenza di valori.' } }).success).toBe(true)
    expect(PracticeTurnSchema.safeParse({ phase: 'body', blocks: [], conclude: { outcome: 'solved_hints', verdict: 'Ok.', retest: true, miss: 'cue' } }).success).toBe(true)
    expect(PracticeTurnSchema.safeParse({ phase: 'done', blocks: [], summary: { solved: ['a'], retest: [], note: 'Bene.' } }).success).toBe(true)
  })
  it.each([
    ['two actions in one turn', { phase: 'body', blocks: [], problem, hint: { rung: 0, md: 'x' } }],
    ['a rung out of the ladder', { phase: 'body', blocks: [], hint: { rung: 6, md: 'x' } }],
    ['a summary outside done', { phase: 'body', blocks: [], summary: { solved: [], retest: [], note: '' } }],
    ['done without a summary', { phase: 'done', blocks: [] }],
    ['a spot-the-error problem with one line', { phase: 'body', blocks: [], problem: { ...problem, lines: ['solo una'] } }]
  ])('rejects %s', (_n, t) => {
    expect(PracticeTurnSchema.safeParse(t).success).toBe(false)
  })
  it('exports a JSON schema without $schema', () => {
    expect(practiceJsonSchema()).not.toHaveProperty('$schema')
    expect(JSON.stringify(practiceJsonSchema())).toContain('modelSolution')
  })
})

describe('checkTurnAgainst', () => {
  it('refuses a new problem while one is open, and a hint or conclusion with none', () => {
    const pose = { phase: 'body' as const, blocks: [], problem }
    const conclude = { phase: 'body' as const, blocks: [], conclude: { outcome: 'solved' as const, verdict: 'x', retest: false } }
    expect(checkTurnAgainst({ active: 'p0' }, pose)).toMatch(/già un problema aperto/)
    expect(checkTurnAgainst({}, pose)).toBeNull()
    expect(checkTurnAgainst({}, conclude)).toMatch(/nessun problema aperto/)
    expect(checkTurnAgainst({}, { phase: 'body', blocks: [], hint: { rung: 0, md: 'x' } })).toMatch(/nessun problema aperto/)
    expect(checkTurnAgainst({ active: 'p0' }, conclude)).toBeNull()
    expect(checkTurnAgainst({ active: 'p0' }, { phase: 'body', blocks: [], problem: { ...problem, id: 'p0' } })).toMatch(/già un problema aperto/)
  })
})

describe('submissions', () => {
  it('validates and formats what Andrea sends, in Italian', () => {
    expect(SubmissionSchema.safeParse({ kind: 'thinking', text: 'x'.repeat(20_001) }).success).toBe(false)
    const lines = { ...problem, lines: ['f continua', 'f(-1)=f(1)', 'per Rolle esiste c'] }
    expect(formatSubmission({ kind: 'thinking', text: 'uso il valor medio' })).toBe('Il mio ragionamento: uso il valor medio')
    expect(formatSubmission({ kind: 'thinking', text: 'qui', line: 2, photoText: '|sin a − sin b| = |cos c||a−b|' }, lines)).toBe(
      'Riga scelta: 3 «per Rolle esiste c»\nIl mio ragionamento: qui\nDal foglio fotografato:\n|sin a − sin b| = |cos c||a−b|'
    )
    expect(formatSubmission({ kind: 'hint' })).toBe('Mi serve un indizio.')
    expect(formatSubmission({ kind: 'next' })).toBe('Prossimo problema.')
    expect(formatSubmission({ kind: 'ask', text: 'perché R1?' })).toBe('Domanda sul problema appena concluso: perché R1?')
    expect(formatSubmission({ kind: 'dismiss' })).toBe('Lascio questo problema: mostrami la soluzione.')
    expect(formatSubmission({ kind: 'end' })).toBe('Basta così per oggi: chiudi la sessione.')
  })
})
