/** Raw JSON, the first ```json fence, or the outermost {…} / […] inside text. */
export function extractJson(text: string): unknown {
  const t = text.trim()
  try {
    return JSON.parse(t)
  } catch {
    /* try the other shapes */
  }
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) {
    try {
      return JSON.parse(fence[1].trim())
    } catch {
      /* fall through */
    }
  }
  const starts = [t.indexOf('{'), t.indexOf('[')].filter((i) => i >= 0)
  if (starts.length) {
    const start = Math.min(...starts)
    const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'))
    if (end > start) return JSON.parse(t.slice(start, end + 1))
  }
  throw new SyntaxError('nessun JSON nella risposta')
}
