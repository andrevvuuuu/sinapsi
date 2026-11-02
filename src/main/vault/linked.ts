import { createHash } from 'node:crypto'
import type { VaultIndex, VaultNote } from '../../shared/vault-types'

/** Antigravity writes a note several times in a row (draft, post-processing, verification): wait until it stays still. */
export const SETTLE_MS = 120_000

const isMoc = (n: VaultNote): boolean => n.type?.toUpperCase() === 'MOC'
const hash = (t: string): string => createHash('sha256').update(t).digest('hex')

/**
 * The notes linked to the edited ones, both ways ([[...]] from it and to it), the edited ones left out.
 * MOCs neither spread nor receive: one link added to a MOC would otherwise touch every note of the course.
 */
export function linkedTo(index: VaultIndex, edited: string[]): string[] {
  const byPath = new Map(index.notes.map((n) => [n.path, n]))
  const sources = new Set(edited.filter((p) => byPath.has(p) && !isMoc(byPath.get(p)!)))
  const out = new Set<string>()
  for (const n of index.notes) {
    if (isMoc(n) || !n.available) continue
    for (const l of n.links) {
      if (!l.resolved || !l.path) continue
      if (sources.has(l.path)) out.add(n.path)
      if (sources.has(n.path) && byPath.get(l.path)?.available && !isMoc(byPath.get(l.path)!)) out.add(l.path)
    }
  }
  for (const p of edited) out.delete(p)
  return [...out]
}

/**
 * Keeps Sinapsi in step with Obsidian: when a note is added or edited, its notes vive are rewritten and
 * the concepts of the notes linked to it extracted again. Only notes with a nota viva are touched
 * (the ones being studied), only once the note has settled, and only if its text really changed.
 */
export function createLinkedSync(deps: {
  vault: () => Promise<VaultIndex | null>
  readNote: (path: string) => Promise<string>
  /** Notes with a ready nota viva. */
  studied: () => Promise<Set<string>>
  refreshNote: (path: string) => Promise<unknown>
  reextract: (path: string) => Promise<unknown>
  settleMs?: number
}): { changed(paths: string[]): void; flush(): Promise<void>; stop(): void } {
  const settle = deps.settleMs ?? SETTLE_MS
  const timers = new Map<string, NodeJS.Timeout>()
  const seen = new Map<string, string>()
  const ready = new Set<string>()
  let chain: Promise<unknown> = Promise.resolve()

  async function run(paths: string[]): Promise<void> {
    const edited: string[] = []
    for (const p of paths) {
      const text = await deps.readNote(p).catch(() => null)
      if (text === null) continue
      const h = hash(text)
      if (seen.get(p) === h) continue
      seen.set(p, h)
      edited.push(p)
    }
    if (!edited.length) return
    const index = await deps.vault()
    if (!index) return
    const studied = await deps.studied()
    // The note's own nota viva: once rewritten, its concepts are extracted again by the generator.
    for (const p of edited) if (studied.has(p)) await deps.refreshNote(p).catch(() => undefined)
    for (const p of linkedTo(index, edited)) if (studied.has(p)) await deps.reextract(p).catch(() => undefined)
  }

  function fire(): void {
    const paths = [...ready]
    ready.clear()
    chain = chain.then(() => run(paths)).catch((e) => console.warn('[vault] aggiornamento note collegate fallito', e))
  }

  return {
    changed(paths) {
      for (const p of paths) {
        clearTimeout(timers.get(p))
        timers.set(
          p,
          setTimeout(() => {
            timers.delete(p)
            ready.add(p)
            fire()
          }, settle)
        )
      }
    },
    /** Runs what is waiting now, without the settle delay (tests). */
    async flush() {
      for (const [p, t] of timers) {
        clearTimeout(t)
        ready.add(p)
      }
      timers.clear()
      if (ready.size) fire()
      await chain
    },
    stop() {
      for (const t of timers.values()) clearTimeout(t)
      timers.clear()
    }
  }
}
