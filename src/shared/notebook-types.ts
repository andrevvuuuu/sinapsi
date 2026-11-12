import { z } from 'zod'

export const SOURCE_KINDS = ['pdf', 'slides', 'audio', 'youtube', 'text', 'vault'] as const
export type SourceKind = (typeof SOURCE_KINDS)[number]

/** A labelled piece of a source: a page, a slide, a heading, a minute of audio. start is in seconds. */
export const SegmentSchema = z.object({
  label: z.string(),
  text: z.string(),
  start: z.number().optional()
})
export type Segment = z.infer<typeof SegmentSchema>
export const SourceTextSchema = z.object({
  segments: z.array(SegmentSchema),
  warnings: z.array(z.string())
})
export type SourceText = z.infer<typeof SourceTextSchema>

export type SourceStatus = 'queued' | 'processing' | 'ready' | 'failed'
export type Source = {
  id: string
  notebookId: string
  kind: SourceKind
  title: string
  /** File name, URL or vault path the source came from. */
  origin: string
  addedAt: number
  status: SourceStatus
  progress?: number
  /** Live only: the first transcription downloads the model. */
  stage?: 'download' | 'transcribe'
  error?: string
  /** What the reader found: "34 pagine", "52 min", warnings. */
  info?: string
}
export type Notebook = {
  id: string
  name: string
  subject: string | null
  createdAt: number
  sources: Source[]
}

export const ExcerptSchema = z.object({
  n: z.number(),
  sourceId: z.string(),
  title: z.string(),
  label: z.string(),
  text: z.string(),
  start: z.number().optional()
})
export type Excerpt = z.infer<typeof ExcerptSchema>
