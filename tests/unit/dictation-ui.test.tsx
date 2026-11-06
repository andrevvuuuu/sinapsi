// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { insertAtCursor, useDictation } from '../../src/renderer/src/components/dictation'
import { DictationError, MicButton } from '../../src/renderer/src/components/MicButton'
import { Explain } from '../../src/renderer/src/review/exercises/Explain'

/** A stand-in MediaRecorder: stop() hands over one chunk and fires onstop, as Chromium does. */
class FakeRecorder {
  static all: FakeRecorder[] = []
  state: 'inactive' | 'recording' = 'inactive'
  mimeType = 'audio/webm'
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  stop = vi.fn(() => {
    if (this.state === 'inactive') return
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['audio']) })
    this.onstop?.()
  })
  constructor() {
    FakeRecorder.all.push(this)
  }
  start(): void {
    this.state = 'recording'
  }
}

const trackStop = vi.fn()
function mockVoice(
  over: Partial<{
    transcribe: (b: Uint8Array) => Promise<string>
    microphone: () => Promise<boolean>
  }> = {}
): {
  transcribe: ReturnType<typeof vi.fn>
  microphone: ReturnType<typeof vi.fn>
  onStage: ReturnType<typeof vi.fn>
} {
  const voice = {
    transcribe: vi.fn(over.transcribe ?? (async () => 'bello')),
    microphone: vi.fn(over.microphone ?? (async () => true)),
    onStage: vi.fn(() => () => undefined)
  }
  window.sinapsi = { voice } as never
  return voice
}

beforeEach(() => {
  FakeRecorder.all = []
  trackStop.mockClear()
  vi.stubGlobal('MediaRecorder', FakeRecorder)
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: trackStop }] })) }
  })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function Field({
  label,
  initial = '',
  maxSeconds,
  onSubmit = vi.fn(),
  onValue,
  enabled,
  locked = false
}: {
  label: string
  initial?: string
  maxSeconds?: number
  onSubmit?: () => void
  onValue?: (v: string) => void
  enabled?: boolean
  locked?: boolean
}): React.JSX.Element {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  const set = (v: string): void => {
    onValue?.(v)
    setValue(v)
  }
  const d = useDictation({ target: ref, value, onChange: set, maxSeconds, enabled })
  return (
    <form
      aria-label={label}
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <div className="mic-field">
        <input
          aria-label={label}
          ref={ref}
          value={value}
          readOnly={locked || d.state !== 'idle'}
          onChange={(e) => set(e.target.value)}
        />
        <MicButton dictation={d} size="sm" />
      </div>
      <DictationError dictation={d} />
    </form>
  )
}

/** The live region that announces the dictation's state. */
const live = (): HTMLElement => document.querySelector('.mic-field [aria-live]') as HTMLElement

const flush = async (): Promise<void> => {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve()
  })
}

describe('insertAtCursor', () => {
  it('inserts the words at the caret with the spaces they need', () => {
    expect(insertAtCursor('ciao mondo', 'bello', 5, 5)).toEqual({
      value: 'ciao bello mondo',
      caret: 10
    })
  })
  it('fills an empty field', () => {
    expect(insertAtCursor('', 'bello', 0, 0)).toEqual({ value: 'bello', caret: 5 })
  })
  it('replaces a selection', () => {
    expect(insertAtCursor('ciao mondo', 'bello', 5, 10)).toEqual({ value: 'ciao bello', caret: 10 })
  })
})

describe('useDictation and MicButton', () => {
  it('inserts the transcription at the cursor and never submits', async () => {
    const voice = mockVoice()
    const onSubmit = vi.fn()
    render(<Field label="Argomento" initial="ciao mondo" onSubmit={onSubmit} />)
    const input = screen.getByLabelText('Argomento', { selector: 'input' }) as HTMLInputElement
    input.setSelectionRange(5, 5)
    fireEvent.click(screen.getByRole('button', { name: 'Detta' }))
    await flush()
    const stop = screen.getByRole('button', { name: 'Ferma la dettatura' })
    expect(stop.getAttribute('aria-pressed')).toBe('true')
    expect(stop.textContent).toContain('0:00')
    expect(screen.getByText('Registro')).toBeTruthy()
    expect(input.readOnly).toBe(true)
    fireEvent.click(stop)
    await flush()
    expect(voice.transcribe).toHaveBeenCalledWith(expect.any(Uint8Array))
    expect(input.value).toBe('ciao bello mondo')
    expect(input.readOnly).toBe(false)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(trackStop).toHaveBeenCalled()
  })

  it('stops at maxSeconds', async () => {
    vi.useFakeTimers()
    mockVoice()
    render(<Field label="Cerca" maxSeconds={2} />)
    fireEvent.click(screen.getByRole('button', { name: 'Detta' }))
    await flush()
    const r = FakeRecorder.all[0]
    act(() => void vi.advanceTimersByTime(1000))
    expect(r.stop).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Ferma la dettatura' }).textContent).toContain('0:01')
    act(() => void vi.advanceTimersByTime(1000))
    expect(r.stop).toHaveBeenCalled()
  })

  it('only one field records at a time', async () => {
    mockVoice()
    render(
      <>
        <Field label="Primo" />
        <Field label="Secondo" />
      </>
    )
    const [first, second] = screen.getAllByRole('button', { name: 'Detta' })
    fireEvent.click(first)
    await flush()
    fireEvent.click(second)
    await flush()
    expect(FakeRecorder.all).toHaveLength(2)
    expect(FakeRecorder.all[0].stop).toHaveBeenCalled()
    expect(FakeRecorder.all[1].state).toBe('recording')
    expect(screen.getAllByRole('button', { name: 'Ferma la dettatura' })).toHaveLength(1)
  })

  it('unmounting while transcribing drops the text without errors', async () => {
    let resolve!: (s: string) => void
    mockVoice({ transcribe: () => new Promise<string>((r) => (resolve = r)) })
    const onValue = vi.fn()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { unmount } = render(<Field label="Argomento" onValue={onValue} />)
    fireEvent.click(screen.getByRole('button', { name: 'Detta' }))
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Ferma la dettatura' }))
    await flush()
    expect(live().textContent).toBe('Trascrivo…')
    unmount()
    resolve('troppo tardi')
    await flush()
    expect(onValue).not.toHaveBeenCalled()
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  it('leaving while recording stops the microphone and transcribes nothing', async () => {
    const voice = mockVoice()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { unmount } = render(<Field label="Argomento" />)
    fireEvent.click(screen.getByRole('button', { name: 'Detta' }))
    await flush()
    expect(screen.getByRole('button', { name: 'Ferma la dettatura' })).toBeTruthy()
    unmount()
    await flush()
    expect(FakeRecorder.all[0].stop).toHaveBeenCalled()
    expect(trackStop).toHaveBeenCalled()
    expect(voice.transcribe).not.toHaveBeenCalled()
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  it('releases the stage subscription when leaving during a transcription', async () => {
    const off = vi.fn()
    const voice = mockVoice({ transcribe: () => new Promise<string>(() => undefined) })
    voice.onStage.mockImplementation((() => off) as never)
    const { unmount } = render(<Field label="Argomento" />)
    fireEvent.click(screen.getByRole('button', { name: 'Detta' }))
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Ferma la dettatura' }))
    await flush()
    expect(voice.onStage).toHaveBeenCalled()
    unmount()
    expect(off).toHaveBeenCalledTimes(1)
  })

  it('does nothing while disabled, by click or by Option+Space', async () => {
    const voice = mockVoice()
    render(<Field label="Argomento" enabled={false} />)
    const input = screen.getByLabelText('Argomento', { selector: 'input' })
    fireEvent.click(screen.getByRole('button', { name: 'Detta' }))
    input.focus()
    const down = fireEvent.keyDown(input, { key: '\u00a0', code: 'Space', altKey: true })
    await flush()
    expect(down).toBe(true)
    expect(voice.microphone).not.toHaveBeenCalled()
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Detta' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('never starts on a read-only field', async () => {
    const voice = mockVoice()
    render(<Field label="Argomento" locked />)
    fireEvent.click(screen.getByRole('button', { name: 'Detta' }))
    await flush()
    expect(voice.microphone).not.toHaveBeenCalled()
    expect(FakeRecorder.all).toHaveLength(0)
  })

  it('explains a denied microphone', async () => {
    mockVoice({ microphone: async () => false })
    render(<Field label="Argomento" />)
    fireEvent.click(screen.getByRole('button', { name: 'Detta' }))
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Sinapsi non ha il permesso di usare il microfono (Impostazioni di Sistema → Privacy → Microfono).'
    )
    expect(FakeRecorder.all).toHaveLength(0)
  })

  it('turns the microphone off when the recorder cannot start', async () => {
    const voice = mockVoice()
    vi.stubGlobal(
      'MediaRecorder',
      class {
        constructor() {
          throw new DOMException('no audio', 'NotSupportedError')
        }
      }
    )
    render(<Field label="Argomento" />)
    fireEvent.click(screen.getByRole('button', { name: 'Detta' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Non riesco ad aprire il microfono.')
    expect(trackStop).toHaveBeenCalled()
    expect(voice.transcribe).not.toHaveBeenCalled()
    // Not stuck: the button is ready for another try.
    expect(screen.getByRole('button', { name: 'Detta' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('shows the transcription error without the IPC prefix', async () => {
    mockVoice({
      transcribe: async () => {
        throw new Error(
          "Error invoking remote method 'voice:transcribe': Error: Manca mlx_whisper: installalo con «pip install mlx-whisper»"
        )
      }
    })
    render(<Field label="Argomento" />)
    fireEvent.click(screen.getByRole('button', { name: 'Detta' }))
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Ferma la dettatura' }))
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Manca mlx_whisper: installalo con «pip install mlx-whisper»'
    )
    expect(screen.getByRole('alert').textContent).not.toContain('invoking')
  })

  it('announces the model download once, however often the stage repeats', async () => {
    let stage!: (s: 'download' | 'load' | 'transcribe') => void
    const voice = mockVoice({ transcribe: () => new Promise<string>(() => undefined) })
    voice.onStage.mockImplementation(((cb: typeof stage) => {
      stage = cb
      return () => undefined
    }) as never)
    render(<Field label="Argomento" />)
    fireEvent.click(screen.getByRole('button', { name: 'Detta' }))
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Ferma la dettatura' }))
    await flush()
    const region = live()
    expect(region.textContent).toBe('Trascrivo…')
    act(() => stage('download'))
    expect(region.textContent).toBe('Scarico il modello di trascrizione…')
    const node = region.firstChild
    act(() => stage('download'))
    expect(region.firstChild).toBe(node)
  })

  it('shows what it is doing inside the microphone, without a new row', async () => {
    let stage!: (s: 'download' | 'load' | 'transcribe') => void
    const voice = mockVoice({ transcribe: () => new Promise<string>(() => undefined) })
    voice.onStage.mockImplementation(((cb: typeof stage) => {
      stage = cb
      return () => undefined
    }) as never)
    const { container } = render(<Field label="Argomento" />)
    const box = container.querySelector('.mic-field') as HTMLElement
    const children = box.children.length
    fireEvent.click(screen.getByRole('button', { name: 'Detta' }))
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Ferma la dettatura' }))
    await flush()
    const mic = screen.getByRole('button', { name: 'Detta' })
    const shown = (): string => mic.querySelector('.mic-status')?.textContent ?? ''
    expect(shown()).toBe('Trascrivo…')
    act(() => stage('download'))
    expect(shown()).toBe('Scarico il modello…')
    act(() => stage('transcribe'))
    expect(shown()).toBe('Trascrivo…')
    // The words sit in the button: the field's box gains nothing.
    expect(box.children.length).toBe(children)
  })

  it('Option+Space toggles dictation in the focused field', async () => {
    mockVoice()
    render(
      <>
        <Field label="Primo" />
        <Field label="Secondo" />
      </>
    )
    const second = screen.getByLabelText('Secondo', { selector: 'input' })
    second.focus()
    const down = fireEvent.keyDown(second, { key: ' ', code: 'Space', altKey: true })
    expect(down).toBe(false)
    await flush()
    const [, stop] = screen.getAllByRole('button', { name: /Detta|Ferma la dettatura/ })
    expect(stop.getAttribute('aria-label')).toBe('Ferma la dettatura')
    fireEvent.keyDown(second, { key: ' ', code: 'Space', altKey: true })
    await flush()
    expect((second as HTMLInputElement).value).toBe('bello')
    expect((screen.getByLabelText('Primo', { selector: 'input' }) as HTMLInputElement).value).toBe(
      ''
    )
  })
})

describe('Explain', () => {
  it('still transcribes into its textarea', async () => {
    const voice = mockVoice({ transcribe: async () => 'detto a voce' })
    const onChange = vi.fn()
    render(<Explain locked={false} followUp={false} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Detta' }))
    await flush()
    expect(onChange).toHaveBeenLastCalledWith({ answer: '', correct: null, ready: false })
    fireEvent.click(screen.getByRole('button', { name: 'Ferma la dettatura' }))
    await flush()
    expect(voice.transcribe).toHaveBeenCalled()
    expect(
      (screen.getByLabelText('La tua spiegazione, a libro chiuso') as HTMLTextAreaElement).value
    ).toBe('detto a voce')
    expect(onChange).toHaveBeenLastCalledWith({
      answer: 'detto a voce',
      correct: null,
      ready: true
    })
  })
  it('Option+Space does not dictate into a locked answer', async () => {
    const voice = mockVoice()
    const onChange = vi.fn()
    render(<Explain locked followUp={false} onChange={onChange} />)
    const area = screen.getByLabelText('La tua spiegazione, a libro chiuso')
    area.focus()
    fireEvent.keyDown(area, { key: '\u00a0', code: 'Space', altKey: true })
    await flush()
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled()
    expect(voice.microphone).not.toHaveBeenCalled()
    expect(FakeRecorder.all).toHaveLength(0)
    expect(onChange).not.toHaveBeenCalled()
  })
  it('has no microphone once locked', () => {
    mockVoice()
    render(<Explain locked followUp={false} onChange={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Detta' })).toBeNull()
  })
})
