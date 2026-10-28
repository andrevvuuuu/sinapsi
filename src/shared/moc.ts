import type { VaultNote } from './vault-types'

/** A Map of Content: its title ends in "MOC", its type says so, or it carries the #moc tag. */
export const isMoc = (n: Pick<VaultNote, 'title' | 'type'> & { tags?: string[] }): boolean =>
  /\bMOC$/i.test(n.title) || /moc/i.test(n.type ?? '') || (n.tags ?? []).some((t) => /(^|\/)mocs?$/i.test(t.replace(/^#/, '')))
