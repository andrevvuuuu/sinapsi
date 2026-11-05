// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuestionDock } from '../../src/renderer/src/session/QuestionDock'
import { SessionView } from '../../src/renderer/src/session/SessionView'
import type { SessionState } from '../../src/shared/api'
import type { Question } from '../../src/shared/teacher-protocol'

const ID = '11111111-1111-4111-8111-111111111111'
const question: Question = {
  id: 'q2',
  role: 'probe',
  kind: 'choice',
  prompt: 'Quale ragionamento è corretto?',
  options: ['Il primo', 'Il secondo', 'Il terzo', 'Il quarto'],
  correct: 0
}
const state: SessionState = {
  id: ID, topic: 'Buon ordinamento', phase: 'probe', doneNodeIds: [], awaiting: 'learner', hasTeacherTurn: true, createdAt: 1, updatedAt: 1,
  items: [
    { kind: 'learner', text: 'Voglio studiare: Buon ordinamento' },
    { kind: 'teacher', turn: { phase: 'probe', blocks: [{ type: 'text', md: 'Prima un esempio.' }] } },
    { kind: 'learner', text: 'capire le dimostrazioni' },
    { kind: 'teacher', turn: { phase: 'probe', blocks: [{ type: 'text', md: 'Ecco il messaggio che porta alla domanda.' }], question } }
  ],
  pendingQuestion: question
}

let resize: ResizeObserverCallback = () => undefined
const scrollIntoView = vi.fn()
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: ResizeObserverCallback) {
        resize = cb
      }
      observe(): void {}
      disconnect(): void {}
    }
  )
  Element.prototype.scrollIntoView = scrollIntoView
  window.sinapsi = { session: { get: vi.fn(async () => state), onUpdate: () => () => undefined, retry: vi.fn(), answer: vi.fn(), say: vi.fn() } } as never
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  scrollIntoView.mockReset()
})

describe('the question dock and the conversation above it', () => {
  it('sets --dock-h from the dock height', async () => {
    const { container } = render(<SessionView id={ID} onBack={vi.fn()} />)
    await screen.findByText('Quale ragionamento è corretto?')
    const dock = container.querySelector('.dockwrap') as HTMLElement
    const scroller = container.querySelector('.scroll') as HTMLElement
    dock.getBoundingClientRect = () => ({ height: 412.4 }) as DOMRect
    act(() => resize([], {} as ResizeObserver))
    expect(scroller.style.getPropertyValue('--dock-h')).toBe('413px')
  })

  it('scrolls the start of the new tutor message into view when a question arrives', async () => {
    render(<SessionView id={ID} onBack={vi.fn()} />)
    const msg = (await screen.findByText('Ecco il messaggio che porta alla domanda.')).closest('.msg')
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'start' }))
    const target = scrollIntoView.mock.contexts[scrollIntoView.mock.contexts.length - 1]
    expect(target).toBe(msg)
  })

  it('marks the options area where more of it is hidden, so the fade shows only there', () => {
    const { container } = render(<QuestionDock question={question} onAnswer={vi.fn()} onSay={vi.fn()} />)
    const area = container.querySelector('.dock-scroll') as HTMLElement
    const metrics = { scrollTop: 0, scrollHeight: 600, clientHeight: 300 }
    for (const k of Object.keys(metrics) as (keyof typeof metrics)[])
      Object.defineProperty(area, k, { configurable: true, get: () => metrics[k] })
    const at = (top: number): [boolean, boolean] => {
      metrics.scrollTop = top
      fireEvent.scroll(area)
      return [area.hasAttribute('data-more-above'), area.hasAttribute('data-more-below')]
    }
    expect(at(0)).toEqual([false, true])
    expect(at(150)).toEqual([true, true])
    expect(at(300)).toEqual([true, false])
    metrics.scrollHeight = 300
    expect(at(0)).toEqual([false, false])
  })
})
