import type { Bridge } from '../ai/bridge'
import { ExtractReplySchema } from './extract'

/** e2e only (SINAPSI_FAKE_EXTRACT=1): fixed concepts for the fixture vault, no quota spent. */
export function fakeExtractBridge(): Pick<Bridge, 'ask'> {
  return {
    ask: (async (req: { prompt: string }) => {
      await new Promise((r) => setTimeout(r, 200))
      const p = req.prompt
      let raw: unknown = { propositions: [], chains: [] }
      if (p.includes('NOTA OBSIDIAN «Teorema di Rolle»'))
        raw = {
          propositions: [
            { id: 'p1', name: 'Teorema di Weierstrass', statement: 'Una funzione continua su $[a,b]$ ha massimo e minimo assoluti.', section: '§3' },
            { id: 'p2', name: 'Teorema di Fermat', statement: 'In un estremo relativo interno dove $f$ è derivabile, $f\'(x_0)=0$.', section: '§3' },
            { id: 'p3', name: 'Teorema di Rolle', statement: 'Se $f$ è continua su $[a,b]$, derivabile in $(a,b)$ e $f(a)=f(b)$, esiste $c$ con $f\'(c)=0$.', section: '§2' }
          ],
          chains: [{ premises: ['p1', 'p2'], conclusion: 'p3' }]
        }
      else if (p.includes('NOTA OBSIDIAN «Teorema di Lagrange»')) {
        const rolle = /(n_[0-9a-f]{12}) \| Teorema di Rolle/.exec(p)?.[1]
        raw = {
          propositions: [
            { id: 'p1', name: 'Teorema di Lagrange', statement: 'Esiste $c\\in(a,b)$ con $f\'(c)=\\frac{f(b)-f(a)}{b-a}$.', section: '§2' },
            ...(rolle ? [{ ref: rolle, section: '§3' }] : [])
          ],
          chains: rolle ? [{ premises: [rolle], conclusion: 'p1' }] : []
        }
      }
      return { data: ExtractReplySchema.parse(raw), fromCache: false, engine: 'agy' as const }
    }) as Bridge['ask']
  }
}
