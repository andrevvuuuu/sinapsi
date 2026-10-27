import type { GraphData } from '../../shared/graph-types'
import type { Memory } from '../../shared/memory-types'
import type { Notebook, SourceText } from '../../shared/notebook-types'
import type { Catalog, CatalogConcept, Material } from '../../shared/practice-types'
import type { VaultIndex } from '../../shared/vault-types'

const NOTE_CAP = 12_000
const NOTES_TOTAL = 40_000
const SOURCES_TOTAL = 40_000
const pct = (r: number): string => `${Math.round(r * 100)}%`

export function buildCatalog(input: { graph: GraphData; memory: Record<string, Memory>; practiced: Set<string>; vault: VaultIndex | null; notebooks: Notebook[]; now: number }): Catalog {
  const noteOf = new Map((input.vault?.notes ?? []).map((n) => [n.path, n]))
  const subjects = new Map<string, Map<string, { path: string; title: string; concepts: CatalogConcept[] }>>()
  const entries: CatalogConcept[] = []
  for (const c of input.graph.concepts) {
    const note = noteOf.get(c.birth)
    const m = input.memory[c.id]
    const entry: CatalogConcept = { id: c.id, name: c.name, R: m?.R ?? null, due: m?.due != null && m.due <= input.now, practiced: input.practiced.has(c.id) }
    entries.push(entry)
    const subject = note?.subject ?? 'Altro'
    const notes = subjects.get(subject) ?? new Map()
    subjects.set(subject, notes)
    const n = notes.get(c.birth) ?? { path: c.birth, title: note?.title ?? c.birth.split('/').pop()!.replace(/\.md$/, ''), concepts: [] }
    notes.set(c.birth, n)
    n.concepts.push(entry)
  }
  const taken = new Set<string>()
  const take = (list: CatalogConcept[], n: number, why: (c: CatalogConcept) => string): { id: string; name: string; why: string }[] =>
    list
      .filter((c) => !taken.has(c.id))
      .slice(0, n)
      .map((c) => (taken.add(c.id), { id: c.id, name: c.name, why: why(c) }))
  const byR = (a: CatalogConcept, b: CatalogConcept): number => (a.R ?? 1) - (b.R ?? 1)
  const suggested = [
    ...take(entries.filter((c) => c.due).sort(byR), 2, (c) => `da ripassare · ${pct(c.R ?? 0)}`),
    ...take(entries.filter((c) => !c.due && c.R !== null).sort(byR), 2, (c) => `${pct(c.R!)} memoria`),
    ...take(entries.filter((c) => !c.practiced && (c.R ?? 0) >= 0.4), 1, () => 'mai praticato')
  ]
  return {
    subjects: [...subjects].sort(([a], [b]) => (a === 'Altro' ? 1 : b === 'Altro' ? -1 : a.localeCompare(b))).map(([name, notes]) => ({ name, notes: [...notes.values()].sort((a, b) => a.title.localeCompare(b.title)) })),
    sources: input.notebooks.flatMap((nb) => nb.sources.filter((s) => s.status === 'ready').map((s) => ({ id: s.id, title: s.title, kind: s.kind, notebook: nb.name, info: s.info ?? '' }))),
    suggested
  }
}

export { matchConcepts } from '../../shared/practice-match'

/** Everything the tutor works from, in Italian: concepts, chains, Andrea's notes, his sources, his words. */
export async function buildMaterialContext(input: {
  material: Material
  graph: GraphData
  readNote: (path: string) => Promise<string>
  sourceText: (id: string) => Promise<{ title: string; text: SourceText } | null>
}): Promise<string> {
  const { material, graph } = input
  const byId = new Map(graph.concepts.map((c) => [c.id, c]))
  const picked = material.conceptIds.map((id) => byId.get(id)).filter((c) => c !== undefined)
  const pickedIds = new Set(picked.map((c) => c.id))
  const parts: string[] = []
  if (picked.length) {
    parts.push(`CONCETTI SCELTI (id | nome | enunciato) — usa questi id in "targets"\n${picked.map((c) => `${c.id} | ${c.name} | ${c.statement}`).join('\n')}`)
    const name = (id: string): string => byId.get(id)?.name ?? id
    const chains = graph.chains.filter((ch) => pickedIds.has(ch.conclusion) || ch.premises.some((p) => pickedIds.has(p)))
    if (chains.length) parts.push(`CATENE DI RAGIONAMENTO (premesse ⇒ conclusione)\n${chains.map((ch) => `${ch.premises.map(name).join(' + ')} ⇒ ${name(ch.conclusion)}`).join('\n')}`)
    let used = 0
    for (const path of [...new Set(picked.map((c) => c.birth))]) {
      if (used >= NOTES_TOTAL) break
      const text = await input.readNote(path).catch(() => '')
      if (!text) continue
      const cut = text.slice(0, Math.min(NOTE_CAP, NOTES_TOTAL - used))
      used += cut.length
      parts.push(`NOTA OBSIDIAN DI ANDREA (${path.split('/').pop()!.replace(/\.md$/, '')})\n${cut}${cut.length < text.length ? '\n[…nota troncata]' : ''}`)
    }
  } else parts.push('Materiale libero: nessun concetto della mappa, quindi i problemi non hanno target ("targets": []).')
  if (material.sourceIds.length) {
    const lines: string[] = []
    let used = 0
    for (const id of material.sourceIds) {
      const src = await input.sourceText(id)
      if (!src) continue
      for (const seg of src.text.segments) {
        const line = `(${src.title}, ${seg.label}) ${seg.text}`
        if (used + line.length > SOURCES_TOTAL) break
        lines.push(line)
        used += line.length
      }
    }
    if (lines.length) parts.push(`FONTI DAI NOTEBOOK (esercizi e materiale del corso: usali così come sono o creane di simili)\n${lines.join('\n')}`)
  }
  if (material.free.trim()) parts.push(`ARGOMENTO O PROBLEMA PORTATO DA ANDREA\n${material.free.trim()}`)
  return parts.join('\n\n---\n\n')
}
