import { join } from 'node:path'
import { ReviewLineSchema, type ReviewLine } from '../../shared/memory-types'
import { appendJsonl, readJsonl } from '../store/jsonl'

export type MemoryStore = { append(r: ReviewLine): Promise<void>; read(): Promise<ReviewLine[]> }

/** reviews.jsonl: append-only, one line per graded answer. */
export function memoryStore(dir: string): MemoryStore {
  const file = join(dir, 'reviews.jsonl')
  return { append: (r) => appendJsonl(file, r), read: () => readJsonl(file, ReviewLineSchema) }
}
