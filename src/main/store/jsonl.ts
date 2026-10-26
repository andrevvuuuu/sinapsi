import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { z } from 'zod'

// One promise chain per file keeps concurrent appends whole and ordered.
const chains = new Map<string, Promise<void>>()

export function appendJsonl(file: string, record: unknown): Promise<void> {
  const line = JSON.stringify(record) + '\n'
  const prev = chains.get(file) ?? Promise.resolve()
  const next = prev.then(async () => {
    await mkdir(dirname(file), { recursive: true })
    await appendFile(file, line, 'utf8')
  })
  chains.set(file, next.catch(() => undefined))
  return next
}

/** Valid records in file order; missing file → []; bad or truncated lines are skipped. */
export async function readJsonl<T>(file: string, schema: z.ZodType<T>): Promise<T[]> {
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw e
  }
  const out: T[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      const parsed = schema.safeParse(JSON.parse(line))
      if (parsed.success) out.push(parsed.data)
      else console.warn(`[jsonl] record non valido in ${file}`)
    } catch {
      console.warn(`[jsonl] riga illeggibile in ${file}`)
    }
  }
  return out
}
