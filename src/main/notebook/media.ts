import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SpawnFn } from '../ai/bridge'
import type { SourceText } from '../../shared/notebook-types'
import { parseVtt, parseWhisperJson } from './readers'

export type RunTool = SpawnFn
export const WHISPER_MODEL = 'mlx-community/whisper-large-v3-turbo'
const HOSTS = new Set(['www.youtube.com', 'youtube.com', 'm.youtube.com', 'youtu.be'])
const ID = /^[\w-]{11}$/
const TRANSCRIBE_TIMEOUT = 3 * 3600_000
const YT_TIMEOUT = 20 * 60_000

export function youtubeId(u: string): string | null {
  let url: URL
  try {
    url = new URL(u)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || !HOSTS.has(url.hostname)) return null
  const id = url.hostname === 'youtu.be' ? url.pathname.slice(1) : url.pathname === '/watch' ? url.searchParams.get('v') : (/^\/(?:shorts|live|embed)\/([^/]+)/.exec(url.pathname)?.[1] ?? null)
  return id && ID.test(id) ? id : null
}
export const isYoutubeUrl = (u: string): boolean => youtubeId(u) !== null

/** Runs a tool and turns a missing program or a failure into an Italian message. */
async function tool(run: RunTool, cmd: string, args: string[], timeoutMs: number, onOutput?: (c: string) => void): Promise<string> {
  let r
  try {
    r = await run(cmd, args, { timeoutMs, onOutput })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`Manca ${cmd}: ${cmd === 'yt-dlp' ? 'installalo con «pip install yt-dlp»' : 'installalo con «pip install mlx-whisper»'}`)
    throw e
  }
  if (r.timedOut) throw new Error(`${cmd} ci ha messo troppo`)
  if (r.code !== 0) {
    const last = (r.stderr || r.stdout).trim().split('\n').filter((l) => /error/i.test(l)).pop()
    throw new Error(`${cmd} non è riuscito${last ? `: ${last.replace(/^ERROR:\s*/, '').slice(0, 200)}` : ''}`)
  }
  return r.stdout
}

const percent = (onProgress: (p: number) => void) => (chunk: string) => {
  const all = [...chunk.matchAll(/(\d{1,3}(?:\.\d+)?)%/g)]
  if (all.length) onProgress(Math.min(100, Math.floor(Number(all[all.length - 1][1]))))
}

export async function transcribe(run: RunTool, file: string, outDir: string, onProgress: (p: number) => void): Promise<SourceText> {
  await tool(run, 'mlx_whisper', ['--model', WHISPER_MODEL, '--output-format', 'json', '--output-dir', outDir, '--output-name', 'trascrizione', '--verbose', 'False', '--', file], TRANSCRIBE_TIMEOUT, percent(onProgress))
  const t = parseWhisperJson(JSON.parse(await readFile(join(outDir, 'trascrizione.json'), 'utf8')))
  if (!t.segments.length) throw new Error('Non ho sentito parole nella registrazione')
  return t
}

// Manual Italian, then manual English, then the auto captions in the video's own language.
const SUB_ORDER = [/\.it\.vtt$/, /\.en\.vtt$/, /-orig\.vtt$/, /\.vtt$/]

export async function fetchYoutube(run: RunTool, url: string, dir: string, onProgress: (p: number) => void): Promise<{ title: string; text: SourceText }> {
  if (!isYoutubeUrl(url)) throw new Error('Link YouTube non valido')
  const out = await tool(run, 'yt-dlp', ['--skip-download', '--no-simulate', '--write-subs', '--write-auto-subs', '--sub-langs', 'it,en,it-orig,en-orig', '--sub-format', 'vtt', '--no-playlist', '--print', 'title', '-o', join(dir, 'sub'), '--', url], YT_TIMEOUT)
  const title = out.trim().split('\n').filter(Boolean).pop()?.trim() || 'Video YouTube'
  const files = (await readdir(dir)).filter((f) => f.startsWith('sub.') && f.endsWith('.vtt'))
  for (const re of SUB_ORDER) {
    const f = files.find((x) => re.test(x))
    if (!f) continue
    const text = parseVtt(await readFile(join(dir, f), 'utf8'))
    if (text.segments.length) return { title, text }
  }
  await tool(run, 'yt-dlp', ['-f', 'bestaudio', '-x', '--audio-format', 'm4a', '--no-playlist', '-o', join(dir, 'audio.%(ext)s'), '--', url], YT_TIMEOUT, percent((p) => onProgress(Math.floor(p / 5))))
  const text = await transcribe(run, join(dir, 'audio.m4a'), dir, (p) => onProgress(20 + Math.floor((p * 4) / 5)))
  return { title, text }
}
