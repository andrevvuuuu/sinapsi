// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Composer } from '../../src/renderer/src/home/Composer'
import { LeftPanel } from '../../src/renderer/src/home/LeftPanel'
import { Spot } from '../../src/renderer/src/session/games/Spot'
import { Taboo } from '../../src/renderer/src/session/games/Taboo'
import { NotebookView } from '../../src/renderer/src/notebook/NotebookView'
import { SourceList } from '../../src/renderer/src/notebook/SourceList'
import { ChatPane } from '../../src/renderer/src/notebook/ChatPane'
import { Estimate, Open } from '../../src/renderer/src/review/exercises/Inputs'
import { Explain } from '../../src/renderer/src/review/exercises/Explain'
import { QuestionDock } from '../../src/renderer/src/session/QuestionDock'
import { SessionView } from '../../src/renderer/src/session/SessionView'
import type { SessionState } from '../../src/shared/api'
import type { Question } from '../../src/shared/teacher-protocol'

class FakeRecorder {
  state: 'inactive' | 'recording' = 'inactive'
  mimeType = 'audio/webm'
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  stop = (): void => {
    if (this.state === 'inactive') return
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['audio']) })
    this.onstop?.()
  }
  start(): void {
    this.state = 'recording'
  }
}

let finish!: (said: string) => void
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal('MediaRecorder', FakeRecorder)
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })) }
  })
  window.sinapsi = {
    voice: {
      transcribe: vi.fn(() => new Promise<string>((r) => (finish = r))),
      microphone: vi.fn(async () => true),
      onStage: vi.fn(() => () => undefined)
    }
  } as never
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const flush = async (): Promise<void> => {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve()
  })
}
/** The "Detta" button that sits in the same box as the field. */
function micOf(field: HTMLElement): HTMLElement | null {
  return field.closest('.mic-field')?.querySelector('button[aria-label="Detta"]') ?? null
}
const ID = '11111111-1111-4111-8111-111111111111'
const learnerAsks: SessionState = {
  id: ID,
  topic: 'Lagrange',
  noteTitle: 'Lagrange',
  phase: 'teach',
  doneNodeIds: [],
  awaiting: 'learner',
  hasTeacherTurn: true,
  createdAt: 1,
  updatedAt: 1,
  plan: { nodes: [{ id: 'a', title: 'Rolle', status: 'goal' }], edges: [] },
  items: [{ kind: 'learner', text: 'Voglio studiare: Lagrange' }]
}
const choice: Question = {
  id: 'q2',
  role: 'probe',
  kind: 'choice',
  prompt: 'Cosa dice Rolle?',
  options: ['Esiste c', 'È costante'],
  correct: 0,
  why: ['sì', 'no']
}

describe('dictation in every free-text field', () => {
  it('every free-text field has a mic, and excluded fields do not', async () => {
    render(<Composer onSubmit={vi.fn()} />)
    expect(micOf(screen.getByLabelText('Cosa vuoi studiare?'))).toBeTruthy()
    cleanup()

    render(<QuestionDock question={choice} onAnswer={vi.fn()} onSay={vi.fn()} />)
    expect(micOf(screen.getByLabelText('Il tuo ragionamento'))).toBeTruthy()
    cleanup()

    render(
      <QuestionDock
        question={{ id: 'p', role: 'plan', kind: 'open', prompt: 'Ecco il piano' }}
        onAnswer={vi.fn()}
        onSay={vi.fn()}
      />
    )
    expect(micOf(screen.getByLabelText('Chiedi una modifica al piano'))).toBeTruthy()
    cleanup()

    render(
      <QuestionDock
        question={{ ...choice, role: 'check', id: 'q5' }}
        onAnswer={vi.fn()}
        onSay={vi.fn()}
      />
    )
    expect(micOf(screen.getByLabelText('Pensieri mentre leggi'))).toBeTruthy()
    cleanup()

    window.sinapsi = {
      ...window.sinapsi,
      session: {
        get: vi.fn(async () => learnerAsks),
        onUpdate: () => () => undefined,
        say: vi.fn()
      }
    } as never
    render(<SessionView id={ID} onBack={vi.fn()} />)
    expect(micOf(await screen.findByLabelText('Fai una domanda al tutor'))).toBeTruthy()
    cleanup()

    render(<Explain locked={false} followUp={false} onChange={vi.fn()} />)
    expect(micOf(screen.getByLabelText('La tua spiegazione, a libro chiuso'))).toBeTruthy()
    cleanup()

    render(<Open locked={false} onChange={vi.fn()} />)
    expect(micOf(screen.getByLabelText('La tua risposta, ragionando ad alta voce'))).toBeTruthy()
    cleanup()

    render(
      <ChatPane
        turns={[]}
        pending={false}
        selected={1}
        ready={1}
        onAsk={vi.fn()}
        onRetry={vi.fn()}
        onCite={vi.fn()}
      />
    )
    expect(micOf(screen.getByLabelText('Chiedi alle tue fonti'))).toBeTruthy()
    cleanup()

    render(
      <LeftPanel
        sessions={[]}
        notes={[]}
        subjectOf={() => null}
        onOpenSession={vi.fn()}
        onOpenNota={vi.fn()}
        settings={null}
        onSettings={vi.fn()}
        onTheme={vi.fn()}
        onClose={vi.fn()}
        sessionsHeight={260}
        onSessionsHeight={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cerca una sessione' }))
    expect(micOf(screen.getByLabelText('Cerca tra le sessioni'))).toBeTruthy()
    cleanup()

    // Excluded: the decimal field has no mic at all.
    render(
      <Estimate
        exercise={{ type: 'estimate', prompt: 'Quanto?', value: 3, tolerance: 0.1, answer: '3' }}
        locked={false}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByLabelText('Il tuo valore')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Detta' })).toBeNull()
  })

  it('the link fields (YouTube, NotebookLM) have no mic', async () => {
    const NB = '11111111-1111-4111-8111-111111111111'
    const notebook = {
      id: NB,
      name: 'Analisi 1',
      subject: null,
      link: null,
      createdAt: 1,
      sources: []
    }
    window.sinapsi = {
      ...window.sinapsi,
      notebook: {
        list: vi.fn(async () => [notebook]),
        chat: vi.fn(async () => []),
        onUpdate: vi.fn(() => () => undefined),
        busy: vi.fn(async () => false)
      },
      vault: { index: vi.fn(async () => ({ subjects: [], notes: [] })) }
    } as never
    render(
      <SourceList
        notebook={notebook as never}
        excluded={new Set()}
        onToggle={vi.fn()}
        onView={vi.fn()}
        notes={[]}
        onMessage={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'YouTube' }))
    expect(screen.getByLabelText('Link del video')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Detta' })).toBeNull()
    cleanup()

    render(<NotebookView id={NB} onBack={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Collega NotebookLM' }))
    expect(screen.getByLabelText('Link del notebook su NotebookLM')).toBeTruthy()
    // The only mic on the page is the one of the notebook name.
    const mics = screen.getAllByRole('button', { name: 'Detta' })
    expect(mics).toHaveLength(2)
    for (const m of mics)
      expect(
        m
          .closest('.mic-field')
          ?.querySelector(
            'input[aria-label="Nome del notebook"], textarea[aria-label="Chiedi alle tue fonti"]'
          )
      ).toBeTruthy()
  })

  it('the games name their textarea without the mic in the name', () => {
    render(
      <Spot
        game={{ type: 'spot', lines: ['a', 'b'], wrong: 1, why: 'x' } as never}
        onDone={vi.fn()}
      />
    )
    expect(screen.getByRole('textbox', { name: 'Perché è sbagliata?' })).toBeTruthy()
    cleanup()
    render(
      <Taboo
        game={{ type: 'taboo', concept: 'limite', forbidden: ['x'] } as never}
        onDone={vi.fn()}
      />
    )
    expect(screen.getByRole('textbox', { name: 'La tua spiegazione' })).toBeTruthy()
  })

  it('short fields stop at two minutes, long ones at ten', async () => {
    vi.useFakeTimers()
    try {
      render(<Composer onSubmit={vi.fn()} />)
      fireEvent.click(screen.getByRole('button', { name: 'Detta' }))
      await flush()
      act(() => void vi.advanceTimersByTime(599_000))
      expect(screen.getByRole('button', { name: 'Ferma la dettatura' })).toBeTruthy()
      act(() => void vi.advanceTimersByTime(1_000))
      expect(screen.queryByRole('button', { name: 'Ferma la dettatura' })).toBeNull()
      cleanup()

      render(
        <LeftPanel
          sessions={[]}
          notes={[]}
          subjectOf={() => null}
          onOpenSession={vi.fn()}
          onOpenNota={vi.fn()}
          settings={null}
          onSettings={vi.fn()}
          onTheme={vi.fn()}
          onClose={vi.fn()}
          sessionsHeight={260}
          onSessionsHeight={vi.fn()}
        />
      )
      fireEvent.click(screen.getByRole('button', { name: 'Cerca una sessione' }))
      fireEvent.click(screen.getByRole('button', { name: 'Detta' }))
      await flush()
      act(() => void vi.advanceTimersByTime(119_000))
      expect(screen.getByRole('button', { name: 'Ferma la dettatura' })).toBeTruthy()
      act(() => void vi.advanceTimersByTime(1_000))
      expect(screen.queryByRole('button', { name: 'Ferma la dettatura' })).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('sending is disabled while dictating', async () => {
    const onSubmit = vi.fn()
    render(<Composer onSubmit={onSubmit} />)
    const field = screen.getByLabelText('Cosa vuoi studiare?') as HTMLTextAreaElement
    fireEvent.change(field, { target: { value: 'limiti' } })
    const send = screen.getByRole('button', { name: 'Inizia' }) as HTMLButtonElement
    expect(send.disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Detta' }))
    await flush()
    expect(send.disabled).toBe(true)
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(onSubmit).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Ferma la dettatura' }))
    await flush()
    // Transcribing: still busy.
    expect(send.disabled).toBe(true)
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(onSubmit).not.toHaveBeenCalled()
    await act(async () => finish('derivate'))
    await flush()
    expect(field.value).toBe('limiti derivate')
    expect(send.disabled).toBe(false)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
