import { createHash, randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import type { Bridge } from '../ai/bridge'
import { AiTimeoutError, AuthRequiredError, EngineMissingError } from '../ai/errors'
import type { SessionState } from '../session/events'
import { NotaWriteSchema, notaMathIssues } from '../../shared/nota-math'
import { NotaSchema } from '../../shared/nota-schema'
import type { VaultIndex } from '../../shared/vault-types'
import { bodyHash } from '../vault/body-hash'
import { buildNotePrompt } from './prompt'
import { noteStore, toMeta, type NoteMeta, type StoredNote } from './store'

export type { NoteMeta, StoredNote }
export type NoteGenerator = {
  create(req: { sourcePath?: string; sessionId?: string }): Promise<string>
  retry(id: string): Promise<void>
  /** Rewrites the ready notes vive of a note edited in Obsidian; returns how many it rewrote. */
  refresh(sourcePath: string): Promise<number>
  list(): Promise<NoteMeta[]>
  get(id: string): Promise<StoredNote>
}

export const NOTE_TIMEOUT = 480_000
const INTERRUPTED = 'Generazione interrotta. Riprova.'
const hash = bodyHash

function friendly(e: unknown): string {
  if (e instanceof AuthRequiredError) return `${e.engine === 'claude' ? 'Claude' : 'Gemini'} chiede di rifare l'accesso: apri il Terminale e scrivi ${e.engine}, poi premi Riprova.`
  if (e instanceof EngineMissingError) return `${e.engine} non è installato su questo Mac.`
  if (e instanceof AiTimeoutError) return `Gemini ci ha messo troppo tempo a scrivere la nota. Premi Riprova.`
  return `La nota non è stata scritta correttamente (${e instanceof Error ? e.message.slice(0, 200) : String(e)}). Premi Riprova.`
}

export function createNoteGenerator(deps: {
  bridge: Pick<Bridge, 'ask'>
  dir: string
  workDir: string
  vault: () => Promise<VaultIndex | null>
  readNote: (path: string) => Promise<string>
  session: (id: string) => Promise<SessionState | null>
  /** Excerpts from the notebooks of the note's subject; a failure only leaves them out. */
  sources?: (notePath: string, title: string, noteText: string) => Promise<import('../../shared/notebook-types').Excerpt[]>
  onUpdate: (m: NoteMeta) => void
}): NoteGenerator {
  const store = noteStore(deps.dir)
  const running = new Set<string>()

  async function save(n: StoredNote): Promise<void> {
    await store.write(n)
    deps.onUpdate(toMeta(n))
  }

  /** Only notes the vault index lists as readable may be sent: never an arbitrary path. */
  async function resolveSource(req: { sourcePath?: string; sessionId?: string }): Promise<{ path: string; title: string; session?: SessionState }> {
    let session: SessionState | undefined
    let path = req.sourcePath
    if (!path && req.sessionId) {
      session = (await deps.session(req.sessionId)) ?? undefined
      if (!session?.notePath) throw new Error('La sessione non è collegata a una nota del vault')
      path = session.notePath
    } else if (req.sessionId) session = (await deps.session(req.sessionId)) ?? undefined
    const note = (await deps.vault())?.notes.find((n) => n.path === path && n.available)
    if (!note) throw new Error('Nota non trovata nel vault')
    return { path: note.path, title: note.title, session }
  }

  async function write(n: StoredNote, text: string, session?: SessionState): Promise<StoredNote> {
    await mkdir(deps.workDir, { recursive: true })
    const sources = (await deps.sources?.(n.sourcePath, n.sourceTitle, text).catch(() => [])) ?? []
    const r = await deps.bridge.ask({
      task: 'note',
      prompt: buildNotePrompt({ noteTitle: n.sourceTitle, noteText: text, session, sources }),
      schema: NotaWriteSchema,
      // Math formatting never costs a note: after the retry, the renderer's normalizer and cloze balancer cover it.
      fallback: NotaSchema,
      timeoutMs: NOTE_TIMEOUT,
      cwd: deps.workDir
    })
    const { nota, dropped } = r.data as { nota: StoredNote['nota']; dropped: number }
    const math = nota ? notaMathIssues(nota) : []
    if (math.length) console.warn(`[notes] «${n.sourceTitle}» salvata con ${math.length} formule da sistemare: ${math.slice(0, 5).join('; ')}`)
    return { ...n, status: 'ready', error: undefined, nota, dropped, engine: r.engine, sourceHash: hash(text), updatedAt: Date.now() }
  }

  async function generate(n: StoredNote, session?: SessionState): Promise<void> {
    running.add(n.id)
    try {
      await save(await write(n, await deps.readNote(n.sourcePath), session))
    } catch (e) {
      console.warn('[notes] generazione fallita', e)
      await save({ ...n, status: 'error', error: friendly(e), updatedAt: Date.now() })
    } finally {
      running.delete(n.id)
    }
  }

  return {
    async create(req) {
      const src = await resolveSource(req)
      const now = Date.now()
      const n: StoredNote = {
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
        status: 'generating',
        sourcePath: src.path,
        sourceTitle: src.title,
        ...(req.sessionId && src.session ? { sessionId: req.sessionId } : {})
      }
      await save(n)
      void generate(n, src.session)
      return n.id
    },
    async retry(id) {
      // Reserved before any await, so a second quick click cannot start a second generation.
      if (running.has(id)) return
      running.add(id)
      let started = false
      try {
        const n = await store.read(id)
        if (n.status === 'ready') return
        const src = await resolveSource({ sourcePath: n.sourcePath, sessionId: n.sessionId })
        const next: StoredNote = { ...n, status: 'generating', error: undefined, updatedAt: Date.now() }
        await save(next)
        started = true
        void generate(next, src.session)
      } finally {
        if (!started) running.delete(id)
      }
    },
    async refresh(sourcePath) {
      let text: string
      try {
        text = await deps.readNote(sourcePath)
      } catch {
        return 0
      }
      const h = hash(text)
      // Saved before the hash ignored the frontmatter: same note, no rewrite.
      const legacy = createHash('sha256').update(text).digest('hex')
      let done = 0
      for (const n of await store.all()) {
        if (n.sourcePath !== sourcePath || n.status !== 'ready' || n.sourceHash === h || n.sourceHash === legacy || running.has(n.id)) continue
        running.add(n.id)
        try {
          const session = n.sessionId ? ((await deps.session(n.sessionId)) ?? undefined) : undefined
          // The old note stays readable while the new one is written, and stays if writing fails.
          await save(await write(n, text, session))
          done++
        } catch (e) {
          console.warn('[notes] aggiornamento fallito', sourcePath, e)
        } finally {
          running.delete(n.id)
        }
      }
      return done
    },
    async list() {
      const all = await Promise.all((await store.all()).map(fixStale))
      return all.sort((a, b) => b.createdAt - a.createdAt).map(toMeta)
    },
    async get(id) {
      return fixStale(await store.read(id))
    }
  }

  // A "generating" file nobody in this process is working on was cut short by a quit.
  async function fixStale(n: StoredNote): Promise<StoredNote> {
    if (n.status !== 'generating' || running.has(n.id)) return n
    const fixed: StoredNote = { ...n, status: 'error', error: INTERRUPTED }
    await store.write(fixed).catch(() => undefined)
    return fixed
  }
}
