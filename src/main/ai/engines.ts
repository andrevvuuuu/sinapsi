/**
 * Process spawning helper retained solely for local voice tools (yt-dlp, mlx_whisper).
 * AI operations run exclusively via the OpenRouter HTTP fetch API.
 */

import { spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { homedir } from 'node:os'

export type SpawnFn = (
  cmd: string,
  args: string[],
  opts: {
    timeoutMs: number
    cwd?: string
    onOutput?: (chunk: string) => void
    signal?: AbortSignal
  }
) => Promise<{ stdout: string; stderr: string; code: number | null; timedOut: boolean }>

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
  return [
    ...list(`${home}/Library/Python`, 'bin'),
    ...list('/Library/Frameworks/Python.framework/Versions', 'bin')
  ]
}

/** The PATH the tools run with: apps started from the Finder get a bare one without Homebrew or pip. */
export function toolPath(home = homedir()): string {
  return [
    `${home}/.local/bin`,
    '/opt/homebrew/bin',
    '/usr/local/bin',
    process.env.PATH,
    ...pythonBins(home)
  ].join(':')
}

export const nodeSpawn: SpawnFn = (cmd, args, { timeoutMs, cwd, onOutput, signal }) =>
  new Promise((resolve, reject) => {
    const home = homedir()
    const env = { ...process.env, PATH: toolPath(home) }
    const child = spawn(cmd, args, {
      cwd: cwd ?? home,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let done = false
    const killTree = (): void => {
      for (const sig of ['SIGTERM', 'SIGKILL'] as const) {
        setTimeout(
          () => {
            try {
              if (child.pid) process.kill(-child.pid, sig)
            } catch {
              /* already gone */
            }
          },
          sig === 'SIGTERM' ? 0 : 2000
        ).unref()
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
