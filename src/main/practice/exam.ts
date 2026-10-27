import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import type { Grade } from '../../shared/memory-types'
import { ExamGradeReplySchema, ExamSheetSchema, type ExamGrade, type ExamSheet, type Material } from '../../shared/practice-types'
import type { PracticeState } from './events'
import { friendly, type PracticeDeps, type PracticeRunner } from './runner'
import { unescapeOver } from '../ai/json'

const TIMEOUT = 300_000

/** Points scaled to a total of 30, in half points; the last problem absorbs the rounding. */
export function normalizePoints(points: number[]): number[] {
  // Largest remainder in half points (60 units): every problem gets at least one unit, the total is exact.
  const w = points.map((p) => (p > 0 ? p : 1))
  const sum = w.reduce((a, b) => a + b, 0)
  const raw = w.map((p) => (p * 60) / sum)
  const units = raw.map((r) => Math.max(1, Math.floor(r)))
  let left = 60 - units.reduce((a, b) => a + b, 0)
  const byRemainder = raw.map((_, i) => i).sort((a, b) => raw[b] - Math.floor(raw[b]) - (raw[a] - Math.floor(raw[a])) || a - b)
  for (let k = 0; left > 0; k = (k + 1) % units.length, left--) units[byRemainder[k]]++
  const byUnits = units.map((_, i) => i).sort((a, b) => units[b] - units[a])
  for (let k = 0; left < 0; k = (k + 1) % units.length) {
    if (units[byUnits[k]] <= 1) continue
    units[byUnits[k]]--
    left++
  }
  return units.map((u) => u / 2)
}

function sheetPrompt(context: string, minutes: number): string {
  return `Prepara una prova scritta d'esame universitario (stile italiano) da svolgere in ${minutes} minuti, sul materiale qui sotto, per Andrea (Scienze matematiche per l'IA).
Regole:
- Da 2 a 8 problemi, calibrati sul tempo: tutti risolvibili in ${minutes} minuti da uno studente preparato. Mescola gli argomenti; alterna calcolo, dimostrazione, applicazione. Se nel materiale ci sono temi d'esame o esercizi del corso, imitane lo stile.
- Non chiedere nulla oltre il materiale. Non annunciare quale teorema usare.
- Risolvi tu ogni problema PRIMA di scriverlo e verifica che sia corretto e senza scorciatoie: metti la soluzione completa in "modelSolution" (Andrea la vede solo dopo la correzione).
- "points": il peso di ogni problema; il totale verrà portato a 30.
- "targets": gli id dei concetti scelti che il problema esercita ([] se il materiale è libero).
- Testo in italiano, matematica in LaTeX con $...$ e $$...$$.
Rispondi solo con JSON: {"title":"...","problems":[{"id":"e1","statement":"...","points":10,"targets":[],"modelSolution":"..."}]}

MATERIALE

${context}`
}

function gradePrompt(sheet: ExamSheet, answers: Record<string, string>): string {
  const parts = sheet.problems.map(
    (p, i) => `## Esercizio ${i + 1} (id ${p.id}, ${p.points} punti)\n${p.statement}\n\nSOLUZIONE DI RIFERIMENTO\n${p.modelSolution}\n\nRISPOSTA DI ANDREA\n${answers[p.id]?.trim() || '(nessuna risposta)'}`
  )
  return `Correggi questa prova d'esame come un docente universitario severo ma giusto.
- Per ogni esercizio dai i punti (da 0 al massimo indicato, anche mezzi punti; credito parziale per i passaggi corretti) e un commento breve e onesto che localizza il primo errore o la parte mancante. Una soluzione diversa da quella di riferimento ma corretta vale quanto quella.
- "miss" se c'è un errore: "cue" (non gli è venuta l'idea), "discrimination" (ha usato lo strumento sbagliato), "execution" (idea giusta, eseguita male), "careless", "structural" (una convinzione sbagliata).
- "note": due o tre frasi sull'insieme: cosa riprendere.
Rispondi solo con JSON: {"items":[{"id":"e1","points":0,"comment":"...","miss":"execution"}],"note":"..."}

${parts.join('\n\n---\n\n')}`
}

/** The exam simulation: generate a sheet, keep drafts, deliver once, grade in thirtieths. */
export function createExamService(deps: PracticeDeps & { runner: PracticeRunner }) {
  const { runner } = deps
  const now = deps.now ?? Date.now
  const uuid = deps.uuid ?? randomUUID

  async function sheetOf(id: string): Promise<ExamSheet | undefined> {
    for (const e of (await runner.events(id)).reverse()) if (e.t === 'exam') return e.sheet
    return undefined
  }

  async function generate(id: string, s: PracticeState): Promise<void> {
    runner.inflight.add(id)
    try {
      const context = await deps.material(s.material)
      const r = await deps.bridge.ask({ task: 'teach', prompt: sheetPrompt(context, s.durationMin ?? 60), schema: ExamSheetSchema, timeoutMs: TIMEOUT, cwd: deps.dir })
      const raw = r.data as ExamSheet
      if (new Set(raw.problems.map((p) => p.id)).size !== raw.problems.length) throw new Error('due esercizi con lo stesso id')
      const known = new Set(s.material.conceptIds)
      const sheet: ExamSheet = {
        title: unescapeOver(raw.title),
        problems: raw.problems.map((p) => ({ ...p, targets: p.targets.filter((x) => known.has(x)), statement: unescapeOver(p.statement), modelSolution: unescapeOver(p.modelSolution) }))
      }
      const points = normalizePoints(sheet.problems.map((p) => p.points))
      runner.inflight.delete(id)
      await runner.append(id, { t: 'exam', sheet: { ...sheet, problems: sheet.problems.map((p, i) => ({ ...p, points: points[i] })) }, endsAt: now() + (s.durationMin ?? 60) * 60_000, at: now() })
    } catch (e) {
      runner.inflight.delete(id)
      await runner.append(id, { t: 'error', message: friendly(e), at: now() })
    }
  }

  async function grade(id: string): Promise<void> {
    const s = await runner.load(id)
    const sheet = await sheetOf(id)
    if (!s.exam || !sheet || s.exam.grade) return
    runner.inflight.add(id)
    deps.onUpdate({ ...s, awaiting: 'tutor' })
    try {
      const r = await deps.bridge.ask({ task: 'teach', prompt: gradePrompt(sheet, s.exam.answers), schema: ExamGradeReplySchema, timeoutMs: TIMEOUT, cwd: deps.dir })
      const reply = r.data as Omit<ExamGrade, 'total' | 'lode'>
      // The grader sometimes renames the ids ("1", "Esercizio 1"): fall back to the order, else refuse.
      const byId = sheet.problems.every((p) => reply.items.some((x) => x.id === p.id))
      if (!byId && reply.items.length !== sheet.problems.length) throw new Error('la correzione non corrisponde agli esercizi del compito')
      const items = sheet.problems.map((p, i) => {
        const it = byId ? reply.items.find((x) => x.id === p.id) : reply.items[i]
        return { id: p.id, points: Math.min(p.points, Math.max(0, Math.round((it?.points ?? 0) * 2) / 2)), comment: unescapeOver(it?.comment ?? ''), ...(it?.miss ? { miss: it.miss } : {}) }
      })
      const total = Math.min(30, Math.round(items.reduce((a, b) => a + b.points, 0)))
      const lode = total === 30 && items.every((it, i) => it.points === sheet.problems[i].points)
      // Idempotent: a grading that runs again after a crash finds its lines already written.
      const written = new Set((await deps.memory.read()).filter((r) => r.ref?.startsWith(`exam:${id}:`)).map((r) => `${r.ref}|${r.conceptId}`))
      for (const [i, p] of sheet.problems.entries()) {
        const share = items[i].points / p.points
        const g: Grade = share >= 1 ? 3 : share >= 0.5 ? 2 : 1
        const ref = `exam:${id}:${p.id}`
        for (const conceptId of new Set(p.targets)) if (!written.has(`${ref}|${conceptId}`)) await deps.memory.append({ conceptId, at: now(), grade: g, correct: share >= 0.5, via: 'practice', ref })
      }
      runner.inflight.delete(id)
      await runner.append(id, { t: 'graded', grade: { items, note: unescapeOver(reply.note), total, lode }, at: now() })
    } catch (e) {
      runner.inflight.delete(id)
      await runner.append(id, { t: 'error', message: friendly(e), at: now() })
    }
  }

  const deliver = (id: string, answers: Record<string, string>): Promise<void> =>
    runner.serial(id, async () => {
      const s = await runner.load(id)
      if (!s.exam || s.exam.delivered) return
      await runner.append(id, { t: 'answers', answers, final: true, at: now() })
      await grade(id)
    })

  return {
    async start(material: Material, durationMin: number): Promise<string> {
      await mkdir(deps.dir, { recursive: true })
      const id = uuid()
      const topic = await deps.topic(material)
      runner.inflight.add(id)
      await runner.serial(id, () => runner.append(id, { t: 'created', id, mode: 'exam', material, topic, durationMin, at: now() }))
      return id
    },
    retry: (id: string): Promise<void> =>
      runner.serial(id, async () => {
        const s = await runner.load(id)
        if (s.mode !== 'exam') return
        if (!s.exam) return generate(id, s)
        if (s.exam.delivered && !s.exam.grade) return grade(id)
      }),
    save: (id: string, answers: Record<string, string>): Promise<void> =>
      runner.serial(id, async () => {
        const s = await runner.load(id)
        if (!s.exam || s.exam.delivered) return
        // Only what changed since the last save: a three-hour exam no longer rewrites every answer each time.
        const prev = s.exam.answers
        const diff = Object.fromEntries([...new Set([...Object.keys(prev), ...Object.keys(answers)])].filter((k) => (answers[k] ?? '') !== (prev[k] ?? '')).map((k) => [k, answers[k] ?? '']))
        if (!Object.keys(diff).length) return
        await runner.append(id, { t: 'answers', answers: diff, final: false, at: now() })
      }),
    deliver,
    /** Time keeps running while the app is closed: an exam past its end is delivered with the saved drafts. */
    async get(id: string): Promise<PracticeState> {
      const s = await runner.load(id)
      if (s.exam && !s.exam.delivered && now() > s.exam.endsAt) {
        await runner.serial(id, async () => {
          const again = await runner.load(id)
          if (again.exam && !again.exam.delivered) await runner.append(id, { t: 'answers', answers: again.exam.answers, final: true, at: now() })
        })
        runner.inflight.add(id)
        void runner.serial(id, () => grade(id)).finally(() => runner.inflight.delete(id))
        return runner.load(id)
      }
      return s
    }
  }
}
export type ExamService = ReturnType<typeof createExamService>
