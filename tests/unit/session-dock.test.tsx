// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
})
