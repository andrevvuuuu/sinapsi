import { randomBytes } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { transcribe, type RunTool } from '../notebook/media'

export const VOICE_MAX = 40 * 1024 * 1024

/** The recording's container from its first bytes: MediaRecorder writes WebM (EBML), Safari-style recorders MP4. */
function extOf(b: Uint8Array): 'webm' | 'm4a' | null {
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'webm'
  if (String.fromCharCode(...b.slice(4, 8)) === 'ftyp') return 'm4a'
  return null
}

/** A spoken "Spiegalo tu" answer as text, with the Notebook's mlx_whisper; the recording is deleted afterwards. */
export async function transcribeVoice(input: { run: RunTool; dir: string; bytes: Uint8Array; transcribe?: typeof transcribe }): Promise<string> {
  if (input.bytes.length > VOICE_MAX) throw new Error('La registrazione è troppo lunga')
  const ext = extOf(input.bytes)
  if (!ext) throw new Error('Registrazione non valida')
  const dir = join(input.dir, `voce-${randomBytes(6).toString('hex')}`)
  await mkdir(dir, { recursive: true })
  try {
    const file = join(dir, `registrazione.${ext}`)
    await writeFile(file, input.bytes)
    const t = await (input.transcribe ?? transcribe)(input.run, file, dir, () => undefined, undefined, undefined, undefined, 'it')
    return t.segments
      .map((s) => s.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
