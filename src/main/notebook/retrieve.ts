import type { SourceText } from '../../shared/notebook-types'

export type Chunk = { sourceId: string; title: string; label: string; text: string; start?: number; order: number }

export const FULL_BUDGET = 120_000
export const PICK_BUDGET = 40_000

/** Pieces a segment of at most max chars, cutting at sentence ends, else at spaces; labels never mix. */
function pieces(text: string, max: number): string[] {
  const sentences = text.match(/[^.!?\n]+(?:[.!?]+|\n+|$)/g)?.map((s) => s.trim()).filter(Boolean) ?? []
  const out: string[] = []
  let buf = ''
  const push = (s: string): void => {
    if (!buf) buf = s
    else if (buf.length + 1 + s.length <= max) buf += ' ' + s
    else {
      out.push(buf)
      buf = s
    }
  }
  for (const s of sentences) {
    if (s.length <= max) {
      push(s)
      continue
    }
    for (const w of s.split(' ')) {
      if (buf && buf.length + 1 + w.length > max) {
        out.push(buf)
        buf = w
      } else buf = buf ? `${buf} ${w}` : w
    }
  }
  if (buf) out.push(buf)
  return out
}

export function chunk(sourceId: string, title: string, t: SourceText, max = 1200, startOrder = 0): Chunk[] {
  const out: Chunk[] = []
  for (const seg of t.segments)
    for (const text of pieces(seg.text, max)) out.push({ sourceId, title, label: seg.label, text, ...(seg.start !== undefined ? { start: seg.start } : {}), order: startOrder + out.length })
  return out
}

const STOP = new Set(
  (
    'il lo la i gli le un uno una di da in con su per tra fra a e o ma se che chi cui non del dello della dei degli delle al allo alla ai agli alle dal dallo dalla dai dagli dalle nel nello nella nei negli nelle sul sullo sulla sui sugli sulle col è sono era essere ha hanno ho come cosa quale quali quando dove perché anche più meno molto questo questa questi queste quello quella si ci ne mi ti vi sua suo suoi sue loro mio mia ' +
    'the of and or to in is are was be by for on with as at an a it this that these those from what which how why who'
  )
    .split(' ')
    .map((w) => w.normalize('NFD').replace(/[̀-ͯ]/g, ''))
)

export function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .map((w) => w.slice(0, 6))
}

/**
 * Everything, in source order, when the selected sources fit the prompt; otherwise the best BM25 chunks
 * up to `pick` chars, still in source order so neighbouring passages read naturally.
 */
export function selectExcerpts(chunks: Chunk[], query: string, budget = FULL_BUDGET, pick = PICK_BUDGET): { excerpts: Chunk[]; full: boolean } {
  const total = chunks.reduce((n, c) => n + c.text.length, 0)
  if (total <= budget) return { excerpts: chunks, full: true }
  const q = [...new Set(tokens(query))]
  const docs = chunks.map((c) => tokens(c.text))
  const avg = docs.reduce((n, d) => n + d.length, 0) / Math.max(1, docs.length)
  const df = new Map<string, number>()
  for (const d of docs) for (const w of new Set(d)) df.set(w, (df.get(w) ?? 0) + 1)
  const N = docs.length
  const score = docs.map((d) => {
    const tf = new Map<string, number>()
    for (const w of d) tf.set(w, (tf.get(w) ?? 0) + 1)
    let s = 0
    for (const w of q) {
      const f = tf.get(w)
      if (!f) continue
      const n = df.get(w) ?? 0
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
      s += (idf * f * 2.2) / (f + 1.2 * (0.25 + (0.75 * d.length) / avg))
    }
    return s
  })
  const ranked = chunks.map((c, i) => ({ c, s: score[i] })).sort((a, b) => b.s - a.s || a.c.order - b.c.order)
  const picked: Chunk[] = []
  let used = 0
  for (const { c } of ranked) {
    if (used + c.text.length > pick) continue
    picked.push(c)
    used += c.text.length
  }
  return { excerpts: picked.sort((a, b) => a.order - b.order), full: false }
}
