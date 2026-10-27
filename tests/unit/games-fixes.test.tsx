// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GameDock } from '../../src/renderer/src/session/games/GameDock'
import { matchLayout } from '../../src/renderer/src/session/games/shared'
import { tabooUsed } from '../../src/renderer/src/session/games/taboo-words'
import { AnswerCard } from '../../src/renderer/src/session/AnswerCard'
import { reduceSession, type SessionEvent } from '../../src/main/session/events'
import { sessionScore } from '../../src/shared/score'
import { TeacherTurnSchema, type Game, type Question } from '../../src/shared/teacher-protocol'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
const q = (game: Game, extra: Partial<Question> = {}): Question => ({ id: 'g1', role: 'check', kind: 'game', prompt: 'Gioca', game, ...extra })
const speed: Game = { type: 'speed', items: [{ statement: 'uno', true: true, why: 'perché sì' }, { statement: 'due', true: false, why: 'no' }, { statement: 'tre', true: true, why: 'sì' }] }

describe('Coppie never lines the answers up', () => {
  it.each([2, 3, 4, 5])('no row holds its own match with %i pairs', (n) => {
    for (let k = 0; k < 30; k++) {
      const { left, right } = matchLayout(n, `id${k}`)
      expect(left.some((l, i) => right[i] === l)).toBe(false)
      expect([...right].sort()).toEqual([...Array(n).keys()])
    }
  })
})

describe('Lampo', () => {
  it('pauses while the window is hidden', () => {
    vi.useFakeTimers()
    render(<GameDock question={q(speed)} onAnswer={vi.fn()} />)
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    act(() => void vi.advanceTimersByTime(30_000))
    expect(screen.getByText('uno')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Vero' })).toBeTruthy()
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    act(() => void vi.advanceTimersByTime(8_100))
    expect(screen.getByRole('status').textContent).toMatch(/Tempo scaduto/)
  })
  it('shows the seconds left and announces the feedback', () => {
    vi.useFakeTimers()
    render(<GameDock question={q(speed)} onAnswer={vi.fn()} />)
    expect(screen.getByText('8 s')).toBeTruthy()
    act(() => void vi.advanceTimersByTime(3_000))
    expect(screen.getByText('5 s')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Vero' }))
    expect(screen.getByRole('status').textContent).toMatch(/Giusto/)
  })
  it('ignores shortcuts with modifiers and held keys', () => {
    vi.useFakeTimers()
    render(<GameDock question={q(speed)} onAnswer={vi.fn()} />)
    fireEvent.keyDown(window, { key: 'v', metaKey: true })
    fireEvent.keyDown(window, { key: 'f', repeat: true })
    expect(screen.getByRole('button', { name: 'Vero' })).toBeTruthy()
    fireEvent.keyDown(window, { key: 'v' })
    expect(screen.getByRole('status').textContent).toMatch(/Giusto/)
  })
})

describe('Tabù words', () => {
  it.each([
    [['f'], 'la funzione cresce', []],
    [['f'], 'quando f sale', ['f']],
    [['valor medio'], 'uso il valor medio', ['valor medio']],
    [['$\\lim$'], 'il lim del rapporto', ['$\\lim$']],
    [['retta'], 'un rettangolo', []],
    [['retta'], 'due rette', ['retta']],
    [['limite'], 'i limiti', ['limite']]
  ])('%j in «%s» → %j', (forbidden, text, used) => {
    expect(tabooUsed(forbidden, text)).toEqual(used)
  })
  it('sends the explanation for the tutor to judge, not a score', () => {
    const onAnswer = vi.fn()
    render(<GameDock question={q({ type: 'taboo', concept: 'derivata', forbidden: ['limite', 'pendenza'] })} onAnswer={onAnswer} />)
    fireEvent.change(screen.getByLabelText('La tua spiegazione'), { target: { value: 'x'.repeat(4500) } })
    fireEvent.click(screen.getByRole('button', { name: 'Invia la spiegazione' }))
    const g = onAnswer.mock.calls[0][0].game
    expect(g).toMatchObject({ score: 0, total: 0 })
    expect(g.detail.length).toBeLessThanOrEqual(4000)
    render(<AnswerCard q={q({ type: 'taboo', concept: 'derivata', forbidden: ['a', 'b'] })} a={{ questionId: 'g1', game: { score: 0, total: 0, detail: 'spiegazione: ...' } }} />)
    expect(screen.getByText('inviata')).toBeTruthy()
  })
})

describe('validation', () => {
  const turn = (game: unknown) => ({ phase: 'teach', blocks: [], question: { id: 'q', role: 'check', kind: 'game', prompt: 'p', game } })
  it('refuses duplicate answers in Coppie and duplicate forbidden words', () => {
    expect(TeacherTurnSchema.safeParse(turn({ type: 'match', pairs: [['a', 'x'], ['b', 'x']] })).success).toBe(false)
    expect(TeacherTurnSchema.safeParse(turn({ type: 'taboo', concept: 'c', forbidden: ['a', 'a'] })).success).toBe(false)
  })
})

describe('a game used as a check', () => {
  it('marks its node done when played well', () => {
    const game: Question = q({ type: 'order', steps: ['a', 'b', 'c'] }, { nodeId: 'corda' })
    const events: SessionEvent[] = [
      { t: 'created', id: 's', topic: 't', at: 1 },
      { t: 'teacher', turn: { phase: 'teach', blocks: [], question: game }, at: 2 },
      { t: 'learner', text: 'x', answer: { questionId: 'g1', game: { score: 3, total: 3, detail: '' } }, question: game, at: 3 },
      { t: 'teacher', turn: { phase: 'teach', blocks: [], question: { id: 'q2', role: 'predict', kind: 'open', prompt: 'p', nodeId: 'lagrange' } }, at: 4 }
    ]
    expect(reduceSession(events).doneNodeIds).toEqual(['corda'])
  })
})

describe('streak', () => {
  it('a wrong prediction or probe does not break the streak', () => {
    const check: Question = { id: 'c', role: 'check', kind: 'choice', prompt: 'p', options: ['a', 'b'], correct: 0, why: ['', ''] }
    const probe: Question = { ...check, id: 'p', role: 'probe' }
    const s = sessionScore([
      { kind: 'learner', text: '', question: check, answer: { questionId: 'c', choice: 0, confidence: 80 } },
      { kind: 'learner', text: '', question: probe, answer: { questionId: 'p', choice: 1, confidence: 30 } },
      { kind: 'learner', text: '', question: check, answer: { questionId: 'c', choice: 0, confidence: 80 } }
    ])
    expect(s.streak).toBe(2)
    expect(s.points).toBe(30)
  })
})
void within
