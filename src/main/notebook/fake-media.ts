import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { RunTool } from './media'

const VTT = `WEBVTT

00:00:00.000 --> 00:00:04.000
Oggi parliamo di derivate e del teorema di Rolle.

00:01:10.000 --> 00:01:14.000
Il lemma del cammello è il nome che usiamo nel corso.
`
const WHISPER = { text: '', segments: [{ start: 0, end: 5, text: ' Benvenuti alla lezione sulle derivate.' }, { start: 75, end: 80, text: ' Il teorema di Lagrange segue da Rolle.' }] }

/** Stand-in for yt-dlp and mlx_whisper (tests and SINAPSI_FAKE_MEDIA=1): writes the files the real tools would. */
export function fakeMedia(): RunTool {
  return async (cmd, args) => {
    const after = (flag: string): string => args[args.indexOf(flag) + 1]
    const ok = (stdout = ''): { stdout: string; stderr: string; code: number; timedOut: boolean } => ({ stdout, stderr: '', code: 0, timedOut: false })
    if (cmd === 'mlx_whisper') {
      await mkdir(after('--output-dir'), { recursive: true })
      await writeFile(join(after('--output-dir'), `${after('--output-name')}.json`), JSON.stringify(WHISPER))
      return ok()
    }
    const url = args[args.length - 1]
    const out = after('-o')
    await mkdir(dirname(out), { recursive: true })
    if (args.includes('--skip-download')) {
      if (!url.includes('nosubs')) await writeFile(`${out}.it.vtt`, VTT)
      return ok('Video di prova\n')
    }
    await writeFile(out.replace('%(ext)s', 'm4a'), 'audio')
    return ok()
  }
}
