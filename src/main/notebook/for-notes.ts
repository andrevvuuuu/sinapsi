import type { Excerpt } from '../../shared/notebook-types'
import type { VaultIndex } from '../../shared/vault-types'
import { chunk, selectExcerpts, type Chunk } from './retrieve'
import type { NotebookStore } from './store'

const NOTE_BUDGET = 15_000

/** Excerpts for a nota viva: ready sources of the notebooks linked to the note's subject, the passages closest to its title and headings. */
export function notebookSourcesFor(deps: { store: NotebookStore; vault: () => Promise<VaultIndex | null> }) {
  return async (notePath: string, title: string, noteText: string): Promise<Excerpt[]> => {
    const subject = (await deps.vault())?.notes.find((n) => n.path === notePath)?.subject
    if (!subject) return []
    const chunks: Chunk[] = []
    for (const nb of await deps.store.notebooks()) {
      if (nb.subject !== subject) continue
      for (const s of nb.sources) {
        if (s.status !== 'ready') continue
        const t = await deps.store.readText(s.id)
        if (t) chunks.push(...chunk(s.id, s.title, t, 1200, chunks.length))
      }
    }
    if (!chunks.length) return []
    const headings = noteText.split('\n').filter((l) => /^#{1,6}\s/.test(l)).join(' ')
    const { excerpts } = selectExcerpts(chunks, `${title} ${title} ${headings}`, NOTE_BUDGET, NOTE_BUDGET)
    return excerpts.map((c, i) => ({ n: i + 1, sourceId: c.sourceId, title: c.title, label: c.label, text: c.text, ...(c.start !== undefined ? { start: c.start } : {}) }))
  }
}
