import { spawn as nodeSpawnProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { toolPath } from '../ai/engines'
import { extOf, VOICE_MAX } from '../memory/voice'
import { TRANSCRIBE_TIMEOUT } from '../notebook/media'

export type Stage = 'download' | 'load' | 'transcribe'

/** The part of a child process the dictation talks to (stdin/stdout JSON lines). */
export interface ServerProcess {
  stdin: { write(line: string): unknown }
  stdout: { on(event: 'data', cb: (chunk: Buffer | string) => void): unknown }
  on(event: 'exit', cb: (code: number | null) => void): unknown
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
  timer: ReturnType<typeof setTimeout>
}
type Server = { proc: ServerProcess; pending: Map<string, Pending>; closed: boolean }

const IDLE_MS = 10 * 60_000
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

  const stop = (s: Server | null, reason: string): void => {
    if (!s || s.closed) return
    s.closed = true
    if (server === s) server = null
    for (const p of s.pending.values()) {
      clearTimeout(p.timer)
      p.reject(new Error(reason))
    }
    s.pending.clear()
    s.proc.kill()
  }

  const start = (python: string): Server => {
    const s: Server = { proc: opts.spawn(python), pending: new Map(), closed: false }
    let buf = ''
    s.proc.stdout.on('data', (chunk) => {
      buf += String(chunk)
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) onLine(s, line)
    })
    const died = (): void => stop(s, 'Trascrizione interrotta: mlx_whisper si è chiuso')
    s.proc.on('exit', died)
    s.proc.on('error', died)
    return s
  }

  const onLine = (s: Server, line: string): void => {
    let msg: { id?: unknown; text?: unknown; error?: unknown; stage?: unknown }
    try {
      msg = JSON.parse(line)
    } catch {
      return
    }
    if (typeof msg.stage === 'string' && STAGES.has(msg.stage)) {
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
    clearTimeout(p.timer)
    if (typeof msg.error === 'string')
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
      const id = randomBytes(6).toString('hex')
      const timer = setTimeout(() => {
        s.pending.delete(id)
        reject(new Error('mlx_whisper ci ha messo troppo'))
        stop(s, 'Trascrizione interrotta')
      }, TRANSCRIBE_TIMEOUT)
      s.pending.set(id, { resolve, reject, onStage, timer })
      s.proc.stdin.write(JSON.stringify({ id, path: file, language: 'it' }) + '\n')
    })

  const armIdle = (): void => {
    if (idle) clearTimeout(idle)
    idle = null
    if (server && server.pending.size === 0) {
      const s = server
      idle = setTimeout(() => stop(s, 'Trascrizione interrotta'), idleMs)
    }
  }

  return {
    async transcribe(bytes, onStage) {
      if (bytes.length > VOICE_MAX) throw new Error('La registrazione è troppo lunga')
      const ext = extOf(bytes)
      if (!ext) throw new Error('Registrazione non valida')
      if (idle) clearTimeout(idle)
      idle = null
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
