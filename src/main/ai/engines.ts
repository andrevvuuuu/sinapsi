import { spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import type { Engine } from '../../shared/settings-schema'
import { AiOutputError } from './errors'
import type { SpawnFn } from './bridge'

export type CallOptions = {
  model?: string
  conversation?: { id: string; resume: boolean }
  systemPrompt?: string
  jsonSchema?: object
  timeoutMs?: number
  /** One-shot calls that must only answer from the prompt (the notebook). */
  noTools?: boolean
  /** One-shot calls that may only read files in their working folder (the photo of a sheet). */
  readOnly?: boolean
}

// The tutor only talks: no file, shell or web tools inside a conversation.
const NO_TOOLS = 'Bash Edit Write Read Glob Grep WebFetch WebSearch Task NotebookEdit'

export function buildArgs(engine: Engine, prompt: string, opts: CallOptions = {}): { cmd: string; args: string[] } {
  const m = opts.model ? ['--model', opts.model] : []
  const schema = opts.jsonSchema ? ['--json-schema', JSON.stringify(opts.jsonSchema)] : []
  const conv = opts.conversation
  if (engine === 'agy') {
    const text = opts.systemPrompt && !conv?.resume ? `${opts.systemPrompt}\n\n${prompt}` : prompt
    const printTimeout = `${Math.max(30, Math.floor((opts.timeoutMs ?? 180_000) / 1000) - 10)}s`
    return { cmd: 'agy', args: ['-p', text, '--output-format', 'json', '--print-timeout', printTimeout, '--disable-slash-commands', ...m, ...(conv?.resume ? ['--conversation', conv.id] : []), ...schema] }
  }
  const session = conv ? (conv.resume ? ['--resume', conv.id] : ['--session-id', conv.id]) : []
  const system = opts.systemPrompt && !conv?.resume ? ['--system-prompt', opts.systemPrompt] : []
  const readOnly = opts.readOnly && !conv ? ['--tools', 'Read', '--allowedTools', 'Read', '--strict-mcp-config', '--setting-sources', ''] : []
  const lockdown = conv || opts.noTools ? ['--tools', '', '--disallowedTools', NO_TOOLS, '--strict-mcp-config', '--setting-sources', ''] : []
  return { cmd: 'claude', args: ['-p', prompt, '--output-format', 'json', ...m, ...session, ...system, ...schema, ...lockdown, ...readOnly] }
}

export function parseOutput(engine: Engine, stdout: string): { text: string; inputTokens: number; outputTokens: number; conversationId?: string } {
  let o: Record<string, unknown>
  try {
    o = JSON.parse(stdout.trim())
  } catch {
    throw new AiOutputError(`${engine}: risposta non in JSON`)
  }
  const usage = (o.usage ?? {}) as Record<string, number>
  const tokens = { inputTokens: usage.input_tokens ?? 0, outputTokens: usage.output_tokens ?? 0 }
  if (engine === 'agy' && o.status === 'SUCCESS' && typeof o.response === 'string')
    return { text: o.response.trim(), ...tokens, conversationId: typeof o.conversation_id === 'string' ? o.conversation_id : undefined }
  if (engine === 'claude' && o.is_error === false && (typeof o.result === 'string' || o.structured_output)) {
    const text = o.structured_output !== undefined && o.structured_output !== null ? JSON.stringify(o.structured_output) : String(o.result).trim()
    return { text, ...tokens, conversationId: typeof o.session_id === 'string' ? o.session_id : undefined }
  }
  throw new AiOutputError(`${engine}: risposta inattesa`)
}

/**
 * Real process runner: stdin closed, cwd = home, own process group so a timeout kills the whole tree
 * (SIGTERM, then SIGKILL). Resolves even if a grandchild keeps the pipes open.
 */
/** Python's per-version bin folders, where pip puts yt-dlp and mlx_whisper. */
function pythonBins(home: string): string[] {
  const list = (dir: string, sub: string): string[] => {
    try {
      return readdirSync(dir)
        .sort()
        .reverse()
        .map((v) => `${dir}/${v}/${sub}`)
    } catch {
      return []
    }
  }
  return [...list(`${home}/Library/Python`, 'bin'), ...list('/Library/Frameworks/Python.framework/Versions', 'bin')]
}

export const nodeSpawn: SpawnFn = (cmd, args, { timeoutMs, cwd, onOutput, signal }) =>
  new Promise((resolve, reject) => {
    const home = homedir()
    const env = { ...process.env, PATH: [`${home}/.local/bin`, '/opt/homebrew/bin', '/usr/local/bin', process.env.PATH, ...pythonBins(home)].join(':') }
    const child = spawn(cmd, args, { cwd: cwd ?? home, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let done = false
    const killTree = (): void => {
      for (const sig of ['SIGTERM', 'SIGKILL'] as const) {
        setTimeout(() => {
          try {
            if (child.pid) process.kill(-child.pid, sig)
          } catch {
            /* already gone */
          }
        }, sig === 'SIGTERM' ? 0 : 2000).unref()
      }
    }
    const finish = (code: number | null): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      clearTimeout(hard)
      resolve({ stdout, stderr, code, timedOut })
    }
    child.stdout.on('data', (d) => {
      stdout += d
      onOutput?.(String(d))
      // A login prompt waits for input forever: stop at once instead of waiting for the timeout.
      if (/authentication page/i.test(stdout)) killTree()
    })
    child.stderr.on('data', (d) => {
      stderr += d
      onOutput?.(String(d))
    })
    const timer = setTimeout(() => {
      timedOut = true
      killTree()
    }, timeoutMs)
    // Hard deadline: never wait more than timeout + 3 s, whatever the pipes do.
    const hard = setTimeout(() => finish(null), timeoutMs + 3000)
    if (signal) {
      if (signal.aborted) killTree()
      else signal.addEventListener('abort', killTree, { once: true })
    }
    child.on('error', (e) => {
      if (done) return
      done = true
      clearTimeout(timer)
      clearTimeout(hard)
      reject(e)
    })
    child.on('close', (code) => finish(code))
    child.on('exit', (code) => setTimeout(() => finish(code), 200).unref())
  })
