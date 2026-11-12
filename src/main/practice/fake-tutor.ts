import type { Bridge } from '../ai/bridge'
import type { PracticeTurn } from '../../shared/practice-protocol'

/** e2e only (SINAPSI_FAKE_PRACTICE=1): a scripted tutor — two problems, hints, conclusions, a summary. */
export function fakeTutor(): Pick<Bridge, 'converse' | 'ask'> {
  const state = new Map<string, { posed: number; hints: number; target: string[] }>()
  const turn = (prompt: string, st: { posed: number; hints: number; target: string[] }): PracticeTurn => {
    const pose = (): PracticeTurn => {
      st.posed++
      st.hints = 0
      return st.posed === 1
        ? { phase: 'warmup', blocks: [{ type: 'text', md: 'Si parte con uno facile.' }], problem: { id: 'p1', statement: 'Mostra che per ogni $a, b$ reali vale $|\\sin a - \\sin b| \\le |a - b|$.', mode: 'recall', targets: st.target, modelSolution: 'Per il teorema del valor medio $\\sin a - \\sin b = \\cos c\\,(a-b)$ e $|\\cos c| \\le 1$.' } }
        : { phase: 'body', blocks: [{ type: 'text', md: 'Cambio argomento.' }], problem: { id: 'p2', statement: 'Uno studente scrive questa dimostrazione. Dov’è l’errore?', mode: 'discrimination', targets: st.target, modelSolution: 'Riga 3: $|x|$ non è derivabile in 0, Rolle non si applica.', lines: ['$f(x)=|x|$ è continua su $[-1,1]$', '$f(-1)=f(1)=1$', 'Quindi per Rolle esiste $c$ con $f\'(c)=0$', 'Infatti $c=0$ va bene'] } }
    }
    if (prompt.startsWith('MATERIALE')) return pose()
    if (prompt.startsWith('Mi serve un indizio.')) return { phase: 'warmup', blocks: [], hint: { rung: st.hints++, md: 'A sinistra c’è una **differenza di valori** della stessa funzione.' } }
    if (prompt.startsWith('Lascio')) return { phase: 'body', blocks: [], conclude: { outcome: 'surrendered', verdict: 'Lo riprendiamo nel ritest.', retest: true } }
    if (prompt.startsWith('Domanda sul problema')) return { phase: 'body', blocks: [{ type: 'text', md: 'Perché la differenza di valori chiama il valor medio.' }] }
    if (prompt === 'Prossimo problema.') return st.posed < 2 ? pose() : { phase: 'done', blocks: [{ type: 'text', md: 'Basta per oggi.' }], summary: { solved: ['Valor medio', 'Ipotesi di Rolle'], retest: [], note: 'Due su due.' } }
    if (prompt.startsWith('Basta')) return { phase: 'done', blocks: [], summary: { solved: [], retest: [], note: 'Chiusa.' } }
    return st.hints
      ? { phase: 'warmup', blocks: [{ type: 'text', md: 'Corretto: la mossa è il valor medio.' }], conclude: { outcome: 'solved_hints', verdict: 'Risolto con un indizio.', retest: true, miss: 'cue' } }
      : { phase: 'body', blocks: [{ type: 'text', md: 'Corretto.' }], conclude: { outcome: 'solved', verdict: 'Risolto senza aiuti.', retest: false } }
  }
  return {
    converse: (async (req: { conversationId: string; prompt: string; schema: { parse(x: unknown): unknown } }) => {
      await new Promise((r) => setTimeout(r, 50))
      const st = state.get(req.conversationId) ?? { posed: 0, hints: 0, target: [...req.prompt.matchAll(/^(n_\w+) \|/gm)].map((m) => m[1]).slice(0, 1) }
      state.set(req.conversationId, st)
      return { data: req.schema.parse(turn(req.prompt, st)), conversationId: req.conversationId, engine: 'claude' as const }
    }) as Bridge['converse'],
    ask: (async (req: { prompt: string; schema?: { parse(x: unknown): unknown } }) => {
      await new Promise((r) => setTimeout(r, 50))
      const parse = (x: unknown): unknown => (req.schema ? req.schema.parse(x) : x)
      if (req.prompt.startsWith('Prepara una prova'))
        return {
          data: parse({
            title: 'Prova scritta di prova',
            problems: [
              { id: 'e1', statement: 'Calcola $\\lim_{x\\to 0} \\frac{\\sin x}{x}$.', points: 12, targets: [], modelSolution: 'Vale $1$.' },
              { id: 'e2', statement: 'Enuncia e dimostra il teorema di Rolle.', points: 18, targets: [], modelSolution: 'Weierstrass e Fermat.' }
            ]
          }),
          fromCache: false,
          engine: 'claude' as const
        }
      if (req.prompt.startsWith('Correggi questa prova'))
        return { data: parse({ items: [{ id: 'e1', points: 12, comment: 'Corretto.' }, { id: 'e2', points: 9, comment: 'Manca la derivabilità.', miss: 'execution' }], note: 'Riprendi le ipotesi di Rolle.' }), fromCache: false, engine: 'claude' as const }
      return { data: parse({ readable: true, text: '$|\\sin a - \\sin b| = |\\cos c|\\,|a-b| \\le |a-b|$' }), fromCache: false, engine: 'claude' as const }
    }) as Bridge['ask']
  }
}
