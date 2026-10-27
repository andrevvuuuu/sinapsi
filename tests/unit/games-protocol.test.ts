import { describe, expect, it } from 'vitest'
import { formatLearnerReply, LearnerAnswerSchema, TeacherTurnSchema, teacherJsonSchema, type Question } from '../../src/shared/teacher-protocol'

const turn = (game: unknown) => ({ phase: 'teach', blocks: [], question: { id: 'q9', role: 'check', kind: 'game', prompt: 'Gioco!', game } })
const ok = {
  speed: { type: 'speed', items: [{ statement: '$f$ continua', true: true, why: 'ok' }, { statement: 'b', true: false, why: 'no' }, { statement: 'c', true: true, why: 'ok' }] },
  match: { type: 'match', pairs: [['Rolle', '$f\'(c)=0$'], ['Lagrange', 'corda']] },
  order: { type: 'order', steps: ['Weierstrass', 'Fermat', 'Rolle'] },
  spot: { type: 'spot', lines: ['a', 'b', 'c'], wrong: 1, why: 'perché' },
  taboo: { type: 'taboo', concept: 'derivata', forbidden: ['limite', 'pendenza'] }
}

describe('games in the teacher protocol', () => {
  it.each(Object.entries(ok))('accepts a %s game', (_k, g) => {
    expect(TeacherTurnSchema.safeParse(turn(g)).success).toBe(true)
  })
  it.each([
    ['speed with 2 items', { ...ok.speed, items: ok.speed.items.slice(0, 2) }],
    ['match with one pair', { type: 'match', pairs: [['a', 'b']] }],
    ['order with a duplicate step', { type: 'order', steps: ['a', 'a', 'b'] }],
    ['spot pointing past the end', { ...ok.spot, wrong: 3 }],
    ['taboo with one word', { type: 'taboo', concept: 'x', forbidden: ['a'] }],
    ['a game question without a game', undefined]
  ])('rejects %s', (_n, g) => {
    expect(TeacherTurnSchema.safeParse(turn(g)).success).toBe(false)
  })
  it('the JSON schema tells the CLI about games', () => {
    expect(JSON.stringify(teacherJsonSchema())).toContain('"taboo"')
  })
  it('reports a game result to the tutor in Italian', () => {
    const q = turn(ok.speed).question as unknown as Question
    const a = LearnerAnswerSchema.parse({ questionId: 'q9', game: { score: 2, total: 3, detail: 'sbagliata: «b»' } })
    expect(formatLearnerReply(q, a)).toBe('Risposta alla domanda q9 (verifica): gioco «Lampo» — 2/3 — sbagliata: «b»')
    expect(formatLearnerReply(q, { questionId: 'q9', game: { score: 0, total: 0, detail: 'saltato' } })).toBe('Risposta alla domanda q9 (verifica): gioco «Lampo» — saltato')
  })
})
