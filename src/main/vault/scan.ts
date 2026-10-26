import { readdir, readFile as fsReadFile, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import matter from 'gray-matter'
import type { VaultIndex, VaultNote } from '../../shared/vault-types'
import { parseWikilinks, stripCode } from './links'
import { readSubjects } from './subjects'

type Deps = { readFile: (path: string) => Promise<string> }
const defaultDeps: Deps = { readFile: (p) => fsReadFile(p, 'utf8') }

const asList = (v: unknown): string[] =>
  (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,\s]+/) : []).map((x) => String(x).replace(/^#/, '').trim()).filter(Boolean)

async function listMarkdown(root: string, excluded: string[]): Promise<string[]> {
  const out: string[] = []
  async function walk(dir: string): Promise<void> {
    for (const e of await readdir(dir, { withFileTypes: true })) {
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
export async function scanVault(root: string, excluded: string[], deps: Deps = defaultDeps): Promise<VaultIndex> {
  const files = await listMarkdown(root, excluded)
  const subjects = readSubjects(root)
  const notes = await mapLimit(files, 16, async (path): Promise<VaultNote> => {
    const rel = relative(root, path)
    const parts = rel.split(sep)
    const title = parts[parts.length - 1].replace(/\.md$/, '')
    const base: VaultNote = { path, title, folder: parts.slice(0, -1).join('/'), tags: [], aliases: [], links: [], headings: [], blockIds: [], subject: null, mtime: 0, size: 0, available: false }
    try {
      const [text, st] = await Promise.all([deps.readFile(path), stat(path)])
      const { data, content } = matter(text)
      const body = stripCode(content)
      const tags = [...new Set([...asList(data.tags), ...[...body.matchAll(/(?:^|\s)#([\p{L}][\p{L}\p{N}_/-]*)/gu)].map((m) => m[1])])]
      const type = asList(data.Type ?? data.type)[0]
      return {
        ...base,
        tags,
        ...(type ? { type } : {}),
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
  // Resolve link targets by title, then alias (case-insensitive).
  const byName = new Map<string, string>()
  for (const n of notes) byName.set(n.title.toLowerCase(), n.title)
  for (const n of notes) for (const a of n.aliases) if (!byName.has(a.toLowerCase())) byName.set(a.toLowerCase(), n.title)
  for (const n of notes)
    n.links = n.links.map((l) => {
      const hit = byName.get(l.target.toLowerCase())
      return hit ? { ...l, target: hit, resolved: true } : { ...l, resolved: false }
    })
  return { root, notes, subjects: subjects.map((s) => ({ id: s.tag, color: s.color })), scannedAt: Date.now() }
}
