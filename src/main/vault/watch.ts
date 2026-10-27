import { watch } from 'chokidar'
import { relative, sep } from 'node:path'

/** Calls onChange with the changed paths, debounced; returns an unsubscribe function. */
export function watchVault(root: string, excluded: string[], onChange: (paths: string[]) => void): () => void {
  const ignored = (p: string): boolean => relative(root, p).split(sep).some((part) => part.startsWith('.') || excluded.includes(part))
  const w = watch(root, { ignoreInitial: true, ignored })
  let pending = new Set<string>()
  let timer: NodeJS.Timeout | undefined
  w.on('all', (_event, path) => {
    if (!path.endsWith('.md')) return
    pending.add(path)
    clearTimeout(timer)
    timer = setTimeout(() => {
      const paths = [...pending]
      pending = new Set()
      onChange(paths)
    }, 500)
  })
  return () => {
    clearTimeout(timer)
    void w.close()
  }
}

/**
 * Re-creates the vault watcher after a settings change. Two quick changes in a row: only the watcher
 * for the last one stays alive (the earlier call notices it is stale after its await).
 */
export function createRewatcher(
  load: () => Promise<{ vaultPath: string; excludedFolders: string[] }>,
  watch: (root: string, excluded: string[], onChange: (paths: string[]) => void) => () => void,
  onChange: (paths: string[]) => void
): () => Promise<void> {
  let stop: (() => void) | undefined
  let gen = 0
  return async () => {
    const mine = ++gen
    const s = await load()
    if (mine !== gen) return
    stop?.()
    stop = undefined
    try {
      stop = watch(s.vaultPath, s.excludedFolders, onChange)
    } catch {
      stop = undefined
    }
  }
}
