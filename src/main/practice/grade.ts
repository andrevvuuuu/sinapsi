import { z } from 'zod'
import { MISSES, type PracticeTurn } from '../../shared/practice-protocol'
import type { EngineChoice } from '../../shared/settings-schema'
import type { Bridge } from '../ai/bridge'
import { GRADING_RIGOR } from '../ai/rigor'

const ReplySchema = z.object({
  items: z.array(z.object({
    conceptId: z.string(),
    state: z.enum(['corretto', 'errore_qui', 'non_attribuibile']),
    miss: z.enum(MISSES).optional()
  }))
})

export type PracticeGradeItem = z.infer<typeof ReplySchema>['items'][number]

export async function gradePracticeProblem(
  bridge: Pick<Bridge, 'ask'>,
  input: {
    statement: string
    modelSolution: string
    finalAnswer: string
    maxRung: number | null
    hintConcepts: string[]
    attempts: number
    targets: { id: string; name: string; statement: string }[]
    engine?: EngineChoice
  }
): Promise<PracticeGradeItem[]> {
  const targets = [...new Map(input.targets.map((target) => [target.id, target])).values()]
  const prompt = `Valuta separatamente l'esito di Andrea per ciascun concetto bersaglio. Non vedere né usare la trascrizione degli scambi precedenti: hai solo la risposta finale riportata qui.
- "corretto" se la risposta dimostra correttamente il concetto.
- "errore_qui" se la risposta mostra un errore localizzabile; classificalo in miss: cue, discrimination, execution, careless o structural.
- "non_attribuibile" se la risposta non dà evidenza sufficiente per giudicare quel concetto.
- Restituisci un elemento per ogni conceptId, senza inventarne. Una risposta finale corretta non annulla errori espliciti su altri concetti.
${GRADING_RIGOR}
Rispondi solo con JSON: {"items":[{"conceptId":"...","state":"corretto|errore_qui|non_attribuibile","miss":"execution"}]}

PROBLEMA\n${input.statement}
SOLUZIONE DI RIFERIMENTO\n${input.modelSolution}
RISPOSTA FINALE DI ANDREA\n${input.finalAnswer || '(nessuna risposta)'}
TENTATIVI: ${input.attempts}; GRADINO MASSIMO: ${input.maxRung ?? 'nessuno'}
CONCETTI INDICATI DAGLI INDIZI: ${JSON.stringify(input.hintConcepts)}
BERSAGLI\n${targets.map((t) => `${t.id} | ${t.name} | ${t.statement}`).join('\n')}`
  const result = await bridge.ask({ task: 'grade', priority: 'background', cache: false, schema: ReplySchema, prompt, engine: input.engine })
  const byId = new Map((result.data as z.infer<typeof ReplySchema>).items.map((item) => [item.conceptId, item]))
  return targets.map((target) => byId.get(target.id) ?? { conceptId: target.id, state: 'non_attribuibile' as const })
}

export type PracticeOutcome = NonNullable<PracticeTurn['conclude']>['outcome']
