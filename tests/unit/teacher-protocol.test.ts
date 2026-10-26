import { describe, expect, it } from 'vitest'
import { formatLearnerReply, teacherJsonSchema, TeacherTurnSchema, type Question } from '../../src/shared/teacher-protocol'

const probe = {
  phase: 'probe',
  blocks: [{ type: 'text', md: 'Vediamo da dove partiamo.' }],
  question: { id: 'q1', role: 'probe', kind: 'choice', prompt: 'Cosa dice Rolle?', options: ['A', 'B', 'C', 'D'], correct: 0, why: ['sì', 'no', 'no', 'no'] }
}

describe('TeacherTurnSchema', () => {
  it('accepts a valid probe turn', () => {
    expect(TeacherTurnSchema.safeParse(probe).success).toBe(true)
  })
  it('rejects a correct index out of range', () => {
    expect(TeacherTurnSchema.safeParse({ ...probe, question: { ...probe.question, correct: 4 } }).success).toBe(false)
  })
  it('rejects explanations that do not match the options', () => {
    expect(TeacherTurnSchema.safeParse({ ...probe, question: { ...probe.question, why: ['x'] } }).success).toBe(false)
  })
  it('rejects plan edges to unknown nodes', () => {
    const plan = { nodes: [{ id: 'a', title: 'A', status: 'known' }], edges: [['a', 'z']] }
    expect(TeacherTurnSchema.safeParse({ phase: 'plan', blocks: [], plan }).success).toBe(false)
  })
  it('requires a summary when the session is done', () => {
    expect(TeacherTurnSchema.safeParse({ phase: 'done', blocks: [] }).success).toBe(false)
    expect(TeacherTurnSchema.safeParse({ phase: 'done', blocks: [], summary: { learned: ['x'], shaky: [], misconceptions: [] } }).success).toBe(true)
  })
  it('exports a JSON schema for the CLI', () => {
    const s = teacherJsonSchema() as { type: string; properties: Record<string, unknown> }
    expect(s.type).toBe('object')
    expect(s.properties.blocks).toBeDefined()
  })
  it('exports a schema the Claude CLI accepts (no $schema key, no tuples)', () => {
    const text = JSON.stringify(teacherJsonSchema())
    expect(text).not.toContain('$schema')
    expect(text).not.toContain('prefixItems')
  })
})

describe('formatLearnerReply', () => {
  const q = probe.question as Question
  it('formats a choice with confidence and reasoning', () => {
    expect(formatLearnerReply({ ...q, role: 'check', id: 'q3' }, { questionId: 'q3', choice: 1, confidence: 80, text: 'perché sì' })).toBe(
      'Risposta alla domanda q3 (verifica): B «B» — sbagliata (giusta: A) — fiducia 80% — ragionamento: perché sì'
    )
  })
  it('formats "Non lo so"', () => {
    expect(formatLearnerReply(q, { questionId: 'q1', dontKnow: true })).toBe('Risposta alla domanda q1 (misura): Non lo so')
  })
  it('formats an open answer with reading thoughts', () => {
    const open: Question = { id: 'q5', role: 'predict', kind: 'open', prompt: 'Come faresti?' }
    expect(formatLearnerReply(open, { questionId: 'q5', text: 'tolgo la retta', thoughts: 'mi ricorda Rolle' })).toBe(
      'Risposta alla domanda q5 (previsione): «tolgo la retta» — pensieri durante la lettura: mi ricorda Rolle'
    )
  })
})
