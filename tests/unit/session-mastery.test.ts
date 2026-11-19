import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MASTERY,
  reduceSession,
  fsrsEvidence,
  checkTurnAgainst,
  stageInstruction,
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

  it('requires three correct choice answers AND at least one correct generative answer for mastery', () => {
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
    // Three choices reach choiceStreak 3, but without a correct generative answer the node is NOT done
    expect(reduceSession(events).concepts.g.choiceStreak).toBe(3)
    expect(reduceSession(events).doneNodeIds).not.toContain('g')

    // Adding one correct open answer satisfies the generative gate
    events.push({ t: 'teacher', turn: { phase: 'teach', blocks: [], question: q('open-1') }, at: 7 })
    events.push(ans('open-1', 8))
    events.push({ t: 'graded', questionId: 'open-1', verdict: 'correct', hintsUsed: 0, reason: 'Bravo', at: 8 })
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

  it('records misconceptionHit when incorrect answer has confidence >= MISCONCEPTION_CONFIDENCE', () => {
    const sSure = reduceSession([
      base,
      { t: 'teacher', turn: { phase: 'teach', blocks: [], question: q('1') }, at: 1 },
      { ...ans('1', 2), answer: { questionId: '1', text: 'err', confidence: 63 } },
      { t: 'graded', questionId: '1', verdict: 'incorrect', hintsUsed: 0, reason: 'err', at: 2 }
    ])
    expect(sSure.misconceptionHits).toHaveLength(1)
    expect(sSure.misconceptionHits[0].conceptId).toBe('g')

    const sUnsure = reduceSession([
      base,
      { t: 'teacher', turn: { phase: 'teach', blocks: [], question: q('1') }, at: 1 },
      { ...ans('1', 2), answer: { questionId: '1', text: 'err', confidence: 62 } },
      { t: 'graded', questionId: '1', verdict: 'incorrect', hintsUsed: 0, reason: 'err', at: 2 }
    ])
    expect(sUnsure.misconceptionHits).toHaveLength(0)
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

  it('prioritizes a cold probe for a previously reviewed goal and only uses that probe as FSRS evidence', () => {
    const prior = { g: { state: 'la sai' as const, S: 10, seen: true } }
    const state = reduceSession([
      { ...base, prior },
      { t: 'teacher', turn: { phase: 'teach', blocks: [], question: q('check') }, at: 1 },
      ans('check', 2),
      { t: 'graded', questionId: 'check', verdict: 'correct', hintsUsed: 0, reason: '', at: 2 }
    ])
    expect(stageInstruction(state)).toContain('prima di insegnare prerequisiti')
    expect(fsrsEvidence(state)).toEqual([])

    const probed = reduceSession([
      { ...base, prior },
      { t: 'teacher', turn: { phase: 'probe', blocks: [], question: { ...q('probe'), role: 'probe' } }, at: 1 },
      {
        ...ans('probe', 2),
        question: { ...q('probe'), role: 'probe' },
        answer: { questionId: 'probe', text: 'yes' }
      },
      { t: 'graded', questionId: 'probe', verdict: 'incorrect', hintsUsed: 0, reason: '', at: 2 },
      { t: 'teacher', turn: { phase: 'teach', blocks: [], question: q('check') }, at: 3 },
      ans('check', 4),
      { t: 'graded', questionId: 'check', verdict: 'correct', hintsUsed: 0, reason: '', at: 4 }
    ])
    expect(fsrsEvidence(probed)).toMatchObject([{ conceptId: 'g', evidence: 'probe', correct: false }])
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
    expect(evidence).toHaveLength(0)
  })

  it('records evidence as immediate for a new concept with only one evidence', () => {
    const s = reduceSession([
      base,
      { t: 'teacher', turn: { phase: 'teach', blocks: [], question: q('1') }, at: 1 },
      ans('1', 2),
      { t: 'graded', questionId: '1', verdict: 'correct', hintsUsed: 0, reason: '', at: 2 }
    ])
    const evs = fsrsEvidence(s)
    expect(evs).toHaveLength(1)
    expect(evs[0]).toMatchObject({
      conceptId: 'g',
      evidence: 'immediate',
      correct: true,
      grade: 3
    })
  })

  it('records evidence as recall when a new concept has a recall question', () => {
    const qRecall = { ...q('rec'), role: 'recall' as const }
    const s = reduceSession([
      base,
      { t: 'teacher', turn: { phase: 'teach', blocks: [], question: q('1') }, at: 1 },
      ans('1', 2),
      { t: 'graded', questionId: '1', verdict: 'correct', hintsUsed: 0, reason: '', at: 2 },
      { t: 'teacher', turn: { phase: 'consolidate', blocks: [], question: qRecall }, at: 3 },
      { ...ans('rec', 4), question: qRecall },
      { t: 'graded', questionId: 'rec', verdict: 'correct', hintsUsed: 0, reason: '', at: 4 }
    ])
    const evs = fsrsEvidence(s)
    expect(evs).toHaveLength(1)
    expect(evs[0]).toMatchObject({
      conceptId: 'g',
      evidence: 'recall',
      correct: true,
      grade: 3
    })
  })

  it('records evidence as recall when a new concept has only one evidence and it is recall', () => {
    const qRecall = { ...q('rec-only'), role: 'recall' as const }
    const s = reduceSession([
      base,
      { t: 'teacher', turn: { phase: 'consolidate', blocks: [], question: qRecall }, at: 1 },
      { ...ans('rec-only', 2), question: qRecall },
      { t: 'graded', questionId: 'rec-only', verdict: 'correct', hintsUsed: 0, reason: '', at: 2 }
    ])
    const evs = fsrsEvidence(s)
    expect(evs).toHaveLength(1)
    expect(evs[0]).toMatchObject({
      conceptId: 'g',
      evidence: 'recall',
      correct: true,
      grade: 3
    })
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

  it('cold confirmation rule requires the first active evidence to be generative', () => {
    const choiceQ = {
      ...q('c1'),
      kind: 'choice' as const,
      options: ['yes', 'no'],
      correct: 0,
      why: ['ok', 'no']
    }
    const stateChoice = reduceSession([
      { ...base, prior: { g: { state: 'la sai', S: 14, seen: true } } },
      { t: 'teacher', turn: { phase: 'teach', blocks: [], question: choiceQ }, at: 1 },
      {
        t: 'learner',
        text: 'yes',
        question: choiceQ,
        answer: { questionId: 'c1', choice: 0, confidence: 90 },
        at: 2
      }
    ])
    expect(stateChoice.doneNodeIds).not.toContain('g')
  })

  it('games: non-taboo games do not produce active evidence or FSRS evidence, but judged taboo increments openStreak', () => {
    const speedGame = {
      ...q('speed1'),
      kind: 'game' as const,
      game: {
        type: 'speed' as const,
        items: [
          { statement: '1', true: true, why: '' },
          { statement: '2', true: false, why: '' },
          { statement: '3', true: true, why: '' }
        ]
      }
    }
    const s1 = reduceSession([
      base,
      { t: 'teacher', turn: { phase: 'teach', blocks: [], question: speedGame }, at: 1 },
      {
        t: 'learner',
        text: 'game played',
        question: speedGame,
        answer: { questionId: 'speed1', game: { score: 3, total: 3, detail: '' } },
        at: 2
      }
    ])
    expect(s1.evidence[0].excluded).toBe(true)
    expect(s1.concepts.g.openStreak).toBe(0)
    expect(s1.concepts.g.choiceStreak).toBe(0)
    expect(fsrsEvidence(s1)).toEqual([])

    const tabooGame = {
      ...q('taboo1'),
      kind: 'game' as const,
      game: {
        type: 'taboo' as const,
        concept: 'Goal',
        forbidden: ['no', 'bad']
      }
    }
    const s2 = reduceSession([
      base,
      { t: 'teacher', turn: { phase: 'teach', blocks: [], question: tabooGame }, at: 1 },
      {
        t: 'learner',
        text: 'spiegazione taboo',
        question: tabooGame,
        answer: { questionId: 'taboo1', game: { score: 1, total: 0, detail: 'spiegazione' } },
        at: 2
      },
      { t: 'graded', questionId: 'taboo1', verdict: 'correct', hintsUsed: 0, reason: 'buono', at: 3 }
    ])
    expect(s2.evidence[0].excluded).toBe(false)
    expect(s2.concepts.g.openStreak).toBe(1)
    const fsrs = fsrsEvidence(s2)
    expect(fsrs).toHaveLength(1)
    expect(fsrs[0].source).toBe('session-llm')
  })

  it('predict prequestion is never evidence for mastery, FSRS, or misconceptionHits', () => {
    const predictQ = {
      ...q('pred1'),
      role: 'predict' as const,
      prompt: 'Cosa succederà?'
    }
    const s = reduceSession([
      base,
      { t: 'teacher', turn: { phase: 'teach', blocks: [], question: predictQ }, at: 1 },
      {
        t: 'learner',
        text: 'Risposta sbagliata con alta fiducia',
        question: predictQ,
        answer: { questionId: 'pred1', text: 'sbagliato', dontKnow: true, confidence: 95 },
        at: 2
      }
    ])
    expect(s.evidence[0].excluded).toBe(true)
    expect(s.concepts.g.openStreak).toBe(0)
    expect(s.concepts.g.status).toBe('unseen')
    expect(s.pendingRetest).toBeUndefined()
    expect(s.misconceptionHits).toEqual([])
    expect(fsrsEvidence(s)).toEqual([])
  })

  it('applies fallback rule when concept has >= 2 ungraded events, populating unverifiedIds and allowing choice mastery', () => {
    const events: Parameters<typeof reduceSession>[0] = [
      base,
      { t: 'teacher', turn: { phase: 'teach', blocks: [], question: q('o1') }, at: 1 },
      ans('o1', 2),
      { t: 'ungraded', questionId: 'o1', at: 3 },
      { t: 'teacher', turn: { phase: 'teach', blocks: [], question: q('o2') }, at: 4 },
      ans('o2', 5),
      { t: 'ungraded', questionId: 'o2', at: 6 }
    ]

    let state = reduceSession(events)
    expect(state.unverifiedIds).toEqual(['g'])
    expect(state.doneNodeIds).not.toContain('g')

    for (let i = 1; i <= 3; i++) {
      const choiceQ = {
        ...q(`c${i}`),
        kind: 'choice' as const,
        options: ['yes', 'no'],
        correct: 0,
        why: ['ok', 'no']
      }
      events.push({ t: 'teacher', turn: { phase: 'teach', blocks: [], question: choiceQ }, at: 6 + i * 2 - 1 })
      events.push({
        t: 'learner',
        text: 'yes',
        question: choiceQ,
        answer: { questionId: `c${i}`, choice: 0 },
        at: 6 + i * 2
      })
    }

    state = reduceSession(events)
    expect(state.unverifiedIds).toEqual(['g'])
    expect(state.doneNodeIds).toContain('g')
  })

  it('stageInstruction adds instructions for required open answer and predict prequestion', () => {
    const unseenState = reduceSession([
      base,
      { t: 'teacher', turn: { phase: 'teach', blocks: [], question: q('1') }, at: 1 }
    ])
    const instruction1 = stageInstruction(unseenState)
    expect(instruction1).toContain('per padroneggiare serve almeno una risposta aperta corretta')
    expect(instruction1).toContain('apri con una domanda di previsione (role predict) prima di spiegare')

    const masteredOpenState = reduceSession([
      base,
      { t: 'teacher', turn: { phase: 'teach', blocks: [], question: q('1') }, at: 1 },
      ans('1', 2),
      { t: 'graded', questionId: '1', verdict: 'correct', hintsUsed: 0, reason: '', at: 3 }
    ])
    const instruction2 = stageInstruction(masteredOpenState)
    expect(instruction2).not.toContain('per padroneggiare serve almeno una risposta aperta corretta')
    expect(instruction2).not.toContain('apri con una domanda di previsione (role predict) prima di spiegare')
  })
})
