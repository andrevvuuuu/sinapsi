import { createHash } from 'node:crypto'

/**
 * Hash of a note's text without its leading frontmatter: metadata written by the vault's automation
 * (the tutor's "Lezioni:", the correctness check's "Verificata:") is not an edit worth rewriting a nota viva for.
 */
export const bodyHash = (text: string): string => createHash('sha256').update(text.replace(/^---\n[\s\S]*?\n---\n/, '')).digest('hex')
