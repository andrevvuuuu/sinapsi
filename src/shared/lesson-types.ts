import { z } from 'zod'

export const PacerTypeSchema = z.enum(['P', 'A', 'C', 'E', 'R'])
export type PacerType = z.infer<typeof PacerTypeSchema>
export const MasteryLevelSchema = z.enum(['known', 'partial', 'unknown'])
export type MasteryLevel = z.infer<typeof MasteryLevelSchema>
export const DigestStepSchema = z.enum(['digest', 'recall24h', 'weekly'])
export type DigestStep = z.infer<typeof DigestStepSchema>
export type LaunchDestination =
  | { view: 'practice'; id: string }
  | { view: 'review'; conceptIds: string[] }
  | { kind: 'disabled'; reason: string }
export const RefSchema = z
  .object({ kind: z.enum(['lesson', 'concept']), id: z.string().min(1).max(128) })
  .strict()
export type Ref = z.infer<typeof RefSchema>
const Short = z.string().max(1000)
export const LessonEntrySchema = z
  .object({
    id: z.string().uuid(),
    schema: z.literal(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    courseId: z.string().min(1).max(200),
    topic: z.string().min(1).max(500),
    sourceNote: z.string().max(1024).optional(),
    prerequisites: z.array(RefSchema).max(100),
    core8020: z.array(Short).max(4),
    pacerType: PacerTypeSchema,
    conceptIds: z.array(z.string().min(1).max(128)).max(200),
    confusionQuestions: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            text: Short,
            status: z.enum(['open', 'resolved']),
            resolvedAt: z.string().datetime().optional()
          })
          .strict()
      )
      .max(100),
    activeMisconceptions: z.array(Short).max(100),
    masteryLevel: MasteryLevelSchema,
    highYieldResources: z
      .array(z.object({ label: z.string().max(200), ref: z.string().max(1024) }).strict())
      .max(100),
    digest: z.record(DigestStepSchema, z.string().datetime().nullable()),
    examWeight: z.number().min(0).max(1).optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    nextMode: z.enum(['practice', 'review', 'disabled']).optional(),
    launchReason: z.string().max(500).optional(),
    pending: DigestStepSchema.nullable().optional(),
    independentConceptIds: z.array(z.string()).optional()
  })
  .strict()
export type LessonEntry = z.infer<typeof LessonEntrySchema>
const BaseEvent = { at: z.string().datetime(), id: z.string().uuid() }
export const LessonEventSchema = z.discriminatedUnion('t', [
  z
    .object({ t: z.literal('lesson-created'), at: z.string().datetime(), entry: LessonEntrySchema })
    .strict(),
  z
    .object({ t: z.literal('lesson-updated'), ...BaseEvent, patch: LessonEntrySchema.partial() })
    .strict(),
  z.object({ t: z.literal('digest-done'), ...BaseEvent, step: DigestStepSchema }).strict(),
  z
    .object({ t: z.literal('confusion-added'), ...BaseEvent, qid: z.string().uuid(), text: Short })
    .strict(),
  z.object({ t: z.literal('confusion-resolved'), ...BaseEvent, qid: z.string().uuid() }).strict(),
  z.object({ t: z.literal('mastery-changed'), ...BaseEvent, level: MasteryLevelSchema }).strict(),
  z.object({ t: z.literal('lesson-archived'), ...BaseEvent }).strict(),
  z
    .object({
      t: z.literal('session-launched'),
      ...BaseEvent,
      mode: z.enum(['practice', 'review']),
      ref: z.string().max(200)
    })
    .strict()
])
export type LessonEvent = z.infer<typeof LessonEventSchema>
