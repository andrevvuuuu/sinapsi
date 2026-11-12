import { join } from 'node:path'
import { appendJsonl, readJsonl } from '../store/jsonl'
import { LessonEventSchema, type LessonEvent } from '../../shared/lesson-types'
export function lessonStore(dir: string): {
  append: (event: LessonEvent) => Promise<void>
  read: () => Promise<LessonEvent[]>
} {
  const file = join(dir, 'lessons.jsonl')
  return {
    append: (e: LessonEvent) => appendJsonl(file, e),
    read: () => readJsonl(file, LessonEventSchema)
  }
}
