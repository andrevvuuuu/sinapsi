import { execFile } from 'node:child_process'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
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

/** Saves the photo of the student's sheet beside the session and transcribes it (text + LaTeX), nothing more. */
const sipsToJpeg = (from: string, to: string): Promise<void> =>
  new Promise((resolve, reject) =>
    execFile('/usr/bin/sips', ['-s', 'format', 'jpeg', from, '--out', to], (e) =>
      e ? reject(new Error('Non riesco a convertire la foto HEIC')) : resolve()
    )
  )

export async function transcribePhoto(input: {
  bridge: Pick<Bridge, 'ask'>
  dir: string
  bytes: Uint8Array
  convert?: (from: string, to: string) => Promise<void>
}): Promise<string> {
  if (input.bytes.length > PHOTO_MAX) throw new Error('La foto è troppo grande (massimo 15 MB)')
  const ext = kindOf(input.bytes)
  if (!ext) throw new Error('Il file non è un’immagine (JPG, PNG o HEIC)')
  await mkdir(input.dir, { recursive: true })
  // The next number after the highest kept: cleaned-up gaps never make a new photo overwrite an old one.
  const n =
    Math.max(
      0,
      ...(await readdir(input.dir)).map((f) => Number(/^foglio-(\d+)\./.exec(f)?.[1] ?? 0))
    ) + 1
  let name = `foglio-${n}.${ext}`
  await writeFile(join(input.dir, name), input.bytes)
  // The model reads JPEG and PNG, not the iPhone's HEIC.
  if (ext === 'heic') {
    await (input.convert ?? sipsToJpeg)(join(input.dir, name), join(input.dir, `foglio-${n}.jpg`))
    name = `foglio-${n}.jpg`
  }
  const savedFile = join(input.dir, name)
  const imageBytes = await readFile(savedFile)
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg'
  const dataUrl = `data:${mime};base64,${Buffer.from(imageBytes).toString('base64')}`

  const r = await input.bridge.ask({
    task: 'photo',
    images: [dataUrl],
    timeoutMs: 120_000,
    schema: PhotoSchema,
    prompt: `Ecco l'immagine della foto di un foglio su cui lo studente ha scritto a mano il suo ragionamento. Trascrivila fedelmente: testo in italiano, matematica in LaTeX con $...$ e $$...$$, un a capo per ogni riga del foglio. Non correggere, non completare, non commentare. Le parti illeggibili segnale con [illeggibile]. Se non è un foglio scritto o è del tutto illeggibile, "readable": false.
Rispondi solo con JSON: {"readable":true,"text":"..."}`
  })
  const out = r.data as z.infer<typeof PhotoSchema>
  if (!out.readable || !out.text.trim())
    throw new Error('Non riesco a leggere il foglio: rifai la foto più da vicino e con più luce.')
  return unescapeOver(out.text).trim()
}

const MONTH = 30 * 86_400_000

/** Photos of sheets older than 30 days are deleted (each can weigh up to 15 MB). */
export async function cleanupPhotos(
  practiceDir: string,
  now: number,
  maxAge = MONTH
): Promise<void> {
  let sessions: string[]
  try {
    sessions = await readdir(practiceDir)
  } catch {
    return
  }
  for (const s of sessions) {
    const dir = join(practiceDir, s)
    let files: string[]
    try {
      files = (await readdir(dir)).filter((f) => f.startsWith('foglio-'))
    } catch {
      continue
    }
    for (const f of files) {
      const st = await stat(join(dir, f)).catch(() => null)
      if (st && now - st.mtimeMs > maxAge) await rm(join(dir, f), { force: true })
    }
  }
}
