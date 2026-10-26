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

/** Real process runner: stdin closed, cwd = home, SIGTERM then SIGKILL on timeout. */
export const nodeSpawn: SpawnFn = (cmd, args, { timeoutMs }) =>
  new Promise((resolve, reject) => {
    const home = homedir()
    const env = { ...process.env, PATH: [`${home}/.local/bin`, '/opt/homebrew/bin', '/usr/local/bin', process.env.PATH].join(':') }
    const child = spawn(cmd, args, { cwd: home, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    child.stdout.on('data', (d) => {
      stdout += d
      // A login prompt waits for input forever: stop at once instead of waiting for the timeout.
      if (/authentication page/i.test(stdout)) child.kill('SIGTERM')
    })
    child.stderr.on('data', (d) => (stderr += d))
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 2000).unref()
    }, timeoutMs)
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ stdout, stderr, code, timedOut })
    })
  })
