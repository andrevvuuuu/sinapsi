import { z } from 'zod'
import type { Bridge } from '../ai/bridge'
import type { EngineChoice } from '../../shared/settings-schema'
import { GRADING_RIGOR } from '../ai/rigor'

const OpenGradeSchema = z.object({
  verdict: z.enum(['correct', 'partial', 'incorrect']),
  hintsUsed: z.number().int().min(0),
  reason: z.string().trim().min(1).max(600)
})
export type OpenGrade = z.infer<typeof OpenGradeSchema>

export async function gradeOpenAnswer(
  bridge: Pick<Bridge, 'ask'>,
  input: {
    question: string
    answerText: string
    reference: string
    engine?: EngineChoice
  }
): Promise<OpenGrade> {
  const prompt = [
    GRADING_RIGOR,
    `Domanda: ${input.question}`,
    `Risposta dello studente: ${input.answerText}`,
    `RIFERIMENTO:\n${input.reference}`,
    'Valuta solo rispetto al riferimento. correct se il punto essenziale e il ragionamento sono corretti, partial se incompleto, incorrect se errato o non risponde. hintsUsed è 0 salvo che la risposta dichiari esplicitamente un aiuto ricevuto. Il correttore non conosce la conversazione.',
    'Restituisci JSON: {"verdict":"correct|partial|incorrect","hintsUsed":0,"reason":"…"}'
  ].join('\n\n')
  const result = await bridge.ask<OpenGrade>({
    task: 'grade',
    prompt,
    schema: OpenGradeSchema,
    cache: false,
    priority: 'interactive',
    ...(input.engine ? { engine: input.engine } : {})
  })
  return OpenGradeSchema.parse(result.data)
}

const ChoiceValidationSchema = z.array(z.object({ questionId: z.string(), ok: z.boolean() }))
export async function validateChoices(
  bridge: Pick<Bridge, 'ask'>,
  items: { questionId: string; question: string; correct: string; reference: string }[],
  engine?: EngineChoice
): Promise<{ questionId: string; ok: boolean }[]> {
  if (!items.length) return []
  const prompt = [
    GRADING_RIGOR,
    'Controlla in un unico passaggio che ogni risposta indicata come corretta sia implicata dal riferimento. Non valutare lo studente.',
    JSON.stringify(items),
    'Restituisci un array JSON con un oggetto per ogni questionId: {"questionId":"…","ok":true|false}.'
  ].join('\n\n')
  const result = await bridge.ask<{ questionId: string; ok: boolean }[]>({
    task: 'grade',
    prompt,
    schema: ChoiceValidationSchema,
    cache: false,
    priority: 'background',
    ...(engine ? { engine } : {})
  })
  return ChoiceValidationSchema.parse(result.data)
}
