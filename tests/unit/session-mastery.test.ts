import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MASTERY,
  reduceSession,
  fsrsEvidence,
  checkTurnAgainst,
  type SessionState
} from '../../src/main/session/events'
import type { MinimalTree } from '../../src/main/session/minimal-tree'
const tree: MinimalTree = {
  goalIds: ['g'],
  nodes: [
    {
      id: 'g',
      name: 'Goal',
      statement: 'G',
      role: 'base',
      R: null,
      state: 'mai visto',
      weaknesses: [],
      sections: {},
      birth: 'n',
      goal: true
    }
  ],
  chains: [],
  pruned: []
}
const base = { t: 'created' as const, id: 's', topic: 'x', tree, at: 0 }
const q = (id: string) => ({
  id,
  role: 'check' as const,
  kind: 'open' as const,
  prompt: '?',
  nodeId: 'g'
})
const ans = (id: string, at: number) => ({
  t: 'learner' as const,
  text: 'yes',
  question: q(id),
  answer: { questionId: id, text: 'yes' },
  at
})
describe('session mastery', () => {
  it('mastery via two open answers and FSRS caps one grade below Easy', () => {
    const s = reduceSession([
      base,
      { t: 'teacher', turn: { phase: 'teach', blocks: [], question: q('1') }, at: 1 },
      ans('1', 2),
      { t: 'graded', questionId: '1', verdict: 'correct', hintsUsed: 0, reason: '', at: 2 },
      { t: 'teacher', turn: { phase: 'teach', blocks: [], question: q('2') }, at: 3 },
      ans('2', 4),
      { t: 'graded', questionId: '2', verdict: 'correct', hintsUsed: 0, reason: '', at: 4 }
    ])
    expect(s.doneNodeIds).toContain('g')
    expect(fsrsEvidence(s)).toHaveLength(1)
    expect(fsrsEvidence(s)[0].grade).toBeLessThan(4)
    expect(s.readyToFinish).toBe(false)
    expect(DEFAULT_MASTERY.kOpen).toBe(2)
  })

  it('requires three correct choice answers when the choice threshold is three', () => {
    const events: Parameters<typeof reduceSession>[0] = [base]
    for (let i = 1; i <= 3; i++) {
      const question = {
        ...q(String(i)),
        kind: 'choice' as const,
        options: ['yes', 'no'],
        correct: 0,
        why: ['ok', 'no']
      }
      events.push({ t: 'teacher', turn: { phase: 'teach', blocks: [], question }, at: i * 2 - 1 })
      events.push({
        t: 'learner',
        text: 'yes',
        question,
        answer: { questionId: String(i), choice: 0 },
        at: i * 2
      })
    }
    expect(reduceSession(events).concepts.g.choiceStreak).toBe(3)
    expect(reduceSession(events).doneNodeIds).toContain('g')
  })

  it('resets mastery streaks and schedules a retest after an incorrect graded answer', () => {
    const s = reduceSession([
      base,
      { t: 'teacher', turn: { phase: 'teach', blocks: [], question: q('1') }, at: 1 },
      ans('1', 2),
      {
        t: 'graded',
        questionId: '1',
        verdict: 'incorrect',
        hintsUsed: 0,
        reason: 'Passaggio errato',
        at: 2
      }
    ])
    expect(s.concepts.g).toMatchObject({ status: 'repairing', openStreak: 0, choiceStreak: 0 })
    expect(s.pendingRetest).toMatchObject({ conceptId: 'g', afterTurns: 1 })
  })

  it('excludes peeked and contested evidence from mastery and FSRS', () => {
    const s = reduceSession([
      base,
      { t: 'teacher', turn: { phase: 'teach', blocks: [], question: q('1') }, at: 1 },
      ans('1', 2),
      { t: 'peeked', questionId: '1', at: 3 },
      { t: 'contested', questionId: '1', at: 4 }
    ])
    expect(s.evidence[0].excluded).toBe(true)
    expect(fsrsEvidence(s)).toEqual([])
  })

  it('uses the cold confirmation rule for a solid prior concept', () => {
    const s = reduceSession([
      { ...base, prior: { g: { state: 'la sai', S: 14, seen: true } } },
      { t: 'teacher', turn: { phase: 'teach', blocks: [], question: q('1') }, at: 1 },
      { ...ans('1', 2), answer: { questionId: '1', text: 'yes', confidence: 90 } },
      { t: 'graded', questionId: '1', verdict: 'correct', hintsUsed: 0, reason: '', at: 2 }
    ])
    expect(s.doneNodeIds).toContain('g')
  })

  it('is ready to finish only after goal mastery and recall', () => {
    const events: Parameters<typeof reduceSession>[0] = [base]
    for (let i = 1; i <= 2; i++) {
      events.push({
        t: 'teacher',
        turn: { phase: 'teach', blocks: [], question: q(String(i)) },
        at: i * 3 - 2
      })
      events.push(ans(String(i), i * 3 - 1))
      events.push({
        t: 'graded',
        questionId: String(i),
        verdict: 'correct',
        hintsUsed: 0,
        reason: '',
        at: i * 3 - 1
      })
    }
    const recall = { ...q('r'), role: 'recall' as const }
    events.push({
      t: 'teacher',
      turn: { phase: 'consolidate', blocks: [], question: recall },
      at: 7
    })
    events.push({ ...ans('r', 8), question: recall })
    events.push({
      t: 'graded',
      questionId: 'r',
      verdict: 'correct',
      hintsUsed: 0,
      reason: '',
      at: 8
    })
    expect(reduceSession(events).readyToFinish).toBe(true)
  })

  it('chooses the second evidence for a new concept and never proposes Easy', () => {
    const events: Parameters<typeof reduceSession>[0] = [base]
    const newQuestion = (id: string) => ({ ...q(id), nodeId: 'new:idea' })
    events.push({
      t: 'teacher',
      turn: { phase: 'teach', blocks: [], question: newQuestion('a') },
      at: 1
    })
    events.push({ ...ans('a', 2), question: newQuestion('a') })
    events.push({
      t: 'graded',
      questionId: 'a',
      verdict: 'correct',
      hintsUsed: 0,
      reason: '',
      at: 2
    })
    events.push({
      t: 'teacher',
      turn: { phase: 'teach', blocks: [], question: newQuestion('b') },
      at: 3
    })
    events.push({ ...ans('b', 4), question: newQuestion('b') })
    events.push({
      t: 'graded',
      questionId: 'b',
      verdict: 'partial',
      hintsUsed: 0,
      reason: '',
      at: 4
    })
    const evidence = fsrsEvidence(reduceSession(events))
    expect(evidence).toHaveLength(1)
    expect(evidence[0]).toMatchObject({ conceptId: 'new:idea', grade: 1 })
    expect(evidence[0].grade).not.toBe(4)
  })

  it('checks done, probe, plan ids, nodeId, and game frequency rules', () => {
    const state = reduceSession([base]) as SessionState
    const done = {
      phase: 'done',
      blocks: [],
      summary: { learned: [], shaky: [], misconceptions: [] }
    } as const
    expect(checkTurnAgainst(state, done)).toContain('obiettivo')
    expect(
      checkTurnAgainst(
        { ...state, probeCount: 3 },
        { phase: 'probe', blocks: [], question: { ...q('p'), role: 'probe' } }
      )
    ).toContain('misura')
    expect(
      checkTurnAgainst(state, {
        phase: 'plan',
        blocks: [],
        plan: { nodes: [{ id: 'bad', title: 'X', status: 'todo' }], edges: [] }
      })
    ).toContain('id del piano')
    expect(
      checkTurnAgainst(state, {
        phase: 'teach',
        blocks: [],
        question: { id: 'x', role: 'check', kind: 'open', prompt: '?' }
      })
    ).toContain('nodeId')
    expect(
      checkTurnAgainst(state, {
        phase: 'teach',
        blocks: [],
        question: {
          id: 'game',
          role: 'check',
          kind: 'game',
          prompt: '?',
          game: {
            type: 'speed',
            items: [
              { statement: 'a', true: true, why: '' },
              { statement: 'b', true: false, why: '' },
              { statement: 'c', true: true, why: '' }
            ]
          }
        }
      })
    ).toContain('gioco')
  })
})
