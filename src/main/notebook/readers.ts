import { readFile } from 'node:fs/promises'
import { unzipSync, strFromU8 } from 'fflate'
import type { Segment, SourceText } from '../../shared/notebook-types'

const PART = 5000
const MIN_PAGE_TEXT = 20
const WINDOW_S = 60

export function fmtTime(seconds: number): string {
  const s = Math.floor(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

const tidy = (t: string): string =>
  t
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

export async function readPdf(file: string): Promise<SourceText> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const data = new Uint8Array(await readFile(file))
  const task = getDocument({ data, useSystemFonts: true, isEvalSupported: false })
  const doc = await task.promise
  const segments: Segment[] = []
  let empty = 0
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const content = await page.getTextContent()
      let text = ''
      for (const it of content.items) if ('str' in it) text += it.str + (it.hasEOL ? '\n' : ' ')
      text = tidy(text)
      if (text.replace(/\s/g, '').length < MIN_PAGE_TEXT) empty++
      else segments.push({ label: `p. ${p}`, text })
    }
  } finally {
    await task.destroy()
  }
  if (!segments.length) throw new Error('PDF senza testo (scansione): non lo posso leggere')
  const warnings = empty ? [`${empty} ${empty === 1 ? 'pagina' : 'pagine'} senza testo (scansioni): non le posso leggere`] : []
  return { segments, warnings }
}

const decodeXml = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')

/** Paragraphs of a DrawingML part: runs of one <a:p> joined, paragraphs on their own line. */
function xmlText(xml: string): string {
  const paras = xml.split(/<\/a:p>/).map((p) => [...p.matchAll(/<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g)].map((m) => decodeXml(m[1])).join(''))
  return paras.map((p) => p.trim()).filter(Boolean).join('\n')
}

export async function readSlides(file: string): Promise<SourceText> {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(new Uint8Array(await readFile(file)))
  } catch {
    throw new Error('Presentazione illeggibile (serve un file .pptx)')
  }
  const slides = Object.keys(files)
    .map((k) => /^ppt\/slides\/slide(\d+)\.xml$/.exec(k))
    .filter((m): m is RegExpExecArray => m !== null)
    .sort((a, b) => Number(a[1]) - Number(b[1]))
  const segments: Segment[] = []
  for (const m of slides) {
    let text = xmlText(strFromU8(files[m[0]]))
    const rels = files[`ppt/slides/_rels/slide${m[1]}.xml.rels`]
    const target = rels && /Target="\.\.\/notesSlides\/(notesSlide\d+\.xml)"/.exec(strFromU8(rels))
    const notes = target && files[`ppt/notesSlides/${target[1]}`]
    // Notes parts also hold the slide-number placeholder: drop a bare number.
    const noteText = notes ? xmlText(strFromU8(notes)).split('\n').filter((l) => !/^\d+$/.test(l)).join('\n') : ''
    if (noteText) text += `\n\nNote: ${noteText}`
    if (text.trim()) segments.push({ label: `slide ${m[1]}`, text })
  }
  if (!segments.length) throw new Error('Presentazione senza testo')
  return { segments, warnings: [] }
}

export function readTextDoc(raw: string, _title: string): SourceText {
  const text = raw.replace(/^---\n[\s\S]*?\n---\n?/, '').replace(/\r\n/g, '\n')
  if (!text.trim()) throw new Error('Documento vuoto')
  const lines = text.split('\n')
  const hasHeadings = lines.some((l) => /^#{1,6}\s+\S/.test(l))
  const segments: Segment[] = []
  if (hasHeadings) {
    let label = 'inizio'
    let buf: string[] = []
    const flush = (): void => {
      const t = buf.join('\n').trim()
      if (t) segments.push({ label, text: t })
    }
    for (const l of lines) {
      const h = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(l)
      if (h) {
        flush()
        label = h[1]
        buf = [l]
      } else buf.push(l)
    }
    flush()
  } else {
    let buf = ''
    for (const p of text.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean)) {
      if (buf && buf.length + 2 + p.length > PART) {
        segments.push({ label: `parte ${segments.length + 1}`, text: buf })
        buf = p
      } else buf = buf ? `${buf}\n\n${p}` : p
    }
    if (buf) segments.push({ label: `parte ${segments.length + 1}`, text: buf })
  }
  return { segments, warnings: [] }
}

/** Timed lines → segments of about a minute, labelled with their start time. */
function windows(lines: { start: number; text: string }[]): SourceText {
  const segments: Segment[] = []
  let cur: { start: number; parts: string[] } | null = null
  const flush = (): void => {
    if (cur && cur.parts.length) segments.push({ label: fmtTime(cur.start), start: cur.start, text: cur.parts.join(' ') })
  }
  for (const l of lines) {
    const t = l.text.trim()
    if (!t) continue
    if (!cur || l.start - cur.start >= WINDOW_S) {
      flush()
      cur = { start: l.start, parts: [] }
    }
    cur.parts.push(t)
  }
  flush()
  return { segments, warnings: [] }
}

export function parseWhisperJson(json: unknown): SourceText {
  const segs = (json as { segments?: { start?: unknown; text?: unknown }[] })?.segments
  if (!Array.isArray(segs)) throw new Error('Trascrizione illeggibile')
  return windows(segs.filter((s) => typeof s.start === 'number' && typeof s.text === 'string').map((s) => ({ start: s.start as number, text: s.text as string })))
}

const vttTime = (t: string): number => {
  const p = t.split(':').map(Number)
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]
}

export function parseVtt(vtt: string): SourceText {
  const lines: { start: number; text: string }[] = []
  let last = ''
  for (const block of vtt.replace(/\r\n/g, '\n').split(/\n\s*\n/)) {
    const rows = block.split('\n')
    const ti = rows.findIndex((r) => r.includes('-->'))
    if (ti < 0) continue
    const start = vttTime(rows[ti].split('-->')[0].trim())
    for (const r of rows.slice(ti + 1)) {
      const t = decodeXml(r.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()
      // Auto captions repeat the previous line before adding new words.
      if (!t || t === last) continue
      last = t
      lines.push({ start, text: t })
    }
  }
  return windows(lines)
}
