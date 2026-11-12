import { join } from 'node:path'
import { appendJsonl, readJsonl } from '../store/jsonl'
import { ExamEntrySchema, type ExamEvent } from '../../shared/exam-types'

import { z } from 'zod'
const Event = z.discriminatedUnion('t', [
  z
    .object({ t: z.literal('exam-created'), at: z.string().datetime(), entry: ExamEntrySchema })
    .strict(),
  z
    .object({
      t: z.literal('exam-updated'),
      at: z.string().datetime(),
      id: z.string().uuid(),
      patch: ExamEntrySchema.partial()
    })
    .strict(),
  z
    .object({ t: z.literal('exam-archived'), at: z.string().datetime(), id: z.string().uuid() })
    .strict()
])
export function examStore(dir: string) {
  const file = join(dir, 'exams.jsonl')
  return { append: (e: ExamEvent) => appendJsonl(file, e), read: () => readJsonl(file, Event) }
}
