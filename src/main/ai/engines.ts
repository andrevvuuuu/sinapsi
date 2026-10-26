import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import type { Engine } from '../../shared/settings-schema'
import { AiOutputError } from './errors'
import type { SpawnFn } from './bridge'

export function buildArgs(engine: Engine, prompt: string, model?: string): { cmd: string; args: string[] } {
  const m = model ? ['--model', model] : []
  if (engine === 'agy') return { cmd: 'agy', args: ['-p', prompt, '--output-format', 'json', '--print-timeout', '170s', ...m] }
  return { cmd: 'claude', args: ['-p', prompt, '--output-format', 'json', ...m] }
}

export function parseOutput(engine: Engine, stdout: string): { text: string; inputTokens: number; outputTokens: number } {
  let o: Record<string, unknown>
  try {
    o = JSON.parse(stdout.trim())
  } catch {
    throw new AiOutputError(`${engine}: risposta non in JSON`)
  }
  const usage = (o.usage ?? {}) as Record<string, number>
  const tokens = { inputTokens: usage.input_tokens ?? 0, outputTokens: usage.output_tokens ?? 0 }
  if (engine === 'agy' && o.status === 'SUCCESS' && typeof o.response === 'string') return { text: o.response.trim(), ...tokens }
  if (engine === 'claude' && o.is_error === false && typeof o.result === 'string') return { text: o.result.trim(), ...tokens }
  throw new AiOutputError(`${engine}: risposta inattesa`)
}

/**
 * Real process runner: stdin closed, cwd = home, own process group so a timeout kills the whole tree
 * (SIGTERM, then SIGKILL). Resolves even if a grandchild keeps the pipes open.
 */
export const nodeSpawn: SpawnFn = (cmd, args, { timeoutMs }) =>
  new Promise((resolve, reject) => {
    const home = homedir()
    const env = { ...process.env, PATH: [`${home}/.local/bin`, '/opt/homebrew/bin', '/usr/local/bin', process.env.PATH].join(':') }
    const child = spawn(cmd, args, { cwd: home, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
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
      // A login prompt waits for input forever: stop at once instead of waiting for the timeout.
      if (/authentication page/i.test(stdout)) killTree()
    })
    child.stderr.on('data', (d) => (stderr += d))
    const timer = setTimeout(() => {
      timedOut = true
      killTree()
    }, timeoutMs)
    // Hard deadline: never wait more than timeout + 3 s, whatever the pipes do.
    const hard = setTimeout(() => finish(null), timeoutMs + 3000)
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
