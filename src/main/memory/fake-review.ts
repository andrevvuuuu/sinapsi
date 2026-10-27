import type { Bridge } from '../ai/bridge'

/** e2e only (SINAPSI_FAKE_REVIEW=1): fixed variants and a fixed correction, no quota spent. */
export function fakeReviewBridge(): Pick<Bridge, 'ask'> {
  return {
    ask: (async (req: { task: string; prompt: string; schema: { parse(x: unknown): unknown } }) => {
      await new Promise((r) => setTimeout(r, 100))
      if (req.task === 'grade') return { data: req.schema.parse({ verdict: 'partial', feedback: 'Manca il perché.' }), fromCache: false, engine: 'claude' as const }
      const ids = [...req.prompt.matchAll(/^(n_[0-9a-f]{12}) \|/gm)].map((m) => m[1])
      const raw = {
        concepts: ids.map((id) => ({
          id,
          exercises: [
            { type: 'mc', prompt: 'Quale ipotesi serve sul chiuso $[a,b]$?', options: ['La continuità', 'La derivabilità'], correct: 0, answer: 'La continuità su $[a,b]$.' },
            { type: 'open', prompt: 'Che cosa garantisce questo risultato?', answer: 'Un punto a derivata nulla.' }
          ]
        }))
      }
      return { data: req.schema.parse(raw), fromCache: false, engine: 'agy' as const }
    }) as Bridge['ask']
  }
}
