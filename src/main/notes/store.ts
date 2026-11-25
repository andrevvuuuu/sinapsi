import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { MoveLine } from '../../shared/graph-types'
import { resolvePath } from '../graph/resolve-path'

import type { NoteMeta, StoredNote } from '../../shared/notes-types'
export type { NoteMeta, StoredNote } from '../../shared/notes-types'

export const toMeta = ({ nota, sourceSections: _s, sourceIntroHash: _i, ...rest }: StoredNote): NoteMeta => ({
  ...rest,
  title: nota?.title ?? rest.sourceTitle
})

/** One JSON file per nota viva; whole-file writes through a temp file, so a crash never leaves half a note. */
export type NoteStore = { write(n: StoredNote): Promise<void>; read(id: string): Promise<StoredNote>; all(): Promise<StoredNote[]> }

export function noteStore(dir: string): NoteStore {
  const file = (id: string): string => join(dir, `${id}.json`)
  return {
    async write(n: StoredNote): Promise<void> {
      await mkdir(dir, { recursive: true })
      const tmp = `${file(n.id)}.tmp`
      await writeFile(tmp, JSON.stringify(n), 'utf8')
      await rename(tmp, file(n.id))
    },
    async read(id: string): Promise<StoredNote> {
      return JSON.parse(await readFile(file(id), 'utf8')) as StoredNote
    },
    async all(): Promise<StoredNote[]> {
      let names: string[]
      try {
        names = await readdir(dir)
      } catch {
        return []
      }
      const out: StoredNote[] = []
      for (const n of names.filter((x) => x.endsWith('.json'))) {
        try {
          out.push(JSON.parse(await readFile(join(dir, n), 'utf8')) as StoredNote)
        } catch {
          console.warn(`[notes] file illeggibile ${n}`)
        }
      }
      return out
    }
  }
}

/** Notes whose nota viva is ready: the only ones the graph shows and background extraction touches. */
export const readySources = (list: Pick<NoteMeta, 'sourcePath' | 'status'>[], moves: Pick<MoveLine, 'from' | 'to' | 'at'>[] = []): Set<string> => new Set(list.filter((m) => m.status === 'ready').map((m) => resolvePath(m.sourcePath, moves)))
