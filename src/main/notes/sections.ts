import { createHash } from 'node:crypto'

export type SourceSection = {
  title: string
  text: string
  hash: string
}

export type SplitResult = {
  intro: string
  sections: SourceSection[]
}

export const introHash = (intro: string): string => createHash('sha256').update(intro).digest('hex')

function extractHeading(line: string): string | null {
  const m = line.match(/^##\s+(.*)$/)
  if (!m) return null
  const raw = m[1].trim()
  const stripped = raw.replace(/\s+#+$/, '').trim()
  return stripped || raw
}

/**
 * Strips leading frontmatter like bodyHash, splits on level-2 headings (## ...),
 * ignoring headings inside fenced code blocks (```).
 * Level 3+ headings remain inside their parent section.
 */
export function splitSections(text: string): SplitResult {
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
  const lines = body.split(/\r?\n/)
  let inCode = false
  const sectionIndices: { lineIndex: number; title: string }[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*```/.test(line)) {
      inCode = !inCode
      continue
    }
    if (!inCode) {
      const heading = extractHeading(line)
      if (heading !== null) {
        sectionIndices.push({ lineIndex: i, title: heading })
      }
    }
  }

  if (sectionIndices.length === 0) {
    return { intro: body.trim(), sections: [] }
  }

  const intro = lines.slice(0, sectionIndices[0].lineIndex).join('\n').trim()
  const sections: SourceSection[] = []

  for (let s = 0; s < sectionIndices.length; s++) {
    const start = sectionIndices[s].lineIndex
    const end = s + 1 < sectionIndices.length ? sectionIndices[s + 1].lineIndex : lines.length
    const secText = lines.slice(start, end).join('\n').trim()
    const secHash = createHash('sha256').update(secText).digest('hex')
    sections.push({
      title: sectionIndices[s].title,
      text: secText,
      hash: secHash
    })
  }

  return { intro, sections }
}
