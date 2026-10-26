import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Subjects come from the Obsidian graph color groups (`tag:#x` → color). */
export function readSubjects(root: string): { tag: string; color: string }[] {
  try {
    const g = JSON.parse(readFileSync(join(root, '.obsidian', 'graph.json'), 'utf8'))
    return (g.colorGroups ?? [])
      .map((c: { query?: string; color?: { rgb?: number } }) => {
        const tag = c.query?.match(/tag:\s*#?([\p{L}\p{N}_/-]+)/u)?.[1]
        return tag && typeof c.color?.rgb === 'number' ? { tag, color: '#' + c.color.rgb.toString(16).padStart(6, '0') } : null
      })
      .filter(Boolean)
  } catch {
    return []
  }
}
