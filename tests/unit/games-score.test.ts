import { describe, expect, it } from 'vitest'
import { sessionScore } from '../../src/shared/score'
import type { ChatItem } from '../../src/main/session/events'
import type { Question } from '../../src/shared/teacher-protocol'

const check = (id: string): Question => ({ id, role: 'check', kind: 'choice', prompt: 'p', options: ['a', 'b'], correct: 0, why: ['', ''] })
const game: Question = { id: 'g', role: 'check', kind: 'game', prompt: 'p', game: { type: 'speed', items: [{ statement: 'a', true: true, why: '' }, { statement: 'b', true: true, why: '' }, { statement: 'c', true: true, why: '' }] } }
const ans = (q: Question, choice: number, confidence: number): ChatItem => ({ kind: 'learner', text: '', question: q, answer: { questionId: q.id, choice, confidence } })
const played = (score: number, total: number): ChatItem => ({ kind: 'learner', text: '', question: game, answer: { questionId: 'g', game: { score, total, detail: '' } } })

describe('sessionScore', () => {
  it('counts points, streaks, games and calibration', () => {
    const s = sessionScore([ans(check('q1'), 0, 80), ans(check('q2'), 0, 40), played(3, 3), ans(check('q3'), 1, 90), ans(check('q4'), 0, 60)])
    expect(s).toEqual({ points: 15 + 10 + 15 + 0 + 10, streak: 1, bestStreak: 3, games: 1, calibration: Math.round(100 - (20 + 60 + 90 + 40) / 4) })
  })
  it('has no calibration without confident answers, and ignores skipped games', () => {
    expect(sessionScore([played(0, 0)])).toEqual({ points: 0, streak: 0, bestStreak: 0, games: 0, calibration: null })
  })
  it('a weak game breaks the streak', () => {
    expect(sessionScore([ans(check('q1'), 0, 50), played(1, 3)]).streak).toBe(0)
  })
})
