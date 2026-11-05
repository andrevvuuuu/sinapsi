import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { makeVoiceHandlers } from '../../src/main/ipc-handlers'
import { VOICE_MAX } from '../../src/main/memory/voice'
import {
  createDictation,
  interpreterOf,
  type Dictation,
  type ServerProcess
} from '../../src/main/voice/dictation'

const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3])
let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sinapsi-dictation-'))
})
afterEach(() => {
  vi.useRealTimers()
})

type Request = { id: string; path: string; language: string }

/** A stand-in for whisper_server.py: JSON lines on stdin, JSON lines on stdout. */
type Fake = { spawn: Mock<(python: string) => FakeProcess>; procs: FakeProcess[] }

function fakeServer(
  reply: (req: Request, p: FakeProcess) => void = (req, p) =>
    p.say({ id: req.id, text: ` testo ${p.requests.length} ` })
): Fake {
  const procs: FakeProcess[] = []
  const spawn = vi.fn((python: string) => {
    const p = new FakeProcess(python, reply)
    procs.push(p)
    return p
  })
  return { spawn, procs }
}

class FakeProcess extends EventEmitter implements ServerProcess {
  stdout = new EventEmitter()
  requests: Request[] = []
  seen: boolean[] = []
  kill = vi.fn(() => {
    this.emit('exit', null)
    return true
  })
  stdin = {
    write: (line: string): boolean => {
      const req = JSON.parse(line) as Request
      this.requests.push(req)
      this.seen.push(existsSync(req.path))
      queueMicrotask(() => this.reply(req, this))
      return true
    }
  }
  constructor(
    readonly python: string,
    private reply: (req: Request, p: FakeProcess) => void
  ) {
    super()
  }
  say(msg: object): void {
    this.stdout.emit('data', Buffer.from(JSON.stringify(msg) + '\n'))
  }
}

const base = (
  spawn: Fake['spawn'],
  extra: Partial<Parameters<typeof createDictation>[0]> = {}
): Dictation =>
  createDictation({
    spawn,
    resolvePython: async () => '/usr/bin/python3',
    fallback: async () => 'cli',
    dir,
    ...extra
  })

describe('dictation', () => {
  it('reuses one python process for consecutive transcriptions', async () => {
    const { spawn, procs } = fakeServer()
    const d = base(spawn)
    expect(await d.transcribe(webm)).toBe('testo 1')
    expect(await d.transcribe(webm)).toBe('testo 2')
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(spawn.mock.calls[0][0]).toBe('/usr/bin/python3')
    expect(procs[0].requests.map((r) => r.language)).toEqual(['it', 'it'])
    d.dispose()
  })

  it('passes the stages the server announces', async () => {
    const { spawn } = fakeServer((req, p) => {
      p.say({ stage: 'load' })
      p.say({ stage: 'transcribe' })
      p.say({ id: req.id, text: 'ciao' })
    })
    const d = base(spawn)
    const stages: string[] = []
    expect(await d.transcribe(webm, (s) => stages.push(s))).toBe('ciao')
    expect(stages).toEqual(['load', 'transcribe'])
    d.dispose()
  })

  it('falls back to the CLI when no python with mlx_whisper is found', async () => {
    const { spawn } = fakeServer()
    const fallback = vi.fn(async () => 'dalla riga di comando')
    const d = base(spawn, { resolvePython: async () => null, fallback })
    expect(await d.transcribe(webm)).toBe('dalla riga di comando')
    expect(fallback).toHaveBeenCalledWith(webm)
    expect(spawn).not.toHaveBeenCalled()
  })

  it('rejects the pending request and restarts when the process dies', async () => {
    let first = true
    const { spawn } = fakeServer((req, p) => {
      if (first) {
        first = false
        p.emit('exit', 1)
      } else p.say({ id: req.id, text: 'di nuovo' })
    })
    const d = base(spawn)
    await expect(d.transcribe(webm)).rejects.toThrow('Trascrizione interrotta')
    expect(await d.transcribe(webm)).toBe('di nuovo')
    expect(spawn).toHaveBeenCalledTimes(2)
    d.dispose()
  })

  it('reports the error the server sends', async () => {
    const { spawn } = fakeServer((req, p) => p.say({ id: req.id, error: 'boom' }))
    const d = base(spawn)
    await expect(d.transcribe(webm)).rejects.toThrow('boom')
    d.dispose()
  })

  it('says so when nothing was heard', async () => {
    const { spawn } = fakeServer((req, p) => p.say({ id: req.id, text: '  ' }))
    const d = base(spawn)
    await expect(d.transcribe(webm)).rejects.toThrow('Non ho sentito parole nella registrazione')
    d.dispose()
  })

  it('closes the process after idleMs of inactivity', async () => {
    vi.useFakeTimers()
    const { spawn, procs } = fakeServer()
    const d = base(spawn, { idleMs: 1000 })
    await d.transcribe(webm)
    vi.advanceTimersByTime(999)
    expect(procs[0].kill).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(procs[0].kill).toHaveBeenCalledTimes(1)
    d.dispose()
  })

  it('refuses recordings that are not webm or m4a', async () => {
    const { spawn } = fakeServer()
    const d = base(spawn)
    await expect(d.transcribe(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).rejects.toThrow(
      'Registrazione non valida'
    )
    expect(spawn).not.toHaveBeenCalled()
  })

  it('refuses recordings over VOICE_MAX', async () => {
    const { spawn } = fakeServer()
    const d = base(spawn)
    const big = new Uint8Array(VOICE_MAX + 1)
    big.set(webm)
    await expect(d.transcribe(big)).rejects.toThrow('La registrazione è troppo lunga')
    expect(spawn).not.toHaveBeenCalled()
  })

  it('deletes the recording file after transcription', async () => {
    const { spawn, procs } = fakeServer()
    const d = base(spawn)
    await d.transcribe(webm)
    expect(procs[0].seen).toEqual([true])
    expect(procs[0].requests[0].path).toMatch(/voce-[0-9a-f]+\/registrazione\.webm$/)
    expect(existsSync(procs[0].requests[0].path)).toBe(false)
    expect(await readdir(dir)).toEqual([])
    d.dispose()
  })

  it('kills the process on dispose', async () => {
    const { spawn, procs } = fakeServer()
    const d = base(spawn)
    await d.transcribe(webm)
    d.dispose()
    expect(procs[0].kill).toHaveBeenCalled()
  })
})

describe('the python of mlx_whisper', () => {
  it('reads the interpreter from the entry point', () => {
    expect(
      interpreterOf('#!/Library/Frameworks/Python.framework/Versions/3.14/bin/python3\nimport sys')
    ).toBe('/Library/Frameworks/Python.framework/Versions/3.14/bin/python3')
    expect(interpreterOf('#!/usr/bin/env python3\n')).toBe('python3')
    expect(
      interpreterOf("#!/bin/sh\n'''exec' '/very/long/venv/bin/python' \"$0\" \"$@\"\n' '''\n")
    ).toBe('/very/long/venv/bin/python')
    expect(interpreterOf('ELF binary')).toBeNull()
  })
})

describe('voice handlers', () => {
  it('makeVoiceHandlers rejects non-Uint8Array input', async () => {
    const transcribe = vi.fn(async () => 'detto')
    const h = makeVoiceHandlers({ transcribe, microphone: async () => true })
    await expect(h.transcribe('x')).rejects.toThrow('registrazione non valida')
    expect(transcribe).not.toHaveBeenCalled()
    const onStage = vi.fn()
    await expect(h.transcribe(webm, onStage)).resolves.toBe('detto')
    expect(transcribe).toHaveBeenCalledWith(webm, onStage)
    await expect(h.microphone()).resolves.toBe(true)
  })
})
