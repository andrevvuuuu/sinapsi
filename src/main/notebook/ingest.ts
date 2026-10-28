import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { Notebook, Source, SourceKind, SourceText } from '../../shared/notebook-types'
import { canonicalYoutube, fetchYoutube, transcribe, type RunTool } from './media'
import { readPdf, readSlides, readTextDoc } from './readers'
import type { NotebookStore } from './store'

const KINDS: Record<string, SourceKind> = {
  '.pdf': 'pdf',
  '.pptx': 'slides',
  '.txt': 'text',
  '.md': 'text',
  ...Object.fromEntries(['.m4a', '.mp3', '.wav', '.aiff', '.aif', '.aac', '.flac', '.ogg', '.opus', '.mp4', '.mov', '.m4v', '.webm'].map((e) => [e, 'audio' as const]))
}
export const ACCEPTED_EXTENSIONS = Object.keys(KINDS).map((e) => e.slice(1))

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

function describe(kind: SourceKind, t: SourceText): string {
  const n = t.segments.length
  const main =
    kind === 'pdf' ? plural(n, 'pagina', 'pagine')
    : kind === 'slides' ? plural(n, 'slide', 'slide')
    : kind === 'audio' || kind === 'youtube' ? `${Math.max(1, Math.round(((t.segments[n - 1]?.start ?? 0) + 60) / 60))} min`
    : plural(n, 'sezione', 'sezioni')
  return [main, ...t.warnings].join(' · ')
}

/**
 * Turns added files, YouTube links and vault notes into text, one job at a time.
 * Live progress stays in memory: the ledger only gets the status changes.
 */
export function createIngestor(deps: { store: NotebookStore; run: RunTool; readVault: (path: string) => Promise<string>; onChange: () => void }) {
  const { store } = deps
  const progress = new Map<string, number>()
  const removed = new Set<string>()
  // Queued or running: a second Riprova must not transcribe the same lecture twice.
  const pending = new Set<string>()
  const controllers = new Map<string, AbortController>()
  const stages = new Map<string, 'download' | 'transcribe'>()
  // Two lanes: a PDF or a note never waits behind an hour of recording.
  const lanes: Record<'docs' | 'media', Promise<void>> = { docs: Promise.resolve(), media: Promise.resolve() }
  const laneOf = (kind: SourceKind): 'docs' | 'media' => (kind === 'audio' || kind === 'youtube' ? 'media' : 'docs')

  async function read(s: Source, signal: AbortSignal): Promise<{ text: SourceText; title?: string }> {
    const dir = store.filesDir(s.id)
    const file = join(dir, s.origin)
    const onProgress = (p: number): void => {
      if (progress.get(s.id) === p) return
      progress.set(s.id, p)
      deps.onChange()
    }
    const onStage = (st: 'download' | 'transcribe'): void => {
      stages.set(s.id, st)
      deps.onChange()
    }
    switch (s.kind) {
      case 'pdf':
        return { text: await readPdf(file) }
      case 'slides':
        return { text: await readSlides(file) }
      case 'text':
        return { text: readTextDoc(await readFile(file, 'utf8')) }
      case 'vault':
        return { text: readTextDoc(await deps.readVault(s.origin)) }
      case 'audio':
        return { text: await transcribe(deps.run, file, dir, onProgress, signal, onStage) }
      case 'youtube': {
        await mkdir(dir, { recursive: true })
        const r = await fetchYoutube(deps.run, s.origin, dir, onProgress, signal, onStage)
        return { text: r.text, title: r.title }
      }
    }
  }

  async function job(id: string): Promise<void> {
    const s = await store.source(id)
    if (!s || removed.has(id)) return void pending.delete(id)
    const ctl = new AbortController()
    controllers.set(id, ctl)
    await store.setStatus(id, { status: 'processing' })
    deps.onChange()
    try {
      const r = await read(s, ctl.signal)
      if (removed.has(id)) return
      await store.writeText(id, r.text)
      await store.setStatus(id, { status: 'ready', info: describe(s.kind, r.text), title: r.title })
    } catch (e) {
      if (removed.has(id)) return
      await store.setStatus(id, { status: 'failed', error: e instanceof Error ? e.message : String(e) })
    } finally {
      progress.delete(id)
      stages.delete(id)
      controllers.delete(id)
      pending.delete(id)
      // A killed tool may still have written its output into the removed source's folder.
      if (removed.has(id)) await rm(store.filesDir(id), { recursive: true, force: true }).catch(() => undefined)
      deps.onChange()
    }
  }

  function enqueue(id: string, kind: SourceKind): void {
    pending.add(id)
    const lane = laneOf(kind)
    lanes[lane] = lanes[lane].then(() => job(id)).catch((e) => console.warn('[notebook] ingest', e))
  }

  async function add(s: Omit<Source, 'status' | 'addedAt'>): Promise<string> {
    await store.addSource(s)
    deps.onChange()
    enqueue(s.id, s.kind)
    return s.id
  }

  return {
    async addFiles(notebookId: string, paths: string[]): Promise<{ added: string[]; rejected: string[] }> {
      const added: string[] = []
      const rejected: string[] = []
      for (const p of paths) {
        const name = basename(p)
        const kind = KINDS[extname(p).toLowerCase()]
        if (!kind) {
          rejected.push(name)
          continue
        }
        const id = randomUUID()
        await mkdir(store.filesDir(id), { recursive: true })
        await copyFile(p, join(store.filesDir(id), name))
        added.push(await add({ id, notebookId, kind, title: name.slice(0, name.length - extname(name).length), origin: name }))
      }
      return { added, rejected }
    },
    async addYoutube(notebookId: string, url: string): Promise<string> {
      const canonical = canonicalYoutube(url)
      if (!canonical) throw new Error('Link YouTube non valido')
      return add({ id: randomUUID(), notebookId, kind: 'youtube', title: 'Video YouTube', origin: canonical })
    },
    addVaultNote: (notebookId: string, path: string, title: string): Promise<string> => add({ id: randomUUID(), notebookId, kind: 'vault', title, origin: path }),
    async retry(id: string): Promise<void> {
      if (pending.has(id)) return
      pending.add(id)
      const s = await store.source(id)
      if (!s || s.status !== 'failed') return void pending.delete(id)
      await store.setStatus(id, { status: 'queued' })
      deps.onChange()
      enqueue(id, s.kind)
    },
    /** "Aggiorna": read a vault note again (it may have changed in Obsidian). */
    async refresh(id: string): Promise<void> {
      if (pending.has(id)) return
      pending.add(id)
      const s = await store.source(id)
      if (!s || s.kind !== 'vault' || s.status === 'processing') return void pending.delete(id)
      await store.setStatus(id, { status: 'queued' })
      deps.onChange()
      enqueue(id, s.kind)
    },
    /** Deleting a notebook stops its work and removes its sources' files. */
    async removeNotebook(notebookId: string): Promise<void> {
      const nb = (await store.notebooks()).find((n) => n.id === notebookId)
      for (const s of nb?.sources ?? []) await this.remove(s.id)
      await store.remove(notebookId)
      deps.onChange()
    },
    /** Quitting: whisper and yt-dlp must not keep running in the background. */
    stopAll(): void {
      for (const c of controllers.values()) c.abort()
    },
    async remove(id: string): Promise<void> {
      removed.add(id)
      controllers.get(id)?.abort()
      await store.removeSource(id)
      deps.onChange()
    },
    /** Work left half-done by a quit cannot resume on its own: say so and let Andrea retry. */
    async fixStale(): Promise<void> {
      for (const nb of await store.notebooks())
        for (const s of nb.sources) if (s.status === 'queued' || s.status === 'processing') await store.setStatus(s.id, { status: 'failed', error: 'Interrotta. Riprova.' })
    },
    decorate: (nbs: Notebook[]): Notebook[] =>
      nbs.map((n) => ({ ...n, sources: n.sources.map((s) => ({ ...s, ...(progress.has(s.id) ? { progress: progress.get(s.id) } : {}), ...(stages.has(s.id) ? { stage: stages.get(s.id) } : {}) })) })),
    /** Resolves when every job queued so far has finished. */
    async idle(): Promise<void> {
      let seen: [Promise<void>, Promise<void>]
      do {
        seen = [lanes.docs, lanes.media]
        await Promise.all(seen)
      } while (seen[0] !== lanes.docs || seen[1] !== lanes.media)
    }
  }
}
export type Ingestor = ReturnType<typeof createIngestor>
