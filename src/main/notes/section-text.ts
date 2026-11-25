export function normaliseTitle(value: string): { text: string; number: string | null } {
  const text = value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`]/g, '')
    .replace(/<[^>]*>/g, '')
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  const match = text.match(/^(?:§\s*)?(\d+)(?:\s*[.)]|\s+-|\s*:|(?=\s|$))\s*(.*)$/)
  const number = match?.[1] ?? null
  const rest = (match ? match[2] : text).replace(/^[\s.,;:!?()[\]{}§-]+|[\s.,;:!?()[\]{}§-]+$/g, '').trim()
  return { text: rest, number }
}

export function matchesTitle(heading: string, title: string): boolean {
  const actual = normaliseTitle(heading)
  const requested = normaliseTitle(title)
  if (actual.text === requested.text && actual.number === requested.number) return true
  if (!requested.text && requested.number !== null) return actual.number === requested.number
  return actual.number !== null && actual.number === requested.number &&
    (actual.text.startsWith(requested.text) || requested.text.startsWith(actual.text))
}

export function sectionText(note: string, titles: string[]): string {
  const lines = note.split(/\r?\n/)
  const chunks: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^#{1,6}\s+(.+?)\s*#*$/)
    if (!match || !titles.some((title) => matchesTitle(match[1], title))) continue
    const start = i
    i++
    while (i < lines.length && !/^#{1,6}\s+/.test(lines[i])) i++
    chunks.push(lines.slice(start, i).join('\n').trim())
    i--
  }
  return chunks.join('\n\n')
}
