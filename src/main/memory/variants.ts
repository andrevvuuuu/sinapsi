import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { z } from 'zod'
import { ExerciseSchema, VariantLineSchema, type Exercise, type VariantLine } from '../../shared/exercise-schema'
import type { Concept } from '../../shared/graph-types'
import { EXERCISE_TYPES, type ExerciseType } from '../../shared/memory-types'
import { capNote } from '../session/prompt'
import { appendJsonl, readJsonl } from '../store/jsonl'

const Reply = z.object({ concepts: z.array(z.object({ id: z.string(), exercises: z.array(z.unknown()) })) })

/** Lenient: each exercise is checked alone; ids and times are set here, never by the model. */
export function parseVariants(raw: unknown, conceptIds: Set<string>, now: () => number): { variants: VariantLine[]; dropped: number } {
  const r = Reply.parse(raw)
  let dropped = 0
  const variants: VariantLine[] = []
  for (const c of r.concepts) {
    if (!conceptIds.has(c.id)) {
      dropped += c.exercises.length
      continue
    }
    for (const e of c.exercises) {
      const p = ExerciseSchema.safeParse(e)
      if (!p.success) {
        dropped++
        continue
      }
      variants.push({ id: `v_${randomBytes(6).toString('hex')}`, conceptId: c.id, at: now(), exercise: p.data })
    }
  }
  return { variants, dropped }
}

/** For bridge.ask: a reply without a concepts list is a schema error (one retry), the rest is lenient. */
export const variantsReplySchema = (conceptIds: Set<string>, now: () => number): z.ZodType<{ variants: VariantLine[]; dropped: number }> =>
  z.unknown().transform((raw, ctx) => {
    try {
      return parseVariants(raw, conceptIds, now)
    } catch (e) {
      ctx.addIssue({ code: 'custom', message: e instanceof Error ? e.message.slice(0, 300) : String(e) })
      return z.NEVER
    }
  })

export function fallbackExercise(c: Concept): Exercise {
  return { type: 'open', prompt: `Senza guardare: che cosa dice «${c.name}»?`, answer: c.statement }
}

const FORMAT: Record<ExerciseType, string> = {
  open: '  { "type": "open" }                                                    // risposta aperta',
  mc: '  { "type": "mc", "options": ["…","…"], "correct": 0 }                  // 2–6 opzioni, indice da 0',
  truefalse: '  { "type": "truefalse", "statement": "…", "value": true }              // vero/falso: Andrea spiega anche perché',
  order: '  { "type": "order", "steps": ["…","…","…"] }                           // 3–8 passi NELL\'ORDINE GIUSTO (l\'app li mescola)',
  fill: '  { "type": "fill", "text": "… {{sbagliata|*giusta|sbagliata}} …" }     // l\'asterisco segna quella giusta',
  match: '  { "type": "match", "pairs": [["sinistra","destra"], …] }              // 2–6 coppie giuste (l\'app mescola la destra)',
  counterexample: '  { "type": "counterexample", "options": ["…","…"], "correct": 1 }      // scegli il controesempio',
  estimate: '  { "type": "estimate", "value": 3, "tolerance": 0.1, "unit": "…" }     // stima numerica',
  spoterror: '  { "type": "spoterror", "steps": ["…","…","…"], "wrong": 1, "why": "…" } // un passo sbagliato in una catena',
  graph: '  { "type": "graph", "figure": Figura, "param": "p", "target": "f\'(p) - 0" } // la figura senza "points", "readouts" né "greenWhen"'
}

export function buildVariantsPrompt(input: { noteTitle: string; noteText: string; concepts: Concept[]; types?: ExerciseType[] }): string {
  const types = input.types?.length ? input.types : [...EXERCISE_TYPES]
  return [
    `Prepari le domande di ripasso di Sinapsi per Andrea (Scienze matematiche per l'IA). Il ripasso a intervalli chiede un concetto quando sta per dimenticarlo, e ogni volta in una forma nuova: per questo ti chiedo più varianti per ogni concetto.`,
    `REGOLE
- Per ogni concetto qui sotto: 4 o 5 esercizi, di tipi diversi quando possibile, ognuno da un'angolazione diversa: richiamo (farlo venire in mente), distinzione (non confonderlo con concetti vicini), composizione (usarlo in un ragionamento o in un calcolo).
- Mai la stessa domanda riformulata: ogni esercizio deve chiedere qualcosa di diverso. Mai rivelare la risposta nel testo della domanda.
- "answer" è la risposta di riferimento, completa e precisa, mostrata dopo che Andrea ha risposto.
- Usa "graph" solo se il concetto riguarda la forma di una funzione (tangenti, crescenza, massimi…): la figura segue il formato delle figure delle note vive e "target" è un'espressione del parametro che vale 0 nel punto giusto.
- Italiano; matematica in LaTeX con $…$; dentro le stringhe JSON ogni backslash va raddoppiato (\\\\frac).`,
    `CONCETTI (id | nome | enunciato)
${input.concepts.map((c) => `${c.id} | ${c.name} | ${c.statement.replace(/\s+/g, ' ')}`).join('\n')}`,
    `FORMATO (un solo oggetto JSON):
{ "concepts": [ { "id": "n_…", "exercises": [ Esercizio, … ] } ] }
Usa SOLO questi tipi: ${types.map((t) => `"${t}"`).join(', ')}.${types.length < 3 ? ' (Qui bastano anche tipi ripetuti, con domande diverse.)' : ''}
Esercizio, tutti con "prompt" e "answer":
${types.map((t) => FORMAT[t]).join('\n')}`,
    `NOTA DI ORIGINE «${input.noteTitle}» (per il contesto e la notazione di Andrea)\n\n${capNote(input.noteText)}`,
    `Non usare strumenti né file. Rispondi solo con l'oggetto JSON, senza testo prima o dopo.`
  ].join('\n\n---\n\n')
}

export type VariantsStore = { append(v: VariantLine): Promise<void>; read(): Promise<VariantLine[]> }

/** variants.jsonl: append-only, one line per generated exercise. */
export function variantsStore(dir: string): VariantsStore {
  const file = join(dir, 'variants.jsonl')
  return { append: (v) => appendJsonl(file, v), read: () => readJsonl(file, VariantLineSchema) }
}
