import { z } from 'zod'

export const PRACTICE_MODES = ['recall', 'discrimination', 'composition'] as const
export const MODE_IT: Record<(typeof PRACTICE_MODES)[number], string> = { recall: 'richiamo', discrimination: 'distinzione', composition: 'composizione' }
export const OUTCOMES = ['solved', 'solved_hints', 'surrendered'] as const
export const OUTCOME_IT: Record<(typeof OUTCOMES)[number], string> = { solved: 'Risolto', solved_hints: 'Risolto con aiuti', surrendered: 'Arreso' }
export const MISSES = ['cue', 'discrimination', 'execution', 'careless', 'structural'] as const

const BlockSchema = z.object({ type: z.literal('text'), md: z.string() })
export const ProblemSchema = z.object({
  id: z.string().min(1),
  /** What Andrea sees: markdown + LaTeX. Never names the target. */
  statement: z.string().min(1),
  mode: z.enum(PRACTICE_MODES),
  /** Concept ids from the material; empty when the material is a free topic. */
  targets: z.array(z.string()),
  /** The tutor's own worked solution, fixed before posing; hidden until the problem is concluded. */
  modelSolution: z.string().min(1),
  /** Spot-the-error problems: the lines Andrea can pick from. */
  lines: z.array(z.string()).optional()
})
export type Problem = z.infer<typeof ProblemSchema>

const TurnShape = z.object({
  phase: z.enum(['warmup', 'body', 'retest', 'done']),
  blocks: z.array(BlockSchema),
  problem: ProblemSchema.optional(),
  hint: z.object({ rung: z.number().int(), md: z.string().min(1) }).optional(),
  conclude: z.object({ outcome: z.enum(OUTCOMES), verdict: z.string(), miss: z.enum(MISSES).optional(), retest: z.boolean() }).optional(),
  summary: z.object({ solved: z.array(z.string()), retest: z.array(z.string()), note: z.string() }).optional()
})
export type PracticeTurn = z.infer<typeof TurnShape>

export const PracticeTurnSchema = TurnShape.superRefine((t, ctx) => {
  const actions = [t.problem, t.hint, t.conclude].filter(Boolean).length
  if (actions > 1) ctx.addIssue({ code: 'custom', message: 'un turno fa al massimo una cosa: problem, hint oppure conclude' })
  if (t.hint && (t.hint.rung < 0 || t.hint.rung > 5)) ctx.addIssue({ code: 'custom', message: 'i gradini degli indizi vanno da 0 a 5' })
  if (t.summary && t.phase !== 'done') ctx.addIssue({ code: 'custom', message: '"summary" solo con la fase "done"' })
  if (t.phase === 'done' && !t.summary) ctx.addIssue({ code: 'custom', message: 'la fase "done" richiede "summary"' })
  if (t.problem?.lines && t.problem.lines.length < 2) ctx.addIssue({ code: 'custom', message: '"lines" ha almeno due righe' })
})

/** The rules a turn must also satisfy against the session so far and what Andrea just asked. null when fine. */
export function checkTurnAgainst(state: { active?: string; problems?: { id: string }[] }, t: PracticeTurn, asked?: Submission['kind']): string | null {
  if (t.problem && state.active) return `c'è già un problema aperto (${state.active}): concludilo prima di proporne un altro`
  if (t.problem && state.problems?.some((p) => p.id === t.problem!.id)) return `l'id "${t.problem.id}" è già stato usato: dai al problema un id nuovo`
  if ((t.conclude || t.hint) && !state.active) return 'non c\'è nessun problema aperto: proponi un problema con "problem"'
  if (asked === 'dismiss' && !t.conclude) return 'Andrea ha lasciato il problema: concludi con "conclude" e outcome "surrendered"'
  if ((asked === 'start' || asked === 'next') && !t.problem && t.phase !== 'done') return 'Andrea aspetta il prossimo problema: proponilo con "problem" (oppure chiudi con "done")'
  if (asked === 'end' && t.phase !== 'done') return 'Andrea ha chiuso la sessione: rispondi con phase "done" e "summary"'
  return null
}

export function practiceJsonSchema(): object {
  const { $schema: _drop, ...rest } = z.toJSONSchema(TurnShape) as Record<string, unknown>
  void _drop
  return rest
}

export const SubmissionSchema = z.object({
  kind: z.enum(['start', 'thinking', 'hint', 'next', 'ask', 'dismiss', 'end']),
  text: z.string().max(20_000).optional(),
  line: z.number().int().min(0).max(50).optional(),
  photoText: z.string().max(20_000).optional()
})
export type Submission = z.infer<typeof SubmissionSchema>

/** What Andrea sent, as the tutor reads it. */
export function formatSubmission(s: Submission, problem?: Pick<Problem, 'lines'>): string {
  switch (s.kind) {
    case 'hint':
      return 'Mi serve un indizio.'
    case 'next':
      return 'Prossimo problema.'
    case 'ask':
      return `Domanda sul problema appena concluso: ${s.text ?? ''}`
    case 'dismiss':
      return 'Lascio questo problema: mostrami la soluzione.'
    case 'end':
      return 'Basta così per oggi: chiudi la sessione.'
    case 'start':
      return s.text ?? ''
    case 'thinking': {
      const parts: string[] = []
      if (s.line !== undefined) parts.push(`Riga scelta: ${s.line + 1} «${problem?.lines?.[s.line] ?? ''}»`)
      if (s.text?.trim()) parts.push(`Il mio ragionamento: ${s.text.trim()}`)
      if (s.photoText?.trim()) parts.push(`Dal foglio fotografato:\n${s.photoText.trim()}`)
      return parts.join('\n')
    }
  }
}
