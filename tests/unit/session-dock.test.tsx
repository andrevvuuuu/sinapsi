// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RefObject } from 'react'
import { QuestionDock } from '../../src/renderer/src/session/QuestionDock'
import { SessionView } from '../../src/renderer/src/session/SessionView'
import type { SessionState } from '../../src/shared/api'
import type { Question } from '../../src/shared/teacher-protocol'

// The library's scroll edges, recorded: which scroller each one fades (the fade itself is the library's, and needs layout).
const edges = vi.hoisted(() => [] as { target: RefObject<HTMLElement | null>; size?: number; edges?: readonly string[] }[])
vi.mock('@glass-sdk/liquid-glass', async (original) => ({
  ...(await original<typeof import('@glass-sdk/liquid-glass')>()),
  GlassScrollEdges: (p: (typeof edges)[number]) => (edges.push(p), null)
}))

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

// Every ResizeObserver of the render (the dock's and the glass library's): resize() plays a resize to all of them.
let observers: ResizeObserverCallback[] = []
const resize = (...args: Parameters<ResizeObserverCallback>): void => observers.forEach((cb) => cb(...args))
const scrollIntoView = vi.fn()
beforeEach(() => {
  observers = []
  edges.length = 0
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: ResizeObserverCallback) {
        observers.push(cb)
      }
      observe(): void {}
      unobserve(): void {}
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
    // The text can be on screen before the effects that observe the dock have run (a slow, loaded machine).
    await waitFor(() => expect(observers.length).toBeGreaterThan(0))
    const dock = container.querySelector('.dockwrap') as HTMLElement
    const scroller = container.querySelector('.scroll') as HTMLElement
    dock.getBoundingClientRect = () => ({ height: 412.4 }) as DOMRect
    act(() => resize([], {} as ResizeObserver))
    expect(scroller.style.getPropertyValue('--dock-h')).toBe('413px')
  })

  it('scrolls the start of the new tutor message into view when a question arrives', async () => {
    render(<SessionView id={ID} onBack={vi.fn()} />)
    const msg = (await screen.findByText('Ecco il messaggio che porta alla domanda.')).closest('.msg')
    // The scroll is an effect of the render that shows the message: wait for it, not only for the text.
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'start' })))
    const target = scrollIntoView.mock.contexts[scrollIntoView.mock.contexts.length - 1]
    expect(target).toBe(msg)
  })

  it('fades the options area where more of it is hidden, with the library\'s scroll edges', () => {
    const { container } = render(<QuestionDock question={question} onAnswer={vi.fn()} onSay={vi.fn()} />)
    const area = container.querySelector('.dock-scroll') as HTMLElement
    // GlassScrollEdges fades only an edge with content hidden beyond it, and none when nothing overflows: it watches
    // exactly this scroller, on both edges (its default), with a short fade.
    const mine = edges.filter((e) => e.target.current === area)
    expect(mine).not.toHaveLength(0)
    expect(mine.at(-1)!.edges ?? ['top', 'bottom']).toEqual(['top', 'bottom'])
    expect(mine.at(-1)!.size).toBeLessThanOrEqual(24)
  })
})
