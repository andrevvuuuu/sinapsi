import { join } from 'node:path'
import { stat, readFile, rename, writeFile, mkdir } from 'node:fs/promises'
import { ChainLineSchema, ExtractionLineSchema, MoveLineSchema, PropLineSchema, type ChainLine, type ExtractionLine, type Ledgers, type MoveLine, type PropLine } from '../../shared/graph-types'
import type { ChainExplanation } from '../../shared/graph-types'
import { appendJsonl, readJsonl } from '../store/jsonl'

export type GraphStore = {
  append(kind: 'prop', line: PropLine): Promise<void>
  append(kind: 'chain', line: ChainLine): Promise<void>
  append(kind: 'extraction', line: ExtractionLine): Promise<void>
  append(kind: 'move', line: MoveLine): Promise<void>
  read(): Promise<Ledgers>
  getExplanation(key: string): Promise<ChainExplanation | null>
  putExplanation(key: string, value: ChainExplanation): Promise<void>
}

const FILES = { prop: 'propositions.jsonl', chain: 'chains.jsonl', extraction: 'extractions.jsonl', move: 'moves.jsonl' } as const

/** The graph's three append-only ledgers; this module is their only writer. */
export function graphStore(dir: string): GraphStore {
  const explanationFile = join(dir, 'explanations.json')
  let cachedLedgers: Ledgers | null = null
  let lastSignature: string | null = null
  let inFlightRead: Promise<Ledgers> | null = null

  async function fileSig(path: string): Promise<string> {
    try {
      const s = await stat(path)
      return `${s.mtimeMs}:${s.size}`
    } catch {
      return '0:0'
    }
  }

  return {
    append: (kind: keyof typeof FILES, line: unknown) => appendJsonl(join(dir, FILES[kind]), line),
    async read() {
      if (inFlightRead) return inFlightRead
      const p = (async () => {
        const sigs = await Promise.all([
          fileSig(join(dir, FILES.prop)),
          fileSig(join(dir, FILES.chain)),
          fileSig(join(dir, FILES.extraction)),
          fileSig(join(dir, FILES.move))
        ])
        const signature = sigs.join(';')
        if (cachedLedgers && signature === lastSignature) {
          return cachedLedgers
        }
        const [props, chains, extractions, moves] = await Promise.all([
          readJsonl(join(dir, FILES.prop), PropLineSchema),
          readJsonl(join(dir, FILES.chain), ChainLineSchema),
          readJsonl(join(dir, FILES.extraction), ExtractionLineSchema),
          readJsonl(join(dir, FILES.move), MoveLineSchema)
        ])
        const ledgers: Ledgers = { props, chains, extractions, moves }
        lastSignature = signature
        cachedLedgers = ledgers
        return ledgers
      })()
      inFlightRead = p
      try {
        return await p
      } finally {
        inFlightRead = null
      }
    },
    async getExplanation(key) {
      try { return (JSON.parse(await readFile(explanationFile, 'utf8')) as Record<string, ChainExplanation>)[key] ?? null }
      catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e }
    },
    async putExplanation(key, value) {
      await mkdir(dir, { recursive: true })
      let cache: Record<string, ChainExplanation> = {}
      try { cache = JSON.parse(await readFile(explanationFile, 'utf8')) as Record<string, ChainExplanation> }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e }
      cache[key] = value
      const temp = `${explanationFile}.tmp`
      await writeFile(temp, JSON.stringify(cache), 'utf8')
      await rename(temp, explanationFile)
    }
  } as GraphStore
}
