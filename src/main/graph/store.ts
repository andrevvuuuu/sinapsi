import { join } from 'node:path'
import { ChainLineSchema, ExtractionLineSchema, PropLineSchema, type ChainLine, type ExtractionLine, type Ledgers, type PropLine } from '../../shared/graph-types'
import { appendJsonl, readJsonl } from '../store/jsonl'

export type GraphStore = {
  append(kind: 'prop', line: PropLine): Promise<void>
  append(kind: 'chain', line: ChainLine): Promise<void>
  append(kind: 'extraction', line: ExtractionLine): Promise<void>
  read(): Promise<Ledgers>
}

const FILES = { prop: 'propositions.jsonl', chain: 'chains.jsonl', extraction: 'extractions.jsonl' } as const

/** The graph's three append-only ledgers; this module is their only writer. */
export function graphStore(dir: string): GraphStore {
  return {
    append: (kind: keyof typeof FILES, line: unknown) => appendJsonl(join(dir, FILES[kind]), line),
    async read() {
      const [props, chains, extractions] = await Promise.all([
        readJsonl(join(dir, FILES.prop), PropLineSchema),
        readJsonl(join(dir, FILES.chain), ChainLineSchema),
        readJsonl(join(dir, FILES.extraction), ExtractionLineSchema)
      ])
      return { props, chains, extractions }
    }
  } as GraphStore
}
