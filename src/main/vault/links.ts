import type { VaultLink } from '../../shared/vault-types'

/** Removes fenced code blocks and inline code so links and headings inside them are ignored. */
export function stripCode(md: string): string {
  return md.replace(/```[\s\S]*?(```|$)/g, '').replace(/`[^`\n]*`/g, '')
}

export function parseWikilinks(md: string): Omit<VaultLink, 'resolved'>[] {
  const out: Omit<VaultLink, 'resolved'>[] = []
  for (const m of stripCode(md).matchAll(/!?\[\[([^\]\n]+?)\]\]/g)) {
    // Inside tables the pipe is escaped: [[Nota\|alias]].
    const [main, alias] = m[1].split(/\\?\|/)
    const [rawTarget, ...rest] = main.split('#')
    const anchor = rest.join('#').trim()
    const parts = rawTarget.trim().split('/')
    const name = parts.pop()!
    // Attachments (images, PDFs, audio…) are not notes.
    if (/\.[a-z0-9]{2,5}$/i.test(name) && !/\.md$/i.test(name)) continue
    const link: Omit<VaultLink, 'resolved'> = { target: name.replace(/\.md$/, '') }
    if (parts.length) link.folder = parts.join('/')
    if (anchor.startsWith('^')) link.block = anchor.slice(1)
    else if (anchor) link.heading = anchor
    if (alias?.trim()) link.alias = alias.trim()
    if (link.target) out.push(link)
  }
  return out
}
