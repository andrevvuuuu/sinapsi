import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { ChainExplanation, ChainSource } from '../../shared/graph-types'
import type { EngineChoice } from '../../shared/settings-schema'
import type { Bridge } from '../ai/bridge'
import type { GraphStore } from './store'

const ExplanationSchema = z.object({ text: z.string().trim().min(1) })
const VerificationSchema = z.object({ verdict: z.enum(['supported', 'not-justified']) })
const sha = (s: string): string => createHash('sha256').update(s).digest('hex')

export function createChainExplainer(deps: {
  bridge: Pick<Bridge, 'ask'>
  source: (chainId: string) => Promise<ChainSource>
  store: Pick<GraphStore, 'getExplanation' | 'putExplanation'>
  engine: () => Promise<EngineChoice>
  otherEngine: () => Promise<EngineChoice | null>
  now?: () => number
}) {
  return async function explainChain(chainId: string, opts: { refresh?: boolean } = {}): Promise<ChainExplanation> {
    const source = await deps.source(chainId)
    const grounded = { premises: source.premises, conclusion: source.conclusion, excerpts: source.excerpts, ...(source.why ? { why: source.why } : {}) }
    const key = `${chainId}:${sha(JSON.stringify(grounded))}`
    if (!opts.refresh) {
      const cached = await deps.store.getExplanation(key)
      if (cached) return cached
    }
    const engine = await deps.engine()
    const context = JSON.stringify(grounded)
    const generated = await deps.bridge.ask<{ text: string }>({
      task: 'teach', prompt: `Spiega in italiano, con rigore e senza aggiungere premesse non date, perché le premesse implicano la conclusione. Usa la nota come unica fonte; se gli estratti non bastano, dichiaralo.\n\nDati della catena:\n${context}\n\nRestituisci JSON: {"text":"…"}`,
      schema: ExplanationSchema, cache: false, priority: 'interactive', engine
    })
    const text = ExplanationSchema.parse(generated.data).text
    let verdict: ChainExplanation['verdict'] = 'unverified'
    let verifiedBy: string | undefined
    try {
      const verifier = await deps.otherEngine()
      if (verifier) {
        const checked = await deps.bridge.ask<{ verdict: 'supported' | 'not-justified' }>({
          task: 'grade', prompt: `Verifica se gli estratti della nota giustificano la spiegazione e il passaggio dalle premesse alla conclusione. Scegli supported solo se il testo sostiene il ragionamento; altrimenti not-justified.\n\nDati e spiegazione:\n${JSON.stringify({ ...grounded, explanation: text })}\n\nRestituisci JSON: {"verdict":"supported|not-justified"}`,
          schema: VerificationSchema, cache: false, priority: 'background', engine: verifier
        })
        verdict = VerificationSchema.parse(checked.data).verdict
        verifiedBy = checked.engine
      }
    } catch { verdict = 'unverified'; verifiedBy = undefined }
    const result: ChainExplanation = { chainId, text, engine: generated.engine, verdict, ...(verifiedBy ? { verifiedBy } : {}), at: (deps.now ?? Date.now)() }
    await deps.store.putExplanation(key, result)
    return result
  }
}

/** Fixed bridge used by tests and the explicitly enabled fake explain path. */
export function fakeChainExplainBridge(): Pick<Bridge, 'ask'> {
  return { ask: (async (req: { task: string }) => ({ data: req.task === 'grade' ? { verdict: 'supported' } : { text: 'La conclusione segue dalle premesse secondo gli estratti forniti.' }, fromCache: false, engine: 'agy' as const })) as Bridge['ask'] }
}
