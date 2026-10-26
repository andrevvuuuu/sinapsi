export type VaultLink = { target: string; heading?: string; block?: string; alias?: string; resolved: boolean }

export type VaultNote = {
  path: string
  title: string
  folder: string
  tags: string[]
  type?: string
  aliases: string[]
  links: VaultLink[]
  headings: string[]
  blockIds: string[]
  subject: string | null
  mtime: number
  size: number
  available: boolean
}

export type VaultIndex = { root: string; notes: VaultNote[]; subjects: { id: string; color: string }[]; scannedAt: number }
