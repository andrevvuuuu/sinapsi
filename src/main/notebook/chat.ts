import { z } from 'zod'
import type { Bridge } from '../ai/bridge'
import type { ChatTurn, Claim, Excerpt } from '../../shared/notebook-types'
import { chunk, selectExcerpts, type Chunk } from './retrieve'
import type { NotebookStore } from './store'

const HISTORY_TURNS = 6
const TIMEOUT = 180_000
const NOTHING = 'Le fonti selezionate non rispondono a questa domanda.'

const SourceNumbers = z.preprocess(
  (v) => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]).map((x) => (typeof x === 'string' ? Number(x.replace(/[^\d]/g, '')) : x)).filter((x) => typeof x === 'number' && Number.isInteger(x)),
  z.array(z.number())
)
export const NotebookReplySchema = z.object({
  claims: z.array(z.object({ text: z.string(), sources: SourceNumbers })),
  missing: z.preprocess((v) => (typeof v === 'string' && v.trim() && v.trim() !== 'null' ? v.trim() : null), z.string().nullable())
})
export type NotebookReply = z.infer<typeof NotebookReplySchema>

const RULES = `Regole:
- Rispondi SOLO con ciò che è scritto negli ESTRATTI qui sotto, presi dalle fonti che Andrea ha caricato nell'app.
- Non usare la tua conoscenza generale, non usare strumenti, non cercare sul web, non leggere file.
- Ogni affermazione cita almeno un estratto con il suo numero in "sources". Puoi riformulare, collegare estratti e fare passaggi diretti da quello che dicono, ma non aggiungere fatti che non ci sono, anche se li sai e sono veri.
- Se le fonti dicono una cosa diversa da quello che sai, riporta quello che dicono le fonti.
- Se gli estratti non bastano a rispondere (del tutto o in parte), scrivi in "missing" che cosa le fonti non dicono. Non completare con ciò che sai.
- Scrivi in italiano, chiaro, una affermazione per elemento di "claims" (anche di più frasi se servono insieme). Non mettere i numeri delle fonti nel testo.
- Formule in LaTeX tra $...$, con le barre rovesciate raddoppiate nel JSON (\\\\frac).`

const FORMAT = `Rispondi solo con JSON, senza testo prima o dopo: {"claims":[{"text":"...","sources":[1]}],"missing":"... oppure null"}`

export function buildAskPrompt(input: { notebookName: string; excerpts: Excerpt[]; history: ChatTurn[]; question: string }): string {
  const parts = [`Sei il Notebook di Sinapsi («${input.notebookName}»): rispondi alle domande di Andrea sulle sue fonti.\n${RULES}`]
  parts.push(`ESTRATTI\n${input.excerpts.map((e) => `[${e.n}] (${e.title}, ${e.label}) ${e.text}`).join('\n')}`)
  const past = input.history.filter((t) => t.role !== 'error').slice(-HISTORY_TURNS)
  if (past.length)
    parts.push(
      `CONVERSAZIONE PRECEDENTE (non è una fonte: serve solo a capire la domanda)\n${past
        .map((t) => (t.role === 'user' ? `Andrea: ${t.text}` : `Notebook: ${t.role === 'assistant' ? [...t.claims.map((c) => c.text), t.missing ? `(le fonti non dicono: ${t.missing})` : ''].filter(Boolean).join(' ') : ''}`))
        .join('\n')}`
    )
  parts.push(`DOMANDA\n${input.question}`)
  parts.push(FORMAT)
  return parts.join('\n\n')
}

/** The app, not the model, has the last word: citations must point at given excerpts, and uncited claims are not shown. */
export function groundReply(reply: NotebookReply, excerpts: Excerpt[]): { claims: Claim[]; missing: string | null; dropped: number } {
  const valid = new Set(excerpts.map((e) => e.n))
  const claims: Claim[] = []
  let dropped = 0
  for (const c of reply.claims) {
    const text = c.text.replace(/\s*\[\d+(?:\s*[,;]\s*\d+)*\]/g, '').trim()
    if (!text) continue
    const sources = [...new Set(c.sources.filter((n) => valid.has(n)))]
    if (!sources.length) dropped++
    else claims.push({ text, sources })
  }
  return { claims, missing: reply.missing, dropped }
}

export function createNotebookChat(deps: { bridge: Pick<Bridge, 'ask'>; store: NotebookStore; workDir: string; now?: () => number; onTurn: (notebookId: string) => void }) {
  const now = deps.now ?? Date.now
  const { store } = deps

  async function append(notebookId: string, t: ChatTurn): Promise<void> {
    await store.appendChat(notebookId, t)
    deps.onTurn(notebookId)
  }

  return {
    async ask(notebookId: string, question: string, sourceIds: string[]): Promise<void> {
      const history = await store.chat(notebookId)
      await append(notebookId, { role: 'user', text: question, at: now(), sourceIds })
      const nb = (await store.notebooks()).find((n) => n.id === notebookId)
      const wanted = new Set(sourceIds)
      const ready = (nb?.sources ?? []).filter((s) => s.status === 'ready' && wanted.has(s.id))
      const chunks: Chunk[] = []
      for (const s of ready) {
        const t = await store.readText(s.id)
        if (t) chunks.push(...chunk(s.id, s.title, t, 1200, chunks.length))
      }
      if (!nb || !chunks.length) return append(notebookId, { role: 'error', at: now(), text: 'Nessuna fonte pronta tra quelle selezionate.' })
      // Follow-ups ("e la dimostrazione?") borrow the words of the previous questions.
      const recent = history.filter((t) => t.role === 'user').slice(-2).map((t) => (t.role === 'user' ? t.text : ''))
      const { excerpts: picked } = selectExcerpts(chunks, [...recent, question].join(' '))
      const excerpts: Excerpt[] = picked.map((c, i) => ({ n: i + 1, sourceId: c.sourceId, title: c.title, label: c.label, text: c.text, ...(c.start !== undefined ? { start: c.start } : {}) }))
      try {
        const r = await deps.bridge.ask({ task: 'notebook', prompt: buildAskPrompt({ notebookName: nb.name, excerpts, history, question }), schema: NotebookReplySchema, timeoutMs: TIMEOUT, cwd: deps.workDir })
        const g = groundReply(r.data as NotebookReply, excerpts)
        const cited = new Set(g.claims.flatMap((c) => c.sources))
        await append(notebookId, {
          role: 'assistant',
          at: now(),
          claims: g.claims,
          missing: g.missing ?? (g.claims.length ? null : NOTHING),
          dropped: g.dropped,
          excerpts: excerpts.filter((e) => cited.has(e.n))
        })
      } catch (e) {
        await append(notebookId, { role: 'error', at: now(), text: e instanceof Error ? e.message : String(e) })
      }
    }
  }
}
export type NotebookChat = ReturnType<typeof createNotebookChat>
