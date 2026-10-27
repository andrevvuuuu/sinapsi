import { z } from 'zod'
import { compileExpr } from './expr'

/**
 * The nota viva format. Gemini writes it as JSON (described to it by NOTA_FORMAT); the app parses it
 * leniently: each block is validated on its own, so one bad block never costs the whole note.
 */

const str = z.string().min(1)
const md = z.string()
const expr = z.string().min(1)
const Color = z.enum(['accent', 'good', 'warn', 'bad', 'muted', 'ink'])
const range = z.tuple([z.number(), z.number()]).refine(([a, b]) => a < b, 'intervallo vuoto')

const common = { color: Color.optional(), greenWhen: expr.optional(), steps: z.array(z.number().int().min(0)).optional() }
const FigElement = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('curve'), fn: str, label: z.string().optional(), dashed: z.boolean().optional(), ...common }),
  z.object({ kind: z.literal('point'), x: expr, y: expr, label: z.string().optional(), drag: str.optional(), ...common }),
  z.object({ kind: z.literal('segment'), x1: expr, y1: expr, x2: expr, y2: expr, dashed: z.boolean().optional(), ...common }),
  z.object({ kind: z.literal('line'), x: expr, y: expr, slope: expr, dashed: z.boolean().optional(), ...common }),
  z.object({ kind: z.literal('vline'), x: expr, dashed: z.boolean().optional(), ...common }),
  z.object({ kind: z.literal('hline'), y: expr, dashed: z.boolean().optional(), ...common }),
  z.object({ kind: z.literal('label'), x: expr, y: expr, text: str, ...common })
])
const FigParam = z
  .object({ id: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), label: str, min: z.number(), max: z.number(), step: z.number().positive(), value: z.number() })
  .refine((p) => p.min < p.max && p.value >= p.min && p.value <= p.max, 'parametro fuori intervallo')

const FigureBase = z.object({
  type: z.literal('figure'),
  title: str,
  caption: md.optional(),
  x: range,
  y: range,
  functions: z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), expr),
  params: z.array(FigParam).max(3).default([]),
  elements: z.array(FigElement).min(1),
  readouts: z.array(z.object({ label: str, expr })).optional(),
  points: z.object({ label: str, param: str, expr, at: str.optional() }).optional(),
  stepParams: z.array(z.record(z.string(), z.number())).optional()
})

const RESERVED = new Set(['x', 'pi', 'e', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'exp', 'ln', 'log', 'sqrt', 'abs', 'sign', 'floor', 'min', 'max'])

/** Every expression must compile against the figure's own names; every reference must resolve. */
function checkFigure(f: z.infer<typeof FigureBase>, ctx: z.RefinementCtx): void {
  const fns = Object.keys(f.functions)
  const params = f.params.map((p) => p.id)
  const fail = (message: string): void => ctx.addIssue({ code: 'custom', message })
  for (const n of [...fns, ...params]) if (RESERVED.has(n)) fail(`nome riservato «${n}»`)
  const known = { vars: ['x', ...params], fns }
  const tryCompile = (src: string, vars = known.vars): void => {
    try {
      compileExpr(src, { vars, fns })
    } catch (e) {
      fail(`espressione «${src}»: ${(e as Error).message}`)
    }
  }
  // Functions calling each other in a cycle would recurse forever when drawn.
  const calls = (body: string): string[] => fns.filter((n) => new RegExp(`(^|[^A-Za-z0-9_])${n}'?\\s*\\(`).test(body))
  const state = new Map<string, 'open' | 'done'>()
  const cyclic = (n: string): boolean => {
    if (state.get(n) === 'open') return true
    if (state.get(n) === 'done') return false
    state.set(n, 'open')
    const found = calls(f.functions[n]).some(cyclic)
    state.set(n, 'done')
    return found
  }
  if (fns.some(cyclic)) fail('funzioni che si chiamano a vicenda')
  // A function's body may use x and the params but not call itself.
  for (const [name, body] of Object.entries(f.functions)) {
    try {
      compileExpr(body, { vars: known.vars, fns: fns.filter((n) => n !== name) })
    } catch (e) {
      fail(`funzione ${name}: ${(e as Error).message}`)
    }
  }
  for (const el of f.elements) {
    if (el.kind === 'curve' && !fns.includes(el.fn)) fail(`curva su funzione sconosciuta «${el.fn}»`)
    if (el.kind === 'point' && el.drag && !params.includes(el.drag)) fail(`punto trascinabile su parametro sconosciuto «${el.drag}»`)
    for (const k of ['x', 'y', 'x1', 'y1', 'x2', 'y2', 'slope', 'greenWhen'] as const) {
      const v = (el as Record<string, unknown>)[k]
      if (typeof v === 'string') tryCompile(v)
    }
  }
  for (const r of f.readouts ?? []) tryCompile(r.expr)
  if (f.points) {
    if (!params.includes(f.points.param)) fail(`«Mostra i punti» su parametro sconosciuto «${f.points.param}»`)
    if (f.points.at && !fns.includes(f.points.at)) fail(`«Mostra i punti» su funzione sconosciuta «${f.points.at}»`)
    tryCompile(f.points.expr)
  }
  for (const sp of f.stepParams ?? []) for (const k of Object.keys(sp)) if (!params.includes(k)) fail(`passo su parametro sconosciuto «${k}»`)
}
export const FigureSchema = FigureBase.superRefine(checkFigure)
const Figure = FigureSchema

const Quiz = z
  .object({ type: z.literal('quiz'), prompt: str, options: z.array(str).min(2).max(6), correct: z.number().int().min(0), why: z.array(str), fromNote: z.boolean().optional() })
  .refine((q) => q.correct < q.options.length && q.why.length === q.options.length, 'quiz incoerente')

const LeafBlock = z.union([
  z.object({ type: z.literal('prose'), md, sources: z.array(str).optional() }),
  z.object({ type: z.literal('theorem'), label: z.string(), md }),
  z.object({ type: z.literal('decode'), formal: md, read: md, meaning: md }),
  z.object({
    type: z.literal('proof'),
    steps: z.array(z.object({ kicker: z.string().optional(), title: str, md, tryPrompt: z.string().optional() })).min(1).max(12),
    figure: Figure.optional()
  }),
  Figure,
  Quiz,
  z.object({ type: z.literal('flashcard'), q: str, a: str }),
  z.object({ type: z.literal('tryit'), prompt: str, solution: md }),
  z.object({ type: z.literal('exercise'), level: z.enum(['svolto', 'completa', 'solo', 'esame']), title: str, steps: z.array(md).min(1) }),
  z.object({ type: z.literal('glossary'), rows: z.array(z.object({ symbol: str, read: z.string(), meaning: z.string() })).min(1) }),
  z.object({ type: z.literal('flag'), md: str, correction: z.string().optional() }),
  z.object({ type: z.literal('session'), kind: z.enum(['previsione', 'parole', 'errore']), md: str }),
  z.object({ type: z.literal('why'), title: str, md })
])
export type LeafBlock = z.infer<typeof LeafBlock>
export type TabsBlock = { type: 'tabs'; tabs: { label: string; blocks: LeafBlock[] }[] }
export type Block = LeafBlock | TabsBlock
export type Figure = z.infer<typeof FigureBase>
export type FigElement = z.infer<typeof FigElement>
export type FigParam = z.infer<typeof FigParam>
export type Color = z.infer<typeof Color>

export type Section = { id: string; num: string; title: string; titleEm?: string; blocks: Block[] }

const Top = z.object({
  title: str,
  titleEm: z.string().optional(),
  eyebrow: z.string().default(''),
  aka: z.array(z.string()).default([]),
  lede: z.string().default(''),
  tldr: z.array(z.string()).max(6).default([]),
  provenance: z
    .object({ fromNote: z.array(z.string()).default([]), added: z.array(z.string()).default([]), flagged: z.array(z.string()).default([]) })
    .default({ fromNote: [], added: [], flagged: [] }),
  sections: z
    .array(z.object({ id: z.string().optional(), num: z.string().default(''), title: str, titleEm: z.string().optional(), blocks: z.array(z.unknown()).default([]) }))
    .min(1)
    .max(30),
  recap: z
    .object({ ideas: z.array(z.string()).default([]), formulas: z.array(z.object({ label: z.string(), tex: z.string() })).default([]) })
    .default({ ideas: [], formulas: [] })
})
export type Nota = Omit<z.infer<typeof Top>, 'sections'> & { sections: Section[] }

/** Throws only when the top level is unusable; invalid blocks are dropped and counted. */
export function parseNota(raw: unknown): { nota: Nota; dropped: number } {
  const top = Top.parse(raw)
  let dropped = 0
  const leaf = (b: unknown): LeafBlock | null => {
    const r = LeafBlock.safeParse(b)
    if (r.success) return r.data
    dropped++
    return null
  }
  const block = (b: unknown): Block | null => {
    if (b && typeof b === 'object' && (b as { type?: unknown }).type === 'tabs') {
      const tabs = (b as { tabs?: unknown }).tabs
      if (!Array.isArray(tabs) || tabs.length === 0) {
        dropped++
        return null
      }
      const out: TabsBlock['tabs'] = []
      for (const t of tabs) {
        const label = (t as { label?: unknown })?.label
        const blocks = (t as { blocks?: unknown })?.blocks
        if (typeof label !== 'string' || !Array.isArray(blocks)) {
          dropped++
          continue
        }
        out.push({ label, blocks: blocks.map(leaf).filter((x): x is LeafBlock => x !== null) })
      }
      if (!out.length) return null
      return { type: 'tabs', tabs: out }
    }
    return leaf(b)
  }
  const seen = new Set<string>()
  const sections: Section[] = top.sections.map((s, i) => {
    let id = s.id && /^[A-Za-z][\w-]*$/.test(s.id) ? s.id : `s${i + 1}`
    while (seen.has(id)) id = `${id}-${i + 1}`
    seen.add(id)
    const blocks = s.blocks.map(block).filter((x): x is Block => x !== null)
    return { id, num: s.num, title: s.title, ...(s.titleEm ? { titleEm: s.titleEm } : {}), blocks }
  })
  return { nota: { ...top, sections }, dropped }
}

/** For bridge.ask: valid input becomes { nota, dropped }; an unusable top level is a schema error. */
export const NotaSchema = z.unknown().transform((raw, ctx) => {
  try {
    return parseNota(raw)
  } catch (e) {
    ctx.addIssue({ code: 'custom', message: e instanceof z.ZodError ? e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') : String(e) })
    return z.NEVER
  }
})

export const NOTA_FORMAT = `FORMATO DELLA NOTA VIVA (un solo oggetto JSON; rispetta ESATTAMENTE i nomi dei campi)

type Nota = {
  title: string            // titolo, es. "Teorema di Lagrange"
  titleEm?: string         // seconda parte in corsivo, es. "del valor medio"
  eyebrow: string          // es. "Analisi 1 · Calcolo differenziale · Teorema"
  aka: string[]            // altri nomi (alias, numerazioni del corso)
  lede: string             // una frase che dice a cosa serve l'argomento
  tldr: string[]           // "In tre righe": 2–4 righe, con LaTeX
  provenance: { fromNote: string[]; added: string[]; flagged: string[] }  // cosa viene dalla nota, cosa hai aggiunto, cosa hai segnalato
  sections: Section[]      // le sezioni della nota Obsidian, stesso ordine e stessi titoli
  recap: { ideas: string[]; formulas: { label: string; tex: string }[] }  // "Cosa ricordare"; tex senza $
}
type Section = { id: string /* "s1", "s2"… */; num: string /* "§1" */; title: string; titleEm?: string; blocks: Block[] }

type Block =
  | { type: "prose"; md: string; sources?: string[] }            // markdown + LaTeX ($…$, $$…$$)
  | { type: "theorem"; label: string; md: string }                // enunciato, es. label "Teorema 3.8"
  | { type: "decode"; formal: string; read: string; meaning: string }  // tre schede: notazione formale / come si legge / cosa significa; formal in LaTeX tra $…$ o $$…$$
  | { type: "proof"; steps: { kicker?: string; title: string; md: string; tryPrompt?: string }[]; figure?: Figure }
      // dimostrazione a passi (1–12); tryPrompt = domanda "Prima prova tu" per quel passo;
      // figure con stepParams: la figura cambia a ogni passo mentre si scorre
  | Figure
  | { type: "quiz"; prompt: string; options: string[] /* 2–6 */; correct: number /* indice da 0 */; why: string[] /* una spiegazione per opzione */; fromNote?: boolean }
  | { type: "flashcard"; q: string; a: string }
  | { type: "tryit"; prompt: string; solution: string }           // "Prima prova tu" generico
  | { type: "exercise"; level: "svolto" | "completa" | "solo" | "esame"; title: string; steps: string[] }
      // in "completa" scrivi le scelte dentro i passi come {{opzione1|*giusta|opzione3}} (l'asterisco segna quella giusta)
  | { type: "glossary"; rows: { symbol: string; read: string; meaning: string }[] }  // tabella simboli; symbol in LaTeX tra $…$ (es. "$f \\in C^0([a,b])$")
  | { type: "flag"; md: string; correction?: string }              // segnalazione sulla nota: non correggere in silenzio
  | { type: "session"; kind: "previsione" | "parole" | "errore"; md: string }   // SOLO dalla sessione fornita
  | { type: "why"; title: string; md: string }                     // approfondimento richiudibile, es. "Perché proprio Rolle?"
  | { type: "tabs"; tabs: { label: string; blocks: Block[] }[] }   // es. un corollario per scheda (niente tabs dentro tabs)

type Figure = {
  type: "figure"; title: string /* "Figura 1 · …" */; caption?: string
  x: [number, number]; y: [number, number]          // finestra visibile
  functions: { [nome: string]: string }             // es. { "f": "x^3/4 - x + 3/2" }; possono usare i parametri
  params: { id: string; label: string; min: number; max: number; step: number; value: number }[]  // 0–3 cursori
  elements: (
    | { kind: "curve"; fn: string; color?: Color; label?: string; dashed?: boolean }
    | { kind: "point"; x: string; y: string; label?: string; drag?: string /* id del parametro mosso trascinando: x deve essere quel parametro */; color?: Color }
    | { kind: "segment"; x1: string; y1: string; x2: string; y2: string; color?: Color; dashed?: boolean }
    | { kind: "line"; x: string; y: string; slope: string; color?: Color; dashed?: boolean }   // retta per (x,y) con pendenza slope (tangenti, secanti)
    | { kind: "vline"; x: string; color?: Color } | { kind: "hline"; y: string; color?: Color }
    | { kind: "label"; x: string; y: string; text: string }
  ) & { greenWhen?: string /* espressione che vale 0 quando l'elemento deve diventare verde */; steps?: number[] /* passi della dimostrazione in cui è visibile */ }[]
  readouts?: { label: string; expr: string }[]       // valori mostrati sotto la figura
  points?: { label: string /* es. "Mostra i punti" */; param: string; expr: string /* zeri in funzione del parametro */; at?: string /* funzione su cui segnarli */ }
  stepParams?: { [param: string]: number }[]          // solo dentro proof: valori dei parametri a ogni passo
}
type Color = "accent" | "good" | "warn" | "bad" | "muted" | "ink"
  // come appaiono: accent = arancione mattone, good = verde (riservalo a ciò che "diventa vero"), warn = ocra,
  // bad = rosso, muted = grigio, ink = colore del testo. Senza color: curve accent, punti ink, il resto grigio.
  // Se nella caption nomini un colore, usa SOLO questi nomi italiani (mai "good", "accent"…). Le etichette (label) siano brevi: "c", "A", "P".

ESPRESSIONI nelle figure: numeri, x, i parametri, + - * / ^ e parentesi; moltiplicazione SEMPRE esplicita (2*x, non 2x);
funzioni sin cos tan asin acos atan exp ln log sqrt abs sign floor min(a,b) max(a,b); costanti pi, e;
le funzioni definite in "functions" si chiamano f(p) e la derivata si scrive f'(p). Niente altro.
Esempio di tangente che diventa verde quando è parallela alla corda tra a=-1 e b=2:
{ "kind": "line", "x": "p", "y": "f(p)", "slope": "f'(p)", "greenWhen": "f'(p) - (f(2)-f(-1))/3" }
con "points": { "label": "Mostra i punti", "param": "p", "expr": "f'(p) - (f(2)-f(-1))/3", "at": "f" }.`
