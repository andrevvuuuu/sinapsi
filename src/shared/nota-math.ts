import { clozeParts } from './exercise-schema'
import { plainMathIssues } from './math-text'
import { NotaSchema, type Nota } from './nota-schema'

/** Fields that are not text for the reader: figure expressions, ids, enums, and LaTeX-only fields read with asMath. */
const NOT_TEXT = new Set(['functions', 'fn', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'slope', 'greenWhen', 'expr', 'param', 'at', 'drag', 'id', 'kind', 'type', 'color', 'level', 'num', 'tex', 'formal', 'symbol', 'elements', 'stepParams'])

/**
 * The math problems of a freshly written nota viva, as "path: problem" lines: formulas outside $…$, unbalanced $,
 * and cloze blanks written inside a formula. The renderer copes with all of them (math-text.ts, clozeParts), but a
 * note sent back once comes out clean everywhere, the Obsidian copy and the review exercises included.
 */
export function notaMathIssues(nota: Nota): string[] {
  const out: string[] = []
  const walk = (v: unknown, path: string, cloze: boolean): void => {
    if (typeof v === 'string') {
      for (const issue of plainMathIssues(v)) out.push(`${path}: ${issue}`)
      if (cloze && clozeParts(v).blanks.some((b) => b.math)) out.push(`${path}: una scelta {{…}} dentro $…$`)
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`, cloze))
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      for (const [k, x] of Object.entries(o)) if (!NOT_TEXT.has(k)) walk(x, path ? `${path}.${k}` : k, k === 'steps' && o.type === 'exercise' && o.level === 'completa')
    }
  }
  walk(nota, '', false)
  return out
}

const SHOWN = 12

/** NotaSchema plus the math check: what the note writer's answer is validated with, so the bridge's retry fixes the math. */
export const NotaWriteSchema = NotaSchema.superRefine((r, ctx) => {
  const issues = notaMathIssues(r.nota)
  if (!issues.length) return
  ctx.addIssue({
    code: 'custom',
    message: `matematica da sistemare (${issues.length}): ${issues.slice(0, SHOWN).join('; ')}${issues.length > SHOWN ? '; …' : ''}. Ogni formula, anche nei titoli e nelle etichette, va tra $…$; nelle scelte {{…}} chiudi $ prima della scelta e riaprilo dopo`
  })
})
