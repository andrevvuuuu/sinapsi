// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GameDock } from '../../src/renderer/src/session/games/GameDock'
import { SessionView } from '../../src/renderer/src/session/SessionView'
import type { Game, Question } from '../../src/shared/teacher-protocol'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
const q = (game: Game): Question => ({ id: 'g1', role: 'check', kind: 'game', prompt: 'Gioca!', game })
const play = (game: Game) => {
  const onAnswer = vi.fn()
  render(<GameDock question={q(game)} onAnswer={onAnswer} />)
  return onAnswer
}

describe('Lampo', () => {
  const game: Game = { type: 'speed', items: [{ statement: 'Rolle vuole $f$ continua', true: true, why: 'sì' }, { statement: 'Rolle dà un solo punto', true: false, why: 'almeno uno' }, { statement: 'Fermat vale agli estremi', true: false, why: 'solo interni' }] }
  it('scores true/false answers, counts the time-out as wrong, and reports the misses', async () => {
    vi.useFakeTimers()
    const onAnswer = play(game)
    fireEvent.click(screen.getByRole('button', { name: 'Vero' }))
    act(() => void vi.advanceTimersByTime(1300))
    fireEvent.click(screen.getByRole('button', { name: 'Vero' }))
    act(() => void vi.advanceTimersByTime(1300))
    act(() => void vi.advanceTimersByTime(8100))
    act(() => void vi.advanceTimersByTime(1300))
    expect(screen.getByText('1/3')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continua' }))
    expect(onAnswer).toHaveBeenCalledWith({ questionId: 'g1', game: { score: 1, total: 3, detail: 'sbagliate: «Rolle dà un solo punto»; «Fermat vale agli estremi» (tempo scaduto)' } })
  })
  it('a double click scores one answer', () => {
    vi.useFakeTimers()
    play(game)
    const v = screen.getByRole('button', { name: 'Vero' })
    fireEvent.click(v)
    fireEvent.click(v)
    expect(screen.getByRole('status').textContent).toMatch(/1 \/ 3/)
  })
})

describe('Coppie', () => {
  it('pairs items, counting the mistakes', () => {
    const onAnswer = play({ type: 'match', pairs: [['Rolle', 'derivata nulla'], ['Lagrange', 'tangente parallela alla corda']] })
    const left = screen.getByRole('group', { name: 'Voci' })
    const right = screen.getByRole('group', { name: 'Corrispondenti' })
    fireEvent.click(within(left).getByRole('button', { name: /Rolle/ }))
    fireEvent.click(within(right).getByRole('button', { name: /tangente/ }))
    fireEvent.click(within(left).getByRole('button', { name: /Rolle/ }))
    fireEvent.click(within(right).getByRole('button', { name: /derivata nulla/ }))
    fireEvent.click(within(left).getByRole('button', { name: /Lagrange/ }))
    fireEvent.click(within(right).getByRole('button', { name: /tangente/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Continua' }))
    expect(onAnswer).toHaveBeenCalledWith({ questionId: 'g1', game: { score: 1, total: 2, detail: '1 errore: «Rolle» con «tangente parallela alla corda»' } })
  })
})

describe('Ricomponi', () => {
  it('reorders with buttons and scores the steps in place', () => {
    const onAnswer = play({ type: 'order', steps: ['Weierstrass: max e min', 'Fermat: derivata nulla', 'Conclusione'] })
    const items = (): string[] => screen.getAllByRole('listitem').map((l) => l.querySelector('.gtext')!.textContent!.trim())
    while (items()[0] !== 'Weierstrass: max e min') fireEvent.click(screen.getAllByRole('button', { name: /^Sposta su/ })[items().indexOf('Weierstrass: max e min') - 1])
    fireEvent.click(screen.getByRole('button', { name: 'Controlla' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continua' }))
    const g = onAnswer.mock.calls[0][0].game
    expect(g.total).toBe(3)
    expect(g.score).toBeGreaterThanOrEqual(1)
  })
})

describe("Trova l'intruso", () => {
  it('checks the picked line and sends the reason', () => {
    const onAnswer = play({ type: 'spot', lines: ['$|x|$ continua', 'quindi per Rolle', 'c = 0'], wrong: 1, why: '|x| non è derivabile in 0' })
    fireEvent.click(screen.getByRole('button', { name: /^2/ }))
    fireEvent.change(screen.getByLabelText('Perché è sbagliata?'), { target: { value: 'manca la derivabilità' } })
    fireEvent.click(screen.getByRole('button', { name: 'Controlla' }))
    expect(screen.getByText('|x| non è derivabile in 0')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continua' }))
    expect(onAnswer).toHaveBeenCalledWith({ questionId: 'g1', game: { score: 1, total: 1, detail: 'riga 2, perché: manca la derivabilità' } })
  })
})

describe('Tabù', () => {
  it('blocks sending while a forbidden word is used', () => {
    const onAnswer = play({ type: 'taboo', concept: 'derivata', forbidden: ['limite', 'pendenza'] })
    const box = screen.getByLabelText('La tua spiegazione')
    fireEvent.change(box, { target: { value: 'è il limite del rapporto' } })
    expect(screen.getByRole('button', { name: 'Invia la spiegazione' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText(/Hai usato: limite/)).toBeTruthy()
    fireEvent.change(box, { target: { value: 'quanto cambia f per un passo piccolissimo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Invia la spiegazione' }))
    expect(onAnswer).toHaveBeenCalledWith({ questionId: 'g1', game: { score: 1, total: 1, detail: 'spiegazione: quanto cambia f per un passo piccolissimo' } })
  })
})

describe('skipping and score', () => {
  it('any game can be skipped', () => {
    const onAnswer = play({ type: 'order', steps: ['a', 'b', 'c'] })
    fireEvent.click(screen.getByRole('button', { name: 'Salta il gioco' }))
    expect(onAnswer).toHaveBeenCalledWith({ questionId: 'g1', game: { score: 0, total: 0, detail: 'saltato' } })
  })
  it('the session header shows points and streak, and the dock shows the game', async () => {
    const check: Question = { id: 'q1', role: 'check', kind: 'choice', prompt: 'p', options: ['a', 'b'], correct: 0, why: ['', ''] }
    const state = {
      id: 's',
      topic: 'Rolle',
      phase: 'teach',
      doneNodeIds: [],
      items: [{ kind: 'learner', text: 'x', question: check, answer: { questionId: 'q1', choice: 0, confidence: 80 } }],
      pendingQuestion: q({ type: 'order', steps: ['a', 'b', 'c'] }),
      awaiting: 'learner',
      hasTeacherTurn: true,
      createdAt: 1,
      updatedAt: 1
    }
    window.sinapsi = { session: { get: vi.fn(async () => state), onUpdate: () => () => undefined, answer: vi.fn(), say: vi.fn(), retry: vi.fn() } } as never
    render(<SessionView id="s" onBack={vi.fn()} />)
    expect((await screen.findByLabelText('Punteggio')).textContent).toMatch(/15.*serie 1/)
    expect(screen.getByRole('region', { name: /Gioco «Ricomponi»/ })).toBeTruthy()
  })
})
