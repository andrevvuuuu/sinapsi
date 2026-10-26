// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QuestionDock } from '../../src/renderer/src/session/QuestionDock'
import type { Question } from '../../src/shared/teacher-protocol'

afterEach(cleanup)
const choice: Question = { id: 'q2', role: 'probe', kind: 'choice', prompt: 'Cosa dice Rolle?', options: ['Esiste c', 'È costante'], correct: 0, why: ['sì', 'no'] }

describe('QuestionDock', () => {
  it('enables sending only after picking, and sends choice, confidence and reasoning', () => {
    const onAnswer = vi.fn()
    render(<QuestionDock question={choice} onAnswer={onAnswer} onSay={vi.fn()} />)
    const send = screen.getByRole('button', { name: 'Invia risposta' }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /È costante/ }))
    fireEvent.change(screen.getByLabelText('Fiducia'), { target: { value: '80' } })
    fireEvent.change(screen.getByLabelText('Il tuo ragionamento'), { target: { value: 'boh' } })
    fireEvent.click(send)
    expect(onAnswer).toHaveBeenCalledWith({ questionId: 'q2', choice: 1, confidence: 80, text: 'boh' })
  })

  it('sends "Non lo so" without confidence', () => {
    const onAnswer = vi.fn()
    render(<QuestionDock question={choice} onAnswer={onAnswer} onSay={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Non lo so' }))
    fireEvent.click(screen.getByRole('button', { name: 'Invia risposta' }))
    expect(onAnswer).toHaveBeenCalledWith({ questionId: 'q2', dontKnow: true })
  })

  it('sends an open answer', () => {
    const onAnswer = vi.fn()
    render(<QuestionDock question={{ id: 'q4', role: 'predict', kind: 'open', prompt: 'Come faresti?' }} onAnswer={onAnswer} onSay={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('La tua risposta'), { target: { value: 'tolgo la retta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Invia risposta' }))
    expect(onAnswer).toHaveBeenCalledWith({ questionId: 'q4', text: 'tolgo la retta' })
  })

  it('hides a check behind the invite and sends the reading thoughts', () => {
    const onAnswer = vi.fn()
    render(<QuestionDock question={{ ...choice, role: 'check', id: 'q5' }} onAnswer={onAnswer} onSay={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /È costante/ })).toBeNull()
    fireEvent.change(screen.getByLabelText('Pensieri mentre leggi'), { target: { value: 'mi ricorda Rolle' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verifica la tua comprensione' }))
    fireEvent.click(screen.getByRole('button', { name: /Esiste c/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Invia risposta' }))
    expect(onAnswer).toHaveBeenCalledWith({ questionId: 'q5', choice: 0, confidence: 50, thoughts: 'mi ricorda Rolle' })
  })

  it('approves a plan with one click', () => {
    const onSay = vi.fn()
    render(<QuestionDock question={{ id: 'q3', role: 'plan', kind: 'open', prompt: 'Va bene?' }} onAnswer={vi.fn()} onSay={onSay} />)
    fireEvent.click(screen.getByRole('button', { name: 'Approva il piano' }))
    expect(onSay).toHaveBeenCalledWith('Approvo il piano.')
  })
})
