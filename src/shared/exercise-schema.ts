import { z } from 'zod'
import { compileExpr } from './expr'
import { FigureSchema } from './nota-schema'

/**
 * Review exercises: each tests one concept from a different angle (richiamo, distinzione,
 * composizione). Everything but `open` and `explain` is graded in the app; those two are graded by Claude.
 * `explain` (Spiegalo tu): Andrea explains a concept or rebuilds a proof with the book closed; `answer` holds
 * the key steps in the note's order.
 */
const base = { prompt: z.string().trim().min(1), answer: z.string().trim().min(1) }
const choice = z.array(z.string().trim().min(1)).min(2).max(6)
const distinct = (xs: string[]): boolean => new Set(xs.map((x) => x.trim().toLowerCase())).size === xs.length

/** Every {{…}} group needs exactly one option marked with *, and there must be at least one group. */
export type BlankSpan = { start: number; end: number; options: string[]; correct: number; starred: number }

/** Splits on | outside $…$, so |x| inside a formula stays one option. */
function splitOptions(s: string): string[] {
  const out: string[] = []
  let cur = ''
  let math = false
  for (const c of s) {
    if (c === '$') math = !math
    if (c === '|' && !math) {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out.map((x) => x.trim())
}

/**
 * The {{a|*b|c}} blanks of a text. Braces inside a choice (\frac{1}{2}) are balanced, so a formula
 * never ends the blank early; end is the index after the closing "}}".
 */
export function blankSpans(text: string): BlankSpan[] {
  const out: BlankSpan[] = []
  for (let i = text.indexOf('{{'); i >= 0; i = text.indexOf('{{', i)) {
    let depth = 0
    let j = i + 2
    for (; j < text.length; j++) {
      const c = text[j]
      if (c === '{') depth++
      else if (c === '}') {
        if (depth > 0) depth--
        else if (text[j + 1] === '}') break
      }
    }
    if (j >= text.length) break
    const raw = splitOptions(text.slice(i + 2, j))
    out.push({ start: i, end: j + 2, options: raw.map((s) => s.replace(/^\*/, '')), correct: raw.findIndex((s) => s.startsWith('*')), starred: raw.filter((s) => s.startsWith('*')).length })
    i = j + 2
  }
  return out
}
/** The text around the blanks: one more piece than there are blanks. */
export function blankParts(text: string): string[] {
  const parts: string[] = []
  let last = 0
  for (const b of blankSpans(text)) {
    parts.push(text.slice(last, b.start))
    last = b.end
  }
  parts.push(text.slice(last))
  return parts
}
export const blanks = (text: string): { options: string[]; correct: number }[] => blankSpans(text).map(({ options, correct }) => ({ options, correct }))
const fillOk = (text: string): boolean => {
  const groups = blankSpans(text)
  return groups.length > 0 && groups.every((g) => g.starred === 1)
}

export const ExerciseSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('open'), ...base }),
  z.object({ type: z.literal('explain'), ...base }),
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
