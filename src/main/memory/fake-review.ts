import type { Bridge } from '../ai/bridge'
import { EXPLAIN_MARK } from './explain'

/** e2e only (SINAPSI_FAKE_REVIEW=1): fixed variants and a fixed correction, no quota spent. */
export function fakeReviewBridge(): Pick<Bridge, 'ask'> {
  return {
    ask: (async (req: { task: string; prompt: string; schema: { parse(x: unknown): unknown } }) => {
      await new Promise((r) => setTimeout(r, 100))
      if (req.task === 'grade' && req.prompt.includes(EXPLAIN_MARK))
        return {
          data: req.schema.parse(req.prompt.includes('Tu (domanda):') ? { action: 'grade', verdict: 'partial', feedback: 'Manca il passaggio da $f(a)=f(b)$ al punto interno.' } : { action: 'ask', question: 'Perché il massimo è in un punto interno?' }),
          fromCache: false,
          engine: 'claude' as const
        }
      if (req.task === 'grade') return { data: req.schema.parse({ verdict: 'partial', feedback: 'Manca il perché.' }), fromCache: false, engine: 'claude' as const }
      const ids = [...req.prompt.matchAll(/^(n_[0-9a-f]{12}) \|/gm)].map((m) => m[1])
      const raw = {
        concepts: ids.map((id) => ({
          id,
          exercises: [
            { type: 'mc', prompt: 'Quale ipotesi serve sul chiuso $[a,b]$?', options: ['La continuità', 'La derivabilità'], correct: 0, answer: 'La continuità su $[a,b]$.' },
            { type: 'open', prompt: 'Che cosa garantisce questo risultato?', answer: 'Un punto a derivata nulla.' },
            { type: 'explain', prompt: 'A libro chiuso: ricostruisci la dimostrazione.', answer: 'Weierstrass dà massimo e minimo; se coincidono $f$ è costante, altrimenti uno è interno e lì $f\'=0$ per Fermat.' }
          ]
        }))
      }
      return { data: req.schema.parse(raw), fromCache: false, engine: 'agy' as const }
    }) as Bridge['ask']
  }
}
