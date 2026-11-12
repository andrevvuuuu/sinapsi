import { readdir as fsReaddir, readFile as fsReadFile, stat } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { join, relative, sep } from 'node:path'
import matter from 'gray-matter'
import type { VaultIndex, VaultNote } from '../../shared/vault-types'
import { parseWikilinks, stripCode } from './links'
import { readSubjects } from './subjects'

// Old-style iCloud placeholder of a note that is not downloaded: ".Nota.md.icloud"
const ICLOUD_RE = /^\.(.+)\.md\.icloud$/

type Deps = { readFile: (path: string) => Promise<string>; readdir: (path: string) => Promise<Dirent[]> }
const defaultDeps: Deps = { readFile: (p) => fsReadFile(p, 'utf8'), readdir: (p) => fsReaddir(p, { withFileTypes: true }) }

const asList = (v: unknown): string[] =>
  (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,\s]+/) : []).map((x) => String(x).replace(/^#/, '').trim()).filter(Boolean)

async function listMarkdown(root: string, excluded: string[], deps: Deps): Promise<string[]> {
  const out: string[] = []
  async function walk(dir: string): Promise<void> {
    let entries: Dirent[]
    try {
      entries = await deps.readdir(dir)
    } catch (e) {
      if (dir === root) throw e
      console.warn(`[vault] cartella non leggibile: ${dir}`)
      return
    }
    for (const e of entries) {
      if (ICLOUD_RE.test(e.name)) {
        out.push(join(dir, e.name))
        continue
      }
      if (e.name.startsWith('.') || excluded.includes(e.name)) continue
      const p = join(dir, e.name)
      if (e.isDirectory()) await walk(p)
      else if (e.name.endsWith('.md')) out.push(p)
    }
  }
  await walk(root)
  return out
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const k = i++
      out[k] = await fn(items[k])
    }
  }))
  return out
}

/** Read-only index of the vault. Unreadable files (iCloud placeholders) are kept with available: false. */
export async function scanVault(root: string, excluded: string[], partial: Partial<Deps> = {}): Promise<VaultIndex> {
  const deps: Deps = { ...defaultDeps, ...partial }
  const files = await listMarkdown(root, excluded, deps)
  const subjects = readSubjects(root)
  const notes = await mapLimit(files, 16, async (path): Promise<VaultNote> => {
    const rel = relative(root, path)
    const parts = rel.split(sep)
    const file = parts[parts.length - 1]
    const placeholder = file.match(ICLOUD_RE)
    const title = placeholder ? placeholder[1] : file.replace(/\.md$/, '')
    const base: VaultNote = { path, title, folder: parts.slice(0, -1).join('/'), tags: [], aliases: [], links: [], headings: [], blockIds: [], subject: null, mtime: 0, size: 0, available: false }
    if (placeholder) return base
    try {
      const [text, st] = await Promise.all([deps.readFile(path), stat(path)])
      const { data, content } = matter(text)
      const body = stripCode(content)
      const tags = [...new Set([...asList(data.tags), ...[...body.matchAll(/(?:^|\s)#([\p{L}][\p{L}\p{N}_/-]*)/gu)].map((m) => m[1])])]
      const type = asList(data.Type ?? data.type)[0]
      const verifica = ['ok', 'dubbi', 'errori'].find((v) => v === String(data.Verifica ?? '').trim()) as VaultNote['verifica']
      return {
        ...base,
        tags,
        ...(type ? { type } : {}),
        ...(verifica ? { verifica } : {}),
        aliases: asList(data.aliases).length ? (Array.isArray(data.aliases) ? data.aliases.map(String) : [String(data.aliases)]) : [],
        links: parseWikilinks(content).map((l) => ({ ...l, resolved: false })),
        headings: [...body.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].map((m) => m[1]),
        blockIds: [...body.matchAll(/(?:^|\s)\^([\w-]+)\s*$/gm)].map((m) => m[1]),
        subject: subjects.find((s) => tags.includes(s.tag))?.tag ?? null,
        mtime: st.mtimeMs,
        size: st.size,
        available: true
      }
    } catch {
      return base
    }
  })
  // Resolve link targets by title, then alias (case-insensitive). Same title in several folders:
  // the folder written in the link, else the closest folder to the linking note, else the shortest path.
  const byName = new Map<string, VaultNote[]>()
  const add = (key: string, n: VaultNote): void => void byName.set(key, [...(byName.get(key) ?? []), n])
  for (const n of notes) add(n.title.toLowerCase(), n)
  for (const n of notes) for (const a of n.aliases) if (!byName.has(a.toLowerCase())) add(a.toLowerCase(), n)
  const shared = (a: string, b: string): number => {
    const x = a.split('/')
    const y = b.split('/')
    let k = 0
    while (k < x.length && k < y.length && x[k] === y[k] && x[k]) k++
    return k
  }
  for (const n of notes)
    n.links = n.links.map((l) => {
      let hits = byName.get(l.target.toLowerCase()) ?? []
      if (l.folder && hits.length > 1) {
        const f = l.folder.toLowerCase()
        const inFolder = hits.filter((h) => h.folder.toLowerCase() === f || h.folder.toLowerCase().endsWith('/' + f))
        if (inFolder.length) hits = inFolder
      }
      const best = [...hits].sort((a, b) => shared(b.folder, n.folder) - shared(a.folder, n.folder) || a.path.length - b.path.length)[0]
      return best ? { ...l, target: best.title, path: best.path, resolved: true } : { ...l, resolved: false }
    })
  return { root, notes, subjects: subjects.map((s) => ({ id: s.tag, color: s.color })), scannedAt: Date.now() }
}
