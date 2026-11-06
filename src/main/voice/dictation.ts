import { spawn as nodeSpawnProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { toolPath } from '../ai/engines'
import { extOf, VOICE_MAX } from '../memory/voice'
import { MISSING_WHISPER } from '../notebook/media'

export type Stage = 'download' | 'load' | 'transcribe'

/** The part of a child process the dictation talks to (stdin/stdout JSON lines). */
export interface ServerProcess {
  stdin: { write(line: string): unknown }
  stdout: { on(event: 'data', cb: (chunk: Buffer | string) => void): unknown }
  /** After exit and after stdout is drained, so a last answer written before exiting is not lost. */
  on(event: 'close', cb: (code: number | null) => void): unknown
  on(event: 'error', cb: (err: Error) => void): unknown
  kill(): unknown
}

/** Starts resources/whisper_server.py with the given Python interpreter. */
export type SpawnFn = (python: string) => ServerProcess

export interface Dictation {
  transcribe(bytes: Uint8Array, onStage?: (s: Stage) => void): Promise<string>
  dispose(): void
}

type Pending = {
  resolve: (text: string) => void
  reject: (e: Error) => void
  onStage?: (s: Stage) => void
}
type Server = {
  proc: ServerProcess
  pending: Map<string, Pending>
  closed: boolean
  stall: ReturnType<typeof setTimeout> | null
  /** The running request's stage, to tell a new stage from a heartbeat, and its hard deadline. */
  stage: Stage | null
  cap: ReturnType<typeof setTimeout> | null
}

const IDLE_MS = 10 * 60_000
/** Longest silence from the server while a recording waits; every stage line or answer restarts it. */
export const STALL_MS = 120_000
/** Longest a request may stay in load or transcribe, heartbeats or not (a 10-minute recording takes about 30 s). */
export const CAP_MS = 10 * 60_000
const STALLED = 'La trascrizione non risponde: riprova'
const STAGES = new Set<string>(['download', 'load', 'transcribe'])

/**
 * Dictation with whisper kept in memory: one Python process answers every recording, so only the first one
 * pays for loading the model. Without a Python that has mlx_whisper, every recording goes to `fallback` (the CLI).
 * The process closes after `idleMs` without recordings and restarts on the next one.
 */
export function createDictation(opts: {
  spawn: SpawnFn
  resolvePython: () => Promise<string | null>
  fallback: (bytes: Uint8Array) => Promise<string>
  dir: string
  idleMs?: number
}): Dictation {
  const idleMs = opts.idleMs ?? IDLE_MS
  let server: Server | null = null
  let starting: Promise<Server | null> | null = null
  let idle: ReturnType<typeof setTimeout> | null = null
  /** Recordings between arriving and their answer, the ones still being written to disk included. */
  let active = 0

  const stop = (s: Server | null, reason: string): void => {
    if (!s || s.closed) return
    s.closed = true
    if (server === s) server = null
    if (s.stall) clearTimeout(s.stall)
    if (s.cap) clearTimeout(s.cap)
    for (const p of s.pending.values()) p.reject(new Error(reason))
    s.pending.clear()
    s.proc.kill()
  }

  /** A hung server (stalled download, Metal hang) is killed instead of keeping every recording waiting. */
  const watch = (s: Server): void => {
    if (s.stall) clearTimeout(s.stall)
    s.stall = s.pending.size && !s.closed ? setTimeout(() => stop(s, STALLED), STALL_MS) : null
  }

  /**
   * The heartbeat keeps a native hang (Metal, a stuck read) looking alive, so load and transcribe also have a
   * deadline from the moment they start. A download only has the silence rule: 1.6 GB can take long.
   */
  const enter = (s: Server, stage: Stage | null): void => {
    if (stage === s.stage) return
    s.stage = stage
    if (s.cap) clearTimeout(s.cap)
    s.cap =
      stage === 'load' || stage === 'transcribe' ? setTimeout(() => stop(s, STALLED), CAP_MS) : null
  }

  const start = (python: string): Server => {
    const s: Server = {
      proc: opts.spawn(python),
      pending: new Map(),
      closed: false,
      stall: null,
      stage: null,
      cap: null
    }
    let buf = ''
    // A character split across two chunks (è, à) is held until its last byte arrives.
    const utf8 = new StringDecoder('utf8')
    s.proc.stdout.on('data', (chunk) => {
      buf += typeof chunk === 'string' ? chunk : utf8.write(chunk)
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) onLine(s, line)
    })
    const died = (): void => stop(s, 'Trascrizione interrotta: mlx_whisper si è chiuso')
    s.proc.on('close', died)
    s.proc.on('error', died)
    return s
  }

  const onLine = (s: Server, line: string): void => {
    let msg: { id?: unknown; text?: unknown; error?: unknown; kind?: unknown; stage?: unknown }
    try {
      msg = JSON.parse(line)
    } catch {
      return
    }
    if (typeof msg.stage === 'string' && STAGES.has(msg.stage)) {
      watch(s)
      enter(s, msg.stage as Stage)
      // The server works in order: the stage belongs to the oldest request still waiting.
      s.pending
        .values()
        .next()
        .value?.onStage?.(msg.stage as Stage)
      return
    }
    const p = typeof msg.id === 'string' ? s.pending.get(msg.id) : undefined
    if (!p) return
    s.pending.delete(msg.id as string)
    watch(s)
    enter(s, null)
    if (msg.kind === 'ModuleNotFoundError' || msg.kind === 'ImportError')
      p.reject(new Error(MISSING_WHISPER))
    else if (typeof msg.error === 'string')
      p.reject(new Error(`mlx_whisper non è riuscito: ${msg.error.slice(0, 200)}`))
    else {
      const text = String(msg.text ?? '')
        .replace(/\s+/g, ' ')
        .trim()
      if (text) p.resolve(text)
      else p.reject(new Error('Non ho sentito parole nella registrazione'))
    }
  }

  const ready = async (): Promise<Server | null> => {
    if (server) return server
    starting ??= opts
      .resolvePython()
      .then((python) => (python ? (server = start(python)) : null))
      .finally(() => {
        starting = null
      })
    return starting
  }

  const ask = (s: Server, file: string, onStage?: (st: Stage) => void): Promise<string> =>
    new Promise((resolve, reject) => {
      if (s.closed) return reject(new Error('Trascrizione interrotta: mlx_whisper si è chiuso'))
      const id = randomBytes(6).toString('hex')
      s.pending.set(id, { resolve, reject, onStage })
      // A new request after a quiet spell gets the full window; one queued behind work keeps the running one's.
      if (s.pending.size === 1) watch(s)
      s.proc.stdin.write(JSON.stringify({ id, path: file, language: 'it' }) + '\n')
    })

  const armIdle = (): void => {
    if (idle) clearTimeout(idle)
    idle = null
    if (server && active === 0 && server.pending.size === 0) {
      const s = server
      idle = setTimeout(() => stop(s, 'Trascrizione interrotta'), idleMs)
    }
  }

  /** One recording to the server, written to a file it can read and deleted afterwards. */
  const send = async (bytes: Uint8Array, ext: string, onStage?: (st: Stage) => void): Promise<string> => {
    let s = await ready()
    if (!s) return opts.fallback(bytes)
    const dir = join(opts.dir, `voce-${randomBytes(6).toString('hex')}`)
    try {
      await mkdir(dir, { recursive: true })
      const file = join(dir, `registrazione.${ext}`)
      await writeFile(file, bytes)
      // The process may have closed while the file was being written.
      if (s.closed) s = await ready()
      if (!s) return await opts.fallback(bytes)
      return await ask(s, file, onStage)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }

  return {
    async transcribe(bytes, onStage) {
      if (bytes.length > VOICE_MAX) throw new Error('La registrazione è troppo lunga')
      const ext = extOf(bytes)
      if (!ext) throw new Error('Registrazione non valida')
      if (idle) clearTimeout(idle)
      idle = null
      active++
      try {
        return await send(bytes, ext, onStage)
      } finally {
        active--
        armIdle()
      }
    },
    dispose() {
      if (idle) clearTimeout(idle)
      idle = null
      stop(server, 'Trascrizione interrotta')
    }
  }
}

/** The interpreter named by a script's first line: a path, `/usr/bin/env python3`, or pip's `/bin/sh` wrapper for long paths. */
export function interpreterOf(script: string): string | null {
  const [first = '', ...rest] = script.split('\n')
  if (!first.startsWith('#!')) return null
  const [cmd = '', arg] = first.slice(2).trim().split(/\s+/)
  if (cmd === '/bin/sh') return /^'''exec' ['"]?([^'"\s]+)/m.exec(rest.join('\n'))?.[1] ?? null
  if (cmd.endsWith('/env')) return arg ?? null
  return cmd || null
}

/** The Python that the first `mlx_whisper` on the tools' PATH runs with, or null if there is none. */
export async function findWhisperPython(path = toolPath()): Promise<string | null> {
  for (const dir of path.split(':')) {
    if (!dir) continue
    const entry = join(dir, 'mlx_whisper')
    if (!existsSync(entry)) continue
    try {
      const python = interpreterOf((await readFile(entry, 'utf8')).slice(0, 1024))
      return python && (!isAbsolute(python) || existsSync(python)) ? python : null
    } catch {
      return null
    }
  }
  return null
}

/** The production SpawnFn: runs the server script with the tools' PATH (mlx_whisper needs ffmpeg from Homebrew). */
export function spawnWhisperServer(script: string): SpawnFn {
  return (python) => {
    const child = nodeSpawnProcess(python, ['-u', script], {
      env: { ...process.env, PATH: toolPath() },
      stdio: ['pipe', 'pipe', 'inherit']
    })
    // A write after the process died must not become an uncaught error in the main process.
    child.stdin.on('error', () => undefined)
    return child
  }
}
