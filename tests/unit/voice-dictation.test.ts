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
  STALL_MS,
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
    this.emit('close', null)
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

/** Waits, on real I/O, until the recording has reached the fake server. */
async function sent(ok: () => boolean): Promise<void> {
  while (!ok()) await new Promise((r) => setImmediate(r))
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
        p.emit('close', 1)
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

  it('keeps an answer written just before the process closes', async () => {
    const { spawn } = fakeServer((req, p) => {
      p.say({ id: req.id, text: 'ultima' })
      p.emit('close', 0)
    })
    const d = base(spawn)
    expect(await d.transcribe(webm)).toBe('ultima')
    d.dispose()
  })

  it('says mlx_whisper is missing when the server cannot import it', async () => {
    const { spawn } = fakeServer((req, p) =>
      p.say({ id: req.id, error: "No module named 'mlx'", kind: 'ModuleNotFoundError' })
    )
    const d = base(spawn)
    await expect(d.transcribe(webm)).rejects.toThrow(
      'Manca mlx_whisper: installalo con «pip install mlx-whisper»'
    )
    d.dispose()
  })

  it('kills a server that stops answering and starts a new one for the next recording', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let calls = 0
    const { spawn, procs } = fakeServer((req, p) => {
      if (++calls > 1) p.say({ id: req.id, text: 'ripartito' })
    })
    const d = base(spawn)
    const caught = d.transcribe(webm).catch((e: Error) => e)
    await sent(() => procs[0]?.requests.length === 1)
    await vi.advanceTimersByTimeAsync(STALL_MS - 1)
    expect(procs[0].kill).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect((await caught).message).toBe('La trascrizione non risponde: riprova')
    expect(procs[0].kill).toHaveBeenCalled()
    expect(await d.transcribe(webm)).toBe('ripartito')
    expect(spawn).toHaveBeenCalledTimes(2)
    d.dispose()
  })

  it('gives a server more time each time it announces a stage', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let proc: FakeProcess | undefined
    let id = ''
    const { spawn } = fakeServer((req, p) => {
      proc = p
      id = req.id
    })
    const d = base(spawn)
    const stages: string[] = []
    const result = d.transcribe(webm, (s) => stages.push(s))
    await sent(() => proc !== undefined)
    await vi.advanceTimersByTimeAsync(STALL_MS - 1000)
    proc!.say({ stage: 'download' })
    await vi.advanceTimersByTimeAsync(STALL_MS - 1000)
    proc!.say({ stage: 'transcribe' })
    await vi.advanceTimersByTimeAsync(STALL_MS - 1000)
    expect(proc!.kill).not.toHaveBeenCalled()
    proc!.say({ id, text: 'scaricato' })
    expect(await result).toBe('scaricato')
    expect(stages).toEqual(['download', 'transcribe'])
    d.dispose()
  })

  it('lets a long recording run while the server sends heartbeats', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let proc: FakeProcess | undefined
    let id = ''
    const { spawn } = fakeServer((req, p) => {
      proc = p
      id = req.id
    })
    const d = base(spawn)
    const result = d.transcribe(webm)
    await sent(() => proc !== undefined)
    proc!.say({ stage: 'transcribe' })
    for (let t = 0; t < 5 * 60_000; t += 15_000) {
      await vi.advanceTimersByTimeAsync(15_000)
      proc!.say({ stage: 'transcribe' })
    }
    expect(proc!.kill).not.toHaveBeenCalled()
    proc!.say({ id, text: 'dieci minuti di spiegazione' })
    expect(await result).toBe('dieci minuti di spiegazione')
    expect(spawn).toHaveBeenCalledTimes(1)
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
