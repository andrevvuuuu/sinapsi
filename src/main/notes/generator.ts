import { createHash, randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import type { Bridge } from '../ai/bridge'
import { AiTimeoutError, AuthRequiredError, EngineMissingError } from '../ai/errors'
import type { SessionState } from '../session/events'
import { NotaWriteSchema, notaMathIssues } from '../../shared/nota-math'
import { NotaSchema, SectionsSchema, type Section } from '../../shared/nota-schema'
import type { VaultIndex } from '../../shared/vault-types'
import { bodyHash } from '../vault/body-hash'
import { buildNotePrompt, buildSectionUpdatePrompt } from './prompt'
import { splitSections, introHash } from './sections'
import { matchesTitle } from './section-text'
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
export const SECTION_UPDATE_TIMEOUT = 240_000
const INTERRUPTED = 'Generazione interrotta. Riprova.'
const hash = bodyHash

function friendly(e: unknown): string {
  if (e instanceof AuthRequiredError) return `${e.engine === 'claude' ? 'Claude' : 'Gemini'} chiede di rifare l'accesso: apri il Terminale e scrivi ${e.engine}, poi premi Riprova.`
  if (e instanceof EngineMissingError) return `${e.engine} non è installato su questo Mac.`
  if (e instanceof AiTimeoutError) return `${e.engine === 'claude' ? 'Claude' : 'Gemini'} ci ha messo troppo tempo a scrivere la nota. Premi Riprova.`
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
    const split = splitSections(text)
    const sourceIntroHash = introHash(split.intro)
    const sourceSections = split.sections.map((s) => ({ title: s.title, hash: s.hash }))
    return {
      ...n,
      status: 'ready',
      error: undefined,
      nota,
      dropped,
      engine: r.engine,
      sourceHash: hash(text),
      sourceSections,
      sourceIntroHash,
      updatedAt: Date.now()
    }
  }

  async function refreshNote(n: StoredNote, text: string, session?: SessionState): Promise<StoredNote> {
    const split = splitSections(text)
    const newIntroHash = introHash(split.intro)
    const newSections = split.sections

    const canPartial = (): { ok: boolean; changed: { newSection: (typeof newSections)[0]; currentSection: Section }[] } => {
      if (!n.nota || !n.sourceSections || !n.sourceIntroHash) return { ok: false, changed: [] }
      if (newSections.length !== n.sourceSections.length || newSections.length === 0) return { ok: false, changed: [] }
      for (let i = 0; i < newSections.length; i++) {
        if (newSections[i].title !== n.sourceSections[i].title) return { ok: false, changed: [] }
      }
      if (newIntroHash !== n.sourceIntroHash) return { ok: false, changed: [] }

      const changedIndices: number[] = []
      for (let i = 0; i < newSections.length; i++) {
        if (newSections[i].hash !== n.sourceSections[i].hash) {
          changedIndices.push(i)
        }
      }

      if (changedIndices.length === 0 || changedIndices.length > Math.ceil(newSections.length / 2)) {
        return { ok: false, changed: [] }
      }

      const sameLength = n.nota.sections.length === newSections.length
      const changed: { newSection: (typeof newSections)[0]; currentSection: Section }[] = []

      for (const idx of changedIndices) {
        let cur: Section | undefined
        if (sameLength) {
          cur = n.nota.sections[idx]
        } else {
          cur = n.nota.sections.find((s) => matchesTitle(newSections[idx].title, s.title) || matchesTitle(s.title, newSections[idx].title))
        }
        if (!cur) return { ok: false, changed: [] }
        changed.push({ newSection: newSections[idx], currentSection: cur })
      }

      return { ok: true, changed }
    }

    const check = canPartial()
    if (check.ok && n.nota) {
      const currentNota = n.nota
      try {
        await mkdir(deps.workDir, { recursive: true })
        const r = await deps.bridge.ask({
          task: 'note',
          prompt: buildSectionUpdatePrompt({
            noteTitle: n.sourceTitle,
            sections: check.changed.map((c) => ({
              obsidianText: c.newSection.text,
              currentSection: c.currentSection
            }))
          }),
          schema: SectionsSchema,
          timeoutMs: SECTION_UPDATE_TIMEOUT,
          cwd: deps.workDir
        })

        const data = r.data as { sections?: Section[]; nota?: { sections?: Section[] }; dropped?: number }
        const returnedSections: Section[] | undefined = data?.sections ?? data?.nota?.sections
        const dropped = data?.dropped ?? 0

        if (!returnedSections || !Array.isArray(returnedSections)) {
          console.warn('[notes] risposta parziale senza sezioni, ripiego su riscrittura completa')
          return await write(n, text, session)
        }

        const returnedMap = new Map<string, Section>()
        for (const s of returnedSections) {
          returnedMap.set(s.id, s)
        }

        const allPresent = check.changed.every((c) => returnedMap.has(c.currentSection.id))
        if (!allPresent) {
          console.warn('[notes] sezioni mancanti nella risposta parziale, ripiego su riscrittura completa')
          return await write(n, text, session)
        }

        const replacementMap = new Map<string, Section>()
        for (const c of check.changed) {
          const ret = returnedMap.get(c.currentSection.id)!
          const oldSessionBlocks = c.currentSection.blocks.filter((b) => b.type === 'session')
          const finalBlocks = [...ret.blocks]
          for (const ob of oldSessionBlocks) {
            const alreadyHas = finalBlocks.some((b) => b.type === 'session' && b.kind === ob.kind && b.md === ob.md)
            if (!alreadyHas) {
              finalBlocks.push(ob)
            }
          }
          replacementMap.set(c.currentSection.id, {
            ...ret,
            id: c.currentSection.id,
            num: ret.num || c.currentSection.num,
            title: ret.title || c.currentSection.title,
            ...(c.currentSection.titleEm && !ret.titleEm ? { titleEm: c.currentSection.titleEm } : {}),
            blocks: finalBlocks
          })
        }

        const updatedSections = currentNota.sections.map((s) => replacementMap.get(s.id) ?? s)
        const updatedNote: StoredNote = {
          ...n,
          status: 'ready',
          error: undefined,
          nota: {
            ...currentNota,
            sections: updatedSections
          },
          dropped: (n.dropped ?? 0) + dropped,
          engine: r.engine ?? n.engine,
          sourceHash: hash(text),
          sourceSections: newSections.map((s) => ({ title: s.title, hash: s.hash })),
          sourceIntroHash: newIntroHash,
          updatedAt: Date.now()
        }

        console.info(`[notes] «${currentNota.title ?? n.sourceTitle}» aggiornata: ${check.changed.length} sezioni su ${newSections.length}`)
        return updatedNote
      } catch (e) {
        // A timeout, a login or a missing engine would only fail again (and cost more) on the full rewrite.
        if (e instanceof AuthRequiredError || e instanceof EngineMissingError || e instanceof AiTimeoutError) throw e
        console.warn('[notes] aggiornamento parziale fallito, ripiego su riscrittura completa', e)
        return await write(n, text, session)
      }
    }

    return await write(n, text, session)
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
          await save(await refreshNote(n, text, session))
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
