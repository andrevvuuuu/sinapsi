import { z } from 'zod'
import type { Exercise } from '../../shared/exercise-schema'

export const GradeSchema = z.object({ verdict: z.enum(['ok', 'partial', 'wrong']), feedback: z.string().trim().min(1).max(600) })
export type GradeReply = z.infer<typeof GradeSchema>

/** Claude corrects one open answer against the reference, in the tutor's dry voice. */
export function buildGradePrompt(input: { concept: { name: string; statement: string }; exercise: Exercise; answer: string; confidence: number }): string {
  return [
    `Correggi una risposta di ripasso di Andrea (Scienze matematiche per l'IA). Voce asciutta: niente lodi, niente "ottimo"; se è sbagliata dillo chiaramente.`,
    `Concetto: ${input.concept.name} — ${input.concept.statement}`,
    `Domanda: ${input.exercise.prompt}`,
    `Risposta di riferimento: ${input.exercise.answer}`,
    `Risposta di Andrea (fiducia ${input.confidence}%): ${input.answer}`,
    `Giudica il contenuto, non la forma: "ok" se coglie il punto essenziale della risposta di riferimento, "partial" se è giusta ma incompleta o manca il perché, "wrong" se è sbagliata o non risponde. In "feedback" una o due frasi: che cosa manca o che cosa è sbagliato, e il punto chiave. Matematica in $…$.`,
    `Rispondi solo con JSON: { "verdict": "ok" | "partial" | "wrong", "feedback": "…" }`
  ].join('\n\n')
}
