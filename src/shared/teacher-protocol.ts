import { z } from 'zod'

export const ROLES = ['goal', 'probe', 'plan', 'predict', 'check', 'recall'] as const
export const ROLE_IT: Record<(typeof ROLES)[number], string> = {
  goal: 'obiettivo',
  probe: 'misura',
  plan: 'piano',
  predict: 'previsione',
  check: 'verifica',
  recall: 'svuota la testa'
}

const BlockSchema = z.object({ type: z.literal('text'), md: z.string() })
const PlanNodeSchema = z.object({ id: z.string().min(1), title: z.string().min(1), status: z.enum(['known', 'todo', 'goal']) })
// Edges are [from, to] pairs; plain 2-item arrays keep the JSON Schema simple for the CLI.
const Edge = z.array(z.string()).min(2).max(2) as unknown as z.ZodType<[string, string]>
const PlanSchema = z.object({ nodes: z.array(PlanNodeSchema).min(1), edges: z.array(Edge) })
/** Mini-games: short retrieval or discrimination tasks the tutor can use instead of a plain check. */
export const GameSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('speed'), items: z.array(z.object({ statement: z.string().min(1), true: z.boolean(), why: z.string() })).min(3).max(10) }),
  z.object({ type: z.literal('match'), pairs: z.array(z.array(z.string().min(1)).min(2).max(2)).min(2).max(8) }),
  z.object({ type: z.literal('order'), steps: z.array(z.string().min(1)).min(3).max(8) }),
  z.object({ type: z.literal('spot'), lines: z.array(z.string().min(1)).min(2).max(10), wrong: z.number().int(), why: z.string() }),
  z.object({ type: z.literal('taboo'), concept: z.string().min(1), forbidden: z.array(z.string().min(1)).min(2).max(8) })
])
export type Game = z.infer<typeof GameSchema>
export const GAME_IT: Record<Game['type'], string> = { speed: 'Lampo', match: 'Coppie', order: 'Ricomponi', spot: "Trova l'intruso", taboo: 'Tabù' }

const QuestionSchema = z.object({
  id: z.string().min(1),
  role: z.enum(ROLES),
  kind: z.enum(['choice', 'open', 'game']),
  prompt: z.string().min(1),
  options: z.array(z.string()).optional(),
  correct: z.number().int().optional(),
  why: z.array(z.string()).optional(),
  nodeId: z.string().optional(),
  game: GameSchema.optional()
})
const SummarySchema = z.object({ learned: z.array(z.string()), shaky: z.array(z.string()), misconceptions: z.array(z.string()) })

// Structural shape: what the CLI is asked to produce.
const TurnShape = z.object({
  phase: z.enum(['probe', 'plan', 'teach', 'consolidate', 'done']),
  blocks: z.array(BlockSchema),
  plan: PlanSchema.optional(),
  question: QuestionSchema.optional(),
  summary: SummarySchema.optional()
})

// Full validation: the rules a turn must satisfy before the UI ever sees it.
export const TeacherTurnSchema = TurnShape.superRefine((t, ctx) => {
  const q = t.question
  if (q?.kind === 'choice') {
    const n = q.options?.length ?? 0
    if (n < 2 || n > 6) ctx.addIssue({ code: 'custom', message: 'una domanda a scelta ha da 2 a 6 opzioni' })
    if (q.role !== 'goal' && q.role !== 'plan') {
      if (q.correct === undefined || q.correct < 0 || q.correct >= n) ctx.addIssue({ code: 'custom', message: '"correct" deve indicare una delle opzioni' })
      if (q.why?.length !== n) ctx.addIssue({ code: 'custom', message: '"why" deve avere una spiegazione per ogni opzione' })
    }
  }
  if (q?.kind === 'open' && q.options?.length) ctx.addIssue({ code: 'custom', message: 'una domanda aperta non ha opzioni' })
  if (q?.kind === 'game') {
    const g = q.game
    if (!g) ctx.addIssue({ code: 'custom', message: 'una domanda "game" ha bisogno di "game"' })
    else if (g.type === 'order' && new Set(g.steps).size !== g.steps.length) ctx.addIssue({ code: 'custom', message: 'i passi da riordinare devono essere diversi' })
    else if (g.type === 'match' && new Set(g.pairs.map((p) => p[0])).size !== g.pairs.length) ctx.addIssue({ code: 'custom', message: 'le coppie devono avere voci diverse' })
    else if (g.type === 'spot' && (g.wrong < 0 || g.wrong >= g.lines.length)) ctx.addIssue({ code: 'custom', message: '"wrong" deve indicare una delle righe' })
  }
  if (t.plan) {
    const ids = new Set(t.plan.nodes.map((n) => n.id))
    if (t.plan.edges.some(([a, b]) => !ids.has(a) || !ids.has(b))) ctx.addIssue({ code: 'custom', message: 'un arco del piano punta a un nodo inesistente' })
  }
  if (t.phase === 'done' && (!t.summary || q)) ctx.addIssue({ code: 'custom', message: 'la fase "done" richiede "summary" e nessuna domanda' })
})

export type Block = z.infer<typeof BlockSchema>
export type PlanNode = z.infer<typeof PlanNodeSchema>
export type Plan = z.infer<typeof PlanSchema>
export type Question = z.infer<typeof QuestionSchema>
export type TeacherTurn = z.infer<typeof TurnShape>

/** JSON Schema 2020-12 without the "$schema" key (the Claude CLI rejects the remote reference). */
export function teacherJsonSchema(): object {
  const { $schema: _drop, ...rest } = z.toJSONSchema(TurnShape) as Record<string, unknown>
  return rest
}

export const LearnerAnswerSchema = z.object({
  questionId: z.string().min(1).max(100),
  choice: z.number().int().min(0).max(5).optional(),
  dontKnow: z.boolean().optional(),
  confidence: z.number().int().min(0).max(100).optional(),
  text: z.string().max(5000).optional(),
  thoughts: z.string().max(5000).optional(),
  game: z.object({ score: z.number().int().min(0).max(100), total: z.number().int().min(0).max(100), detail: z.string().max(5000) }).optional()
})
export type LearnerAnswer = z.infer<typeof LearnerAnswerSchema>

const LETTERS = 'ABCDEF'

/** The learner's answer as the teacher reads it (Italian, one line). */
export function formatLearnerReply(q: Question, a: LearnerAnswer): string {
  const parts: string[] = []
  const head = `Risposta alla domanda ${q.id} (${ROLE_IT[q.role]}): `
  if (q.kind === 'game' && a.game && q.game) {
    const res = a.game.total ? `${a.game.score}/${a.game.total}${a.game.detail ? ` — ${a.game.detail}` : ''}` : a.game.detail
    return `${head}gioco «${GAME_IT[q.game.type]}» — ${res}`
  }
  if (a.dontKnow) parts.push(head + 'Non lo so')
  else if (q.kind === 'choice' && a.choice !== undefined) {
    let s = `${head}${LETTERS[a.choice]} «${q.options?.[a.choice] ?? ''}»`
    if (q.correct !== undefined) s += a.choice === q.correct ? ' — corretta' : ` — sbagliata (giusta: ${LETTERS[q.correct]})`
    parts.push(s)
  } else parts.push(`${head}«${a.text ?? ''}»`)
  if (!a.dontKnow && a.confidence !== undefined) parts.push(`fiducia ${a.confidence}%`)
  if (q.kind === 'choice' && a.text) parts.push(`ragionamento: ${a.text}`)
  if (a.thoughts) parts.push(`pensieri durante la lettura: ${a.thoughts}`)
  return parts.join(' — ')
}
