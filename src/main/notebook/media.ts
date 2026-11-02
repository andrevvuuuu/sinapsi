import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { SpawnFn } from '../ai/bridge'
import type { SourceText } from '../../shared/notebook-types'
import { parseVtt, parseWhisperJson } from './readers'

export type RunTool = SpawnFn
export const WHISPER_MODEL = 'mlx-community/whisper-large-v3-turbo'
const HOSTS = new Set(['www.youtube.com', 'youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'])
const ID = /^[\w-]{11}$/
const TRANSCRIBE_TIMEOUT = 3 * 3600_000
const YT_TIMEOUT = 20 * 60_000

export function youtubeId(u: string): string | null {
  let url: URL
  // Links are pasted as they come: without a scheme, or with http.
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(u.trim()) ? u.trim() : `https://${u.trim()}`
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !HOSTS.has(url.hostname)) return null
  const id = url.hostname === 'youtu.be' ? url.pathname.slice(1) : url.pathname === '/watch' ? url.searchParams.get('v') : (/^\/(?:shorts|live|embed)\/([^/]+)/.exec(url.pathname)?.[1] ?? null)
  return id && ID.test(id) ? id : null
}
export const isYoutubeUrl = (u: string): boolean => youtubeId(u) !== null
/** The one form handed to yt-dlp, whatever was pasted. */
export const canonicalYoutube = (u: string): string | null => {
  const id = youtubeId(u)
  return id ? `https://www.youtube.com/watch?v=${id}` : null
}

/** Runs a tool and turns a missing program or a failure into an Italian message. */
async function tool(run: RunTool, cmd: string, args: string[], timeoutMs: number, onOutput?: (c: string) => void, signal?: AbortSignal): Promise<string> {
  let r
  try {
    r = await run(cmd, args, { timeoutMs, onOutput, signal })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT')
      throw new Error(`Manca ${cmd}: ${cmd === 'yt-dlp' ? 'installalo con «pip install yt-dlp»' : 'installalo con «pip install mlx-whisper»'}`, { cause: e })
    throw e
  }
  if (signal?.aborted) throw new Error('Interrotta')
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

const MODEL_DIR = join(homedir(), '.cache', 'huggingface', 'hub', 'models--mlx-community--whisper-large-v3-turbo')

export async function transcribe(
  run: RunTool,
  file: string,
  outDir: string,
  onProgress: (p: number) => void,
  signal?: AbortSignal,
  onStage?: (s: 'download' | 'transcribe') => void,
  modelDir = MODEL_DIR,
  /** Set for short recordings, where whisper's language detection is unreliable. */
  language?: string
): Promise<SourceText> {
  // The first run downloads the model (about 1.6 GB): say so instead of "Trascrivo… 100%".
  let stage: 'download' | 'transcribe' = existsSync(modelDir) ? 'transcribe' : 'download'
  onStage?.(stage)
  const progress = percent(onProgress)
  await tool(
    run,
    'mlx_whisper',
    ['--model', WHISPER_MODEL, '--output-format', 'json', '--output-dir', outDir, '--output-name', 'trascrizione', '--verbose', 'False', ...(language ? ['--language', language] : []), '--', file],
    TRANSCRIBE_TIMEOUT,
    (chunk) => {
      if (stage === 'download' && /frames/.test(chunk)) {
        stage = 'transcribe'
        onStage?.(stage)
      }
      progress(chunk)
    },
    signal
  )
  const t = parseWhisperJson(JSON.parse(await readFile(join(outDir, 'trascrizione.json'), 'utf8')))
  if (!t.segments.length) throw new Error('Non ho sentito parole nella registrazione')
  return t
}

const SUB_ORDER = [/\.it\.vtt$/, /\.en\.vtt$/, /\.it-orig\.vtt$/, /-orig\.vtt$/, /\.vtt$/]

/**
 * Subtitles first, in two tries: manual Italian or English, then only the auto captions in the video's own
 * language ("-orig"), never YouTube's machine translations. If both fail (none, or HTTP 429), the audio is transcribed.
 */
export async function fetchYoutube(run: RunTool, url: string, dir: string, onProgress: (p: number) => void, signal?: AbortSignal, onStage?: (s: 'download' | 'transcribe') => void): Promise<{ title: string; text: SourceText }> {
  const canonical = canonicalYoutube(url)
  if (!canonical) throw new Error('Link YouTube non valido')
  url = canonical
  let title = 'Video YouTube'
  const trySubs = async (flags: string[]): Promise<SourceText | null> => {
    try {
      const out = await tool(run, 'yt-dlp', ['--skip-download', '--no-simulate', ...flags, '--sub-format', 'vtt', '--no-playlist', '--print', 'title', '-o', join(dir, 'sub'), '--', url], YT_TIMEOUT, undefined, signal)
      title = out.trim().split('\n').filter(Boolean).pop()?.trim() || title
    } catch (e) {
      if (signal?.aborted || (e instanceof Error && e.message.startsWith('Manca'))) throw e
    }
    const files = (await readdir(dir)).filter((f) => f.startsWith('sub.') && f.endsWith('.vtt'))
    for (const re of SUB_ORDER) {
      const f = files.find((x) => re.test(x))
      if (!f) continue
      const text = parseVtt(await readFile(join(dir, f), 'utf8'))
      if (text.segments.length) return text
    }
    return null
  }
  const subs = (await trySubs(['--write-subs', '--sub-langs', 'it,en'])) ?? (await trySubs(['--write-auto-subs', '--sub-langs', '.*-orig']))
  if (subs) return { title, text: subs }
  await tool(run, 'yt-dlp', ['-f', 'bestaudio', '-x', '--audio-format', 'm4a', '--no-playlist', '-o', join(dir, 'audio.%(ext)s'), '--', url], YT_TIMEOUT, percent((p) => onProgress(Math.floor(p / 5))), signal)
  const text = await transcribe(run, join(dir, 'audio.m4a'), dir, (p) => onProgress(20 + Math.floor((p * 4) / 5)), signal, onStage)
  return { title, text }
}
