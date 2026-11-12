import { z } from 'zod'

export const ExamEntrySchema = z
  .object({
    id: z.string().uuid(),
    courseId: z.string().min(1).max(200),
    title: z.string().max(200).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    weight: z.number().min(0).max(1).optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime()
  })
  .strict()
export type ExamEntry = z.infer<typeof ExamEntrySchema>
export type ExamEvent =
  | { t: 'exam-created'; at: string; entry: ExamEntry }
  | { t: 'exam-updated'; at: string; id: string; patch: Partial<ExamEntry> }
  | { t: 'exam-archived'; at: string; id: string }
