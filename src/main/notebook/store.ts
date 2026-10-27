import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { ChatTurnSchema, SOURCE_KINDS, SourceTextSchema, type ChatTurn, type Notebook, type Source, type SourceText } from '../../shared/notebook-types'
import { appendJsonl, readJsonl } from '../store/jsonl'

const NotebookLine = z.discriminatedUnion('op', [
  z.object({ op: z.literal('create'), id: z.string(), name: z.string(), at: z.number() }),
  z.object({ op: z.literal('update'), id: z.string(), name: z.string().optional(), subject: z.string().nullable().optional(), link: z.string().nullable().optional() }),
  z.object({ op: z.literal('delete'), id: z.string() })
])
const Status = z.object({ status: z.enum(['queued', 'processing', 'ready', 'failed']), progress: z.number().optional(), error: z.string().optional(), info: z.string().optional() })
const SourceLine = z.discriminatedUnion('op', [
  z.object({ op: z.literal('add'), id: z.string(), notebookId: z.string(), kind: z.enum(SOURCE_KINDS), title: z.string(), origin: z.string(), at: z.number() }),
  z.object({ op: z.literal('status'), id: z.string() }).merge(Status),
  z.object({ op: z.literal('remove'), id: z.string() })
])

export type NewSource = Omit<Source, 'status' | 'addedAt' | 'progress' | 'error' | 'info'>
export type StatusPatch = z.infer<typeof Status>

/** Notebook ledgers: notebooks.jsonl, sources.jsonl, chats/<notebook>.jsonl; text/<source>.json and files/<source>/ beside them. */
export function notebookStore(dir: string, now: () => number = Date.now) {
  const nbFile = join(dir, 'notebooks.jsonl')
  const srcFile = join(dir, 'sources.jsonl')
  const textFile = (id: string): string => join(dir, 'text', `${id}.json`)
  const filesDir = (id: string): string => join(dir, 'files', id)

  async function sources(): Promise<Map<string, Source>> {
    const out = new Map<string, Source>()
    for (const l of await readJsonl(srcFile, SourceLine)) {
      if (l.op === 'add') out.set(l.id, { id: l.id, notebookId: l.notebookId, kind: l.kind, title: l.title, origin: l.origin, addedAt: l.at, status: 'queued' })
      else if (l.op === 'remove') out.delete(l.id)
      else {
        const s = out.get(l.id)
        if (!s) continue
        out.set(l.id, { ...s, status: l.status, progress: l.progress, error: l.error, info: l.info ?? (l.status === 'ready' ? undefined : s.info) })
      }
    }
    return out
  }

  return {
    filesDir,
    async notebooks(): Promise<Notebook[]> {
      const nbs = new Map<string, Notebook>()
      for (const l of await readJsonl(nbFile, NotebookLine)) {
        if (l.op === 'create') nbs.set(l.id, { id: l.id, name: l.name, subject: null, link: null, createdAt: l.at, sources: [] })
        else if (l.op === 'delete') nbs.delete(l.id)
        else {
          const n = nbs.get(l.id)
          if (!n) continue
          if (l.name !== undefined) n.name = l.name
          if (l.subject !== undefined) n.subject = l.subject
          if (l.link !== undefined) n.link = l.link
        }
      }
      for (const s of (await sources()).values()) nbs.get(s.notebookId)?.sources.push(s)
      return [...nbs.values()].sort((a, b) => b.createdAt - a.createdAt)
    },
    async create(name: string): Promise<string> {
      const id = randomUUID()
      await appendJsonl(nbFile, { op: 'create', id, name, at: now() })
      return id
    },
    update: (id: string, patch: { name?: string; subject?: string | null; link?: string | null }): Promise<void> => appendJsonl(nbFile, { op: 'update', id, ...patch }),
    remove: (id: string): Promise<void> => appendJsonl(nbFile, { op: 'delete', id }),
    addSource: (s: NewSource): Promise<void> => appendJsonl(srcFile, { op: 'add', ...s, at: now() }),
    setStatus: (id: string, st: StatusPatch): Promise<void> => appendJsonl(srcFile, { op: 'status', id, ...st }),
    async source(id: string): Promise<Source | null> {
      return (await sources()).get(id) ?? null
    },
    async removeSource(id: string): Promise<void> {
      await appendJsonl(srcFile, { op: 'remove', id })
      await rm(filesDir(id), { recursive: true, force: true })
      await rm(textFile(id), { force: true })
    },
    async writeText(id: string, t: SourceText): Promise<void> {
      await mkdir(join(dir, 'text'), { recursive: true })
      await writeFile(textFile(id) + '.tmp', JSON.stringify(t), 'utf8')
      await rename(textFile(id) + '.tmp', textFile(id))
    },
    async readText(id: string): Promise<SourceText | null> {
      try {
        const r = SourceTextSchema.safeParse(JSON.parse(await readFile(textFile(id), 'utf8')))
        return r.success ? r.data : null
      } catch {
        return null
      }
    },
    chat: (notebookId: string): Promise<ChatTurn[]> => readJsonl(join(dir, 'chats', `${notebookId}.jsonl`), ChatTurnSchema),
    appendChat: (notebookId: string, t: ChatTurn): Promise<void> => appendJsonl(join(dir, 'chats', `${notebookId}.jsonl`), t)
  }
}
export type NotebookStore = ReturnType<typeof notebookStore>
