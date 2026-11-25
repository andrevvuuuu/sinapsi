import type { Engine } from './settings-schema'
import type { Nota } from './nota-schema'

export type StoredNote = {
  id: string
  createdAt: number
  updatedAt: number
  status: 'generating' | 'ready' | 'error'
  error?: string
  sourcePath: string
  sourceTitle: string
  /** sha256 of the Obsidian note it was written from: a different hash means the note changed since. */
  sourceHash?: string
  sourceSections?: { title: string; hash: string }[]
  sourceIntroHash?: string
  sessionId?: string
  engine?: Engine
  dropped?: number
  nota?: Nota
}

export type NoteMeta = Omit<StoredNote, 'nota' | 'sourceSections' | 'sourceIntroHash'> & { title: string }
