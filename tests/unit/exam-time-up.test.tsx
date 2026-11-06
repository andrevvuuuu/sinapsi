// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PracticeState } from '../../src/main/practice/events'
import { PracticeView } from '../../src/renderer/src/practice/PracticeView'
import { TIME_UP_WAIT } from '../../src/renderer/src/practice/ExamView'

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

const ID = '11111111-1111-4111-8111-111111111111'
let finish!: (said: string) => void
let api: {
  practice: Record<string, ReturnType<typeof vi.fn>>
  voice: Record<string, ReturnType<typeof vi.fn>>
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'Date']
  })
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal('MediaRecorder', FakeRecorder)
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })) }
  })
  const state: PracticeState = {
    id: ID,
    mode: 'exam',
    material: { conceptIds: ['n_1'], sourceIds: [], free: '' },
    topic: 'Rolle',
    phase: 'warmup',
    items: [],
    problems: [],
    paused: false,
    awaiting: 'learner',
    hasTutorTurn: false,
    createdAt: 1,
    updatedAt: 1,
    durationMin: 30,
    exam: {
      sheet: { title: 'T', problems: [{ id: 'e1', statement: 'a', points: 30, targets: [] }] },
      endsAt: Date.now() + 2_000,
      answers: {},
      delivered: false
    }
  }
  api = {
    practice: {
      get: vi.fn(async () => state),
      retry: vi.fn(),
      submit: vi.fn(),
      onUpdate: vi.fn(() => () => undefined),
      examDeliver: vi.fn(async () => undefined),
      examSave: vi.fn(async () => undefined)
    },
    voice: {
      transcribe: vi.fn(() => new Promise<string>((r) => (finish = r))),
      microphone: vi.fn(async () => true),
      onStage: vi.fn(() => () => undefined)
    }
  }
  window.sinapsi = api as never
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const flush = async (): Promise<void> => {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve()
  })
}

/** The exam on screen with «bozza» typed in the answer and the microphone recording into it. */
async function dictating(): Promise<void> {
  render(<PracticeView id={ID} onBack={vi.fn()} onStarted={vi.fn()} />)
  await flush()
  const box = screen.getByLabelText('Risposta all’esercizio 1') as HTMLTextAreaElement
  fireEvent.change(box, { target: { value: 'bozza' } })
  box.setSelectionRange(5, 5)
  fireEvent.click(box.closest('.mic-field')!.querySelector('button[aria-label="Detta"]')!)
  await flush()
  expect(screen.getByRole('button', { name: 'Consegna' })).toHaveProperty('disabled', true)
}

describe('time up during a dictation', () => {
  it('stops the recording and delivers once the transcription has landed in the answer', async () => {
    await dictating()
    await act(async () => void (await vi.advanceTimersByTimeAsync(2_500)))
    expect(api.voice.transcribe).toHaveBeenCalledTimes(1)
    expect(api.practice.examDeliver).not.toHaveBeenCalled()
    finish('ho detto questo')
    await flush()
    expect(api.practice.examDeliver).toHaveBeenCalledTimes(1)
    expect(api.practice.examDeliver).toHaveBeenCalledWith(ID, { e1: 'bozza ho detto questo' })
  })

  it('delivers what is there when the transcription does not land in time', async () => {
    await dictating()
    await act(async () => void (await vi.advanceTimersByTimeAsync(2_500)))
    expect(api.practice.examDeliver).not.toHaveBeenCalled()
    await act(async () => void (await vi.advanceTimersByTimeAsync(TIME_UP_WAIT)))
    expect(api.practice.examDeliver).toHaveBeenCalledTimes(1)
    expect(api.practice.examDeliver).toHaveBeenCalledWith(ID, { e1: 'bozza' })
  })
})
