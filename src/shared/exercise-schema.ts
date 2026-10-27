import { z } from 'zod'
import { compileExpr } from './expr'
import { FigureSchema } from './nota-schema'

/**
 * Review exercises: each tests one concept from a different angle (richiamo, distinzione,
 * composizione). Everything but `open` is graded in the app; `open` is graded by Claude.
 */
const base = { prompt: z.string().trim().min(1), answer: z.string().trim().min(1) }
const choice = z.array(z.string().trim().min(1)).min(2).max(6)
const distinct = (xs: string[]): boolean => new Set(xs.map((x) => x.trim().toLowerCase())).size === xs.length

/** Every {{…}} group needs exactly one option marked with *, and there must be at least one group. */
export const blanks = (text: string): { options: string[]; correct: number }[] =>
  [...text.matchAll(/\{\{([^{}]+)\}\}/g)].map((m) => {
    const raw = m[1].split('|').map((s) => s.trim())
    return { options: raw.map((s) => s.replace(/^\*/, '')), correct: raw.findIndex((s) => s.startsWith('*')) }
  })
const fillOk = (text: string): boolean => {
  const groups = [...text.matchAll(/\{\{([^{}]+)\}\}/g)].map((m) => m[1].split('|').filter((s) => s.trim().startsWith('*')).length)
  return groups.length > 0 && groups.every((n) => n === 1)
}

export const ExerciseSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('open'), ...base }),
  z.object({ type: z.literal('mc'), ...base, options: choice, correct: z.number().int() }).refine((e) => e.correct >= 0 && e.correct < e.options.length, 'correct fuori intervallo'),
  z.object({ type: z.literal('truefalse'), ...base, statement: z.string().trim().min(1), value: z.boolean() }),
  z.object({ type: z.literal('order'), ...base, steps: z.array(z.string().trim().min(1)).min(3).max(8) }).refine((e) => distinct(e.steps), 'passi ripetuti'),
  z.object({ type: z.literal('fill'), ...base, text: z.string().min(1) }).refine((e) => fillOk(e.text), 'scelte non valide'),
  z.object({ type: z.literal('match'), ...base, pairs: z.array(z.tuple([z.string().trim().min(1), z.string().trim().min(1)])).min(2).max(6) }).refine((e) => distinct(e.pairs.map((p) => p[0])) && distinct(e.pairs.map((p) => p[1])), 'coppie ripetute'),
  z.object({ type: z.literal('counterexample'), ...base, options: choice, correct: z.number().int() }).refine((e) => e.correct >= 0 && e.correct < e.options.length, 'correct fuori intervallo'),
  z.object({ type: z.literal('estimate'), ...base, value: z.number().finite(), tolerance: z.number().finite().nonnegative(), unit: z.string().optional() }),
  z.object({ type: z.literal('spoterror'), ...base, steps: z.array(z.string().trim().min(1)).min(3).max(8), wrong: z.number().int(), why: z.string().trim().min(1) }).refine((e) => e.wrong >= 0 && e.wrong < e.steps.length, 'passo sbagliato fuori intervallo'),
  z
    .object({ type: z.literal('graph'), ...base, figure: FigureSchema, param: z.string().min(1), target: z.string().min(1) })
    .superRefine((e, ctx) => {
      const params = e.figure.params.map((p) => p.id)
      if (!params.includes(e.param)) ctx.addIssue({ code: 'custom', message: `parametro sconosciuto «${e.param}»` })
      try {
        compileExpr(e.target, { vars: ['x', ...params], fns: Object.keys(e.figure.functions) })
      } catch (err) {
        ctx.addIssue({ code: 'custom', message: `obiettivo: ${(err as Error).message}` })
      }
    })
])
export type Exercise = z.infer<typeof ExerciseSchema>
export type VariantLine = { id: string; conceptId: string; at: number; exercise: Exercise }
export const VariantLineSchema = z.object({ id: z.string(), conceptId: z.string(), at: z.number(), exercise: ExerciseSchema })
