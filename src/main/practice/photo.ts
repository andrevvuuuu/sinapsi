import { execFile } from 'node:child_process'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { Bridge } from '../ai/bridge'
import { unescapeOver } from '../ai/json'

export const PHOTO_MAX = 15 * 1024 * 1024
const PhotoSchema = z.object({ readable: z.boolean(), text: z.string() })

/** The image format from its first bytes: only real photos are saved and sent. */
function kindOf(b: Uint8Array): 'png' | 'jpg' | 'heic' | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg'
  const brand = String.fromCharCode(...b.slice(4, 12))
  if (brand.startsWith('ftyp') && /heic|heix|mif1|hevc/.test(brand)) return 'heic'
  return null
}

/** Saves the photo of Andrea's sheet beside the session and has Claude transcribe it (text + LaTeX), nothing more. */
const sipsToJpeg = (from: string, to: string): Promise<void> =>
  new Promise((resolve, reject) => execFile('/usr/bin/sips', ['-s', 'format', 'jpeg', from, '--out', to], (e) => (e ? reject(new Error('Non riesco a convertire la foto HEIC')) : resolve())))

export async function transcribePhoto(input: { bridge: Pick<Bridge, 'ask'>; dir: string; bytes: Uint8Array; convert?: (from: string, to: string) => Promise<void> }): Promise<string> {
  if (input.bytes.length > PHOTO_MAX) throw new Error('La foto è troppo grande (massimo 15 MB)')
  const ext = kindOf(input.bytes)
  if (!ext) throw new Error('Il file non è un’immagine (JPG, PNG o HEIC)')
  await mkdir(input.dir, { recursive: true })
  const n = new Set((await readdir(input.dir)).filter((f) => f.startsWith('foglio-')).map((f) => f.replace(/\.\w+$/, ''))).size + 1
  let name = `foglio-${n}.${ext}`
  await writeFile(join(input.dir, name), input.bytes)
  // Claude reads JPEG and PNG, not the iPhone's HEIC.
  if (ext === 'heic') {
    await (input.convert ?? sipsToJpeg)(join(input.dir, name), join(input.dir, `foglio-${n}.jpg`))
    name = `foglio-${n}.jpg`
  }
  const r = await input.bridge.ask({
    task: 'grade',
    readOnly: true,
    cwd: input.dir,
    timeoutMs: 120_000,
    schema: PhotoSchema,
    prompt: `Nella cartella di lavoro c'è l'immagine «${name}»: la foto di un foglio su cui Andrea ha scritto a mano il suo ragionamento. Aprila con lo strumento Read e trascrivila fedelmente: testo in italiano, matematica in LaTeX con $...$ e $$...$$, un a capo per ogni riga del foglio. Non correggere, non completare, non commentare. Le parti illeggibili segnale con [illeggibile]. Se non è un foglio scritto o è del tutto illeggibile, "readable": false.
Rispondi solo con JSON: {"readable":true,"text":"..."}`
  })
  const out = r.data as z.infer<typeof PhotoSchema>
  if (!out.readable || !out.text.trim()) throw new Error('Non riesco a leggere il foglio: rifai la foto più da vicino e con più luce.')
  return unescapeOver(out.text).trim()
}
