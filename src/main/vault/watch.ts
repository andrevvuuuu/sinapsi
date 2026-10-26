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
