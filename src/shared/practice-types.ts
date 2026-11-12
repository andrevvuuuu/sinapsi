import { z } from 'zod'
import { MISSES } from './practice-protocol'
export const PRACTICE_MAX_CONCEPTS = 4

/** What a practice session is about: concepts from the graph, notebook sources, and/or Andrea's own words. */
export const MaterialSchema = z.object({
  conceptIds: z.array(z.string().min(1).max(64)).max(200),
  sourceIds: z.array(z.string().uuid()).max(100),
  free: z.string().max(20_000),
  lessonId: z.string().max(64).optional()
})
export type Material = z.infer<typeof MaterialSchema>

export const ExamSheetSchema = z.object({
  title: z.string(),
  problems: z
    .array(z.object({ id: z.string().min(1), statement: z.string().min(1), points: z.number().positive(), targets: z.array(z.string()), modelSolution: z.string().min(1) }))
    .min(1)
    .max(12)
})
export type ExamSheet = z.infer<typeof ExamSheetSchema>
export type PublicExamProblem = Omit<ExamSheet['problems'][number], 'modelSolution'> & { modelSolution?: string }

export const ExamGradeReplySchema = z.object({
  items: z.array(z.object({ id: z.string(), points: z.number().min(0), comment: z.string(), miss: z.enum(MISSES).optional() })),
  note: z.string()
})
type ExamGradeReply = z.infer<typeof ExamGradeReplySchema>
/** In a paper exam each item also keeps the points Andrea gave before the correction. */
export type ExamGrade = { items: (ExamGradeReply['items'][number] & { self?: number })[]; note: string; total: number; lode: boolean }

export type CatalogConcept = { id: string; name: string; R: number | null; due: boolean; practiced: boolean }
export type Catalog = {
  subjects: { name: string; notes: { path: string; title: string; concepts: CatalogConcept[] }[] }[]
  sources: { id: string; title: string; kind: string; notebook: string; info: string }[]
  suggested: { id: string; name: string; why: string }[]
}
