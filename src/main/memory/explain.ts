import { z } from 'zod'
import type { Exercise } from '../../shared/exercise-schema'
import { GRADING_RIGOR } from '../ai/rigor'
import { capNote } from '../session/prompt'

/** Clarifying questions the picky student may ask before the verdict. */
export const MAX_QUESTIONS = 2
export const EXPLAIN_MARK = 'STUDENTE PIGNOLO'

export type ExplainTurn = { by: 'andrea' | 'claude'; text: string }

const Ask = z.object({ action: z.literal('ask'), question: z.string().trim().min(1).max(500) })
const Judge = z.object({ action: z.literal('grade'), verdict: z.enum(['ok', 'partial', 'wrong']), feedback: z.string().trim().min(1).max(900) })
export type ExplainReply = z.infer<typeof Ask> | z.infer<typeof Judge>

/** Once the questions are used up only a verdict passes: an extra question is a schema error and gets one retry. */
export const explainReplySchema = (canAsk: boolean): z.ZodType<ExplainReply> => (canAsk ? z.discriminatedUnion('action', [Ask, Judge]) : Judge)

export const questionsAsked = (turns: ExplainTurn[]): number => turns.filter((t) => t.by === 'claude').length

/** Claude as the picky classmate: checks Andrea's closed-book explanation against the note, step by step. */
export function buildExplainPrompt(input: {
  concept: { name: string; statement: string }
  exercise: Extract<Exercise, { type: 'explain' }>
  noteTitle: string
  noteText: string
  turns: ExplainTurn[]
  confidence: number
}): string {
  const asked = questionsAsked(input.turns)
  const canAsk = asked < MAX_QUESTIONS
  return [
    `Nel ripasso di Sinapsi fai lo ${EXPLAIN_MARK}. Andrea (Scienze matematiche per l'IA) ha chiuso il libro e ti spiega un concetto o ricostruisce una dimostrazione, a voce (trascritta in automatico) o per iscritto. Sei un compagno di corso che non si fida: segui il ragionamento un passaggio alla volta e ti fermi al primo che non torna. Voce asciutta: niente lodi, niente "ottimo".`,
    `Concetto: ${input.concept.name} — ${input.concept.statement}
Consegna: ${input.exercise.prompt}
Passaggi chiave di riferimento: ${input.exercise.answer}
Fiducia dichiarata da Andrea: ${input.confidence}%`,
    `COME CORREGGI
- Il riferimento è la nota di Andrea qui sotto (definizioni, ipotesi, ordine dei passaggi), insieme ai passaggi chiave.
- Cerca il PRIMO passaggio mancante, sbagliato o non giustificato: un'ipotesi non detta, un passaggio saltato, una definizione imprecisa, una conclusione che non segue.
- Se ha parlato, ignora gli errori evidenti di trascrizione (parole storpiate, formule dette a parole): giudica il contenuto, non la forma.
- ${
      canAsk
        ? `Puoi fare al massimo ${MAX_QUESTIONS} domande di chiarimento in tutto (finora ${asked}). Chiedi solo se la risposta può mostrare che Andrea conosce il passaggio ma non l'ha detto o l'ha detto in modo ambiguo. Una domanda per volta, breve, puntata sul primo passaggio che manca, senza suggerire la risposta (non "Lì usi Rolle, giusto?", ma "Che cosa ti permette quel passaggio?"). Se l'errore è chiaro, non chiedere: dai l'esito.`
        : `Hai già fatto ${asked} domande: adesso dai l'esito, senza altre domande.`
    }
- Esito: "ok" se la spiegazione, con le risposte alle tue domande, copre tutti i passaggi essenziali in modo corretto e giustificato; "partial" se l'idea è giusta ma un passaggio essenziale manca o resta vago (anche se lo ha recuperato solo dopo una tua domanda); "wrong" se c'è un errore o manca il cuore del ragionamento.
- In "feedback" al massimo quattro frasi: il primo passaggio mancante o sbagliato, citato con precisione, e com'è nella nota; se l'esito è "ok", il punto più fragile. Matematica in $…$.`,
    GRADING_RIGOR,
    `NOTA DI ANDREA «${input.noteTitle}»\n\n${capNote(input.noteText)}`,
    `DIALOGO\n${input.turns.map((t) => (t.by === 'andrea' ? `Andrea: ${t.text}` : `Tu (domanda): ${t.text}`)).join('\n\n')}`,
    `Non usare strumenti né file. Rispondi solo con JSON: ${canAsk ? '{ "action": "ask", "question": "…" } oppure ' : ''}{ "action": "grade", "verdict": "ok" | "partial" | "wrong", "feedback": "…" }`
  ].join('\n\n---\n\n')
}
