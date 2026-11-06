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

/** The $ delimiters of a piece of text, $$ as one display delimiter, \\$ as none. */
type Dollar = { at: number; len: 1 | 2 }
function dollarsAt(s: string): Dollar[] {
  const out: Dollar[] = []
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\') i++
    else if (s[i] === '$') {
      const len = s[i + 1] === '$' ? 2 : 1
      out.push({ at: i, len })
      i += len - 1
    }
  }
  return out
}

/** The delimiter around the math, spaces kept outside: "$f(1) = " closes as "$f(1) =$ ", which renderMd reads as math. */
function mathOf(s: string, d: string): string {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s)!
  return m[2] ? `${m[1]}${d}${m[2]}${d}${m[3]}` : s
}

export type ClozeBlank = { options: string[]; correct: number; math: boolean }
export type Cloze = { parts: string[]; blanks: ClozeBlank[] }

/**
 * The parts of a cloze text ready to render on their own: the model often puts the blanks inside a formula
 * («$f(1) = {{ -2 | *0 | 1 }}$») and forgets the closing $, so the pieces around the blanks would show raw
 * «$f(1) =» or «\\frac{…}». Here the math is balanced across the pieces: a piece that opens $ (or $$) without
 * closing it is closed at its end and reopened where the formula continues after the blank. A formula still open
 * at the end closes after the last blank; only a final $ with no blank after it, never closed, is dropped.
 * Options of a blank inside a formula become formulas themselves.
 */
export function clozeParts(text: string): Cloze {
  const spans = blankSpans(text)
  const raw = blankParts(text)
  const marks = raw.map(dollarsAt)
  // The delimiter of the formula open at the start and at the end of each piece ('' when none is open).
  const startsIn: string[] = []
  const endsIn: string[] = []
  let open = ''
  raw.forEach((piece, i) => {
    // "{{…}} $y$": a $ after a space opens a new formula; the one left open before the blank ends at the blank.
    if (open && /^\s+\$/.test(piece)) open = ''
    startsIn.push(open)
    for (const d of marks[i]) open = open ? '' : d.len === 2 ? '$$' : '$'
    endsIn.push(open)
  })
  let drop: [number, Dollar] | null = null
  if (open) {
    const lastPiece = marks.findLastIndex((m) => m.length > 0)
    if (lastPiece === raw.length - 1 && !startsIn[lastPiece]) {
      // A truly unmatched final $: nothing after it to close.
      drop = [lastPiece, marks[lastPiece][marks[lastPiece].length - 1]]
      endsIn[lastPiece] = ''
    } else {
      // The closing $ the model forgot: the formula ends right after the last blank.
      startsIn[raw.length - 1] = ''
      endsIn[raw.length - 1] = ''
    }
  }
  const parts = raw.map((piece, i) => {
    let s = piece
    if (drop && drop[0] === i) s = s.slice(0, drop[1].at) + s.slice(drop[1].at + drop[1].len)
    const m = dollarsAt(s)
    let head = ''
    let body = s
    // A formula carried over from the previous blank: it continues up to this piece's first $.
    if (startsIn[i]) {
      const cut = m.length ? m[0].at : s.length
      head = mathOf(s.slice(0, cut), startsIn[i])
      body = m.length ? s.slice(cut + m[0].len) : ''
    }
    // A formula still open at the end: close it before the blank.
    if (endsIn[i] && (!startsIn[i] || m.length)) {
      const bm = dollarsAt(body)
      const last = bm[bm.length - 1]
      body = body.slice(0, last.at) + mathOf(body.slice(last.at + last.len), endsIn[i])
    }
    return head + body
  })
  const blanks = spans.map((b, i) => {
    const math = !!endsIn[i]
    return { options: b.options.map((o) => (math && !o.includes('$') ? `$${o}$` : o)), correct: b.correct, math }
  })
  return { parts, blanks }
}

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
