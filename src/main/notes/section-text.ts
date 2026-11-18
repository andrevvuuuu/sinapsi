export function sectionText(note: string, titles: string[]): string {
  const lines = note.split(/\r?\n/)
  const chunks: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^#{1,6}\s+(.+?)\s*#*$/)
    if (!match || !titles.some((title) => title.toLocaleLowerCase() === match[1].toLocaleLowerCase())) continue
    const start = i
    i++
    while (i < lines.length && !/^#{1,6}\s+/.test(lines[i])) i++
    chunks.push(lines.slice(start, i).join('\n').trim())
    i--
  }
  return chunks.join('\n\n')
}
