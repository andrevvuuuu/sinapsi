import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { ReviewLineSchema, type ReviewLine } from '../../shared/memory-types'
import { appendJsonl, readJsonl } from '../store/jsonl'

export type MemoryStore = { append(r: ReviewLine): Promise<void>; read(): Promise<ReviewLine[]> }

/** reviews.jsonl: append-only, one line per graded answer. */
export function memoryStore(dir: string): MemoryStore {
  const file = join(dir, 'reviews.jsonl')
  let cached: ReviewLine[] | null = null
  let cachedMeta: { mtimeMs: number; size: number } | null = null

  const readInternal = async (): Promise<ReviewLine[]> => {
    try {
      const stats = await stat(file)
      const currentMeta = { mtimeMs: stats.mtimeMs, size: stats.size }

      if (stats.isFile() && currentMeta.mtimeMs === cachedMeta?.mtimeMs && currentMeta.size === cachedMeta?.size) {
        return cached ? [...cached] : []
      }

      // Altrimenti leggi e aggiorna cache
      const lines = await readJsonl(file, ReviewLineSchema)
      cached = lines
      cachedMeta = currentMeta
      return [...lines]
    } catch (err) {
      if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
        cached = null
        cachedMeta = null
        return []
      }
      throw err
    }
  }

  return {
    append: async (r) => {
      await appendJsonl(file, r)
      // Azzera la cache dopo l'append
      cached = null
      cachedMeta = null
    },
    read: readInternal
  }
}

export { weaknessStore } from './weaknesses'
export type { WeaknessStore } from './weaknesses'
