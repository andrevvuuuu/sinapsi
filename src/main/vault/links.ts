import type { VaultLink } from '../../shared/vault-types'

/** Removes fenced code blocks and inline code so links and headings inside them are ignored. */
export function stripCode(md: string): string {
  return md.replace(/```[\s\S]*?(```|$)/g, '').replace(/`[^`\n]*`/g, '')
}

/** Extensions of attachments: "Teorema 2.10" is a note, "grafico.png" is not. */
const ATTACHMENT = /\.(png|jpe?g|gif|svg|webp|bmp|tiff?|heic|avif|pdf|mp3|m4a|wav|ogg|flac|aac|opus|mp4|mov|m4v|webm|mkv|avi|zip|pptx?|docx?|xlsx?|csv|canvas|excalidraw|base)$/i

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
    if (ATTACHMENT.test(name)) continue
    const link: Omit<VaultLink, 'resolved'> = { target: name.replace(/\.md$/, '') }
    if (parts.length) link.folder = parts.join('/')
    if (anchor.startsWith('^')) link.block = anchor.slice(1)
    else if (anchor) link.heading = anchor
    if (alias?.trim()) link.alias = alias.trim()
    if (link.target) out.push(link)
  }
  return out
}
