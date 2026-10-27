import { z } from 'zod'

/**
 * The knowledge graph (Learn Harness model): nodes are true propositions, chains are premises that
 * jointly entail a conclusion. Stored as append-only ledger lines; everything else is derived.
 */
export const PropLineSchema = z.object({
  id: z.string(),
  name: z.string(),
  statement: z.string(),
  notePath: z.string(),
  section: z.string().optional(),
  at: z.number()
})
export const ChainLineSchema = z.object({ id: z.string(), premises: z.array(z.string()), conclusion: z.string(), notePath: z.string(), at: z.number() })
export const ExtractionLineSchema = z.object({
  notePath: z.string(),
  hash: z.string(),
  at: z.number(),
  reason: z.enum(['manual', 'study', 'background']),
  nodes: z.number(),
  chains: z.number(),
  dropped: z.number(),
  ok: z.boolean(),
  /** A background check that found the note unchanged: no AI call, does not count toward the daily limit. */
  skipped: z.boolean().optional(),
  error: z.string().optional()
})
export type PropLine = z.infer<typeof PropLineSchema>
export type ChainLine = z.infer<typeof ChainLineSchema>
export type ExtractionLine = z.infer<typeof ExtractionLineSchema>
export type Ledgers = { props: PropLine[]; chains: ChainLine[]; extractions: ExtractionLine[] }

export type Concept = {
  id: string
  name: string
  statement: string
  aliases: string[]
  /** The note the concept was born in. */
  birth: string
  /** Every note it appears in, birth first. */
  notes: string[]
  sections: Record<string, string>
  depth: number
}
export type Chain = { id: string; premises: string[]; conclusion: string; notes: string[] }
export type GraphData = { concepts: Concept[]; chains: Chain[]; extracted: Record<string, { hash: string; at: number }> }

export type ExtractorStatus = { running?: string; queued: string[]; lastError?: { notePath: string; message: string } }
