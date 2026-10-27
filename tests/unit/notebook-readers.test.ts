import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { beforeAll, describe, expect, it } from 'vitest'
import { fmtTime, parseVtt, parseWhisperJson, readPdf, readSlides, readTextDoc } from '../../src/main/notebook/readers'
import { makePdf } from './helpers/pdf'

let dir: string
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sinapsi-readers-'))
})

describe('readPdf', () => {
  it('reads one segment per page labelled with the page number', async () => {
    const f = join(dir, 'a.pdf')
    await writeFile(f, makePdf(['Teorema di Rolle (enunciato)\nSia f continua in [a,b].', 'Dimostrazione: per Weierstrass f ha massimo e minimo.']))
    const t = await readPdf(f)
    expect(t.segments.map((s) => s.label)).toEqual(['p. 1', 'p. 2'])
    expect(t.segments[0].text).toContain('Teorema di Rolle (enunciato)')
    expect(t.segments[0].text).toContain('Sia f continua in [a,b].')
    expect(t.warnings).toEqual([])
  })
  it('counts pages without text (scans) and keeps the rest', async () => {
    const f = join(dir, 'b.pdf')
    await writeFile(f, makePdf(['Pagina con testo abbastanza lungo da contare.', '', '']))
    const t = await readPdf(f)
    expect(t.segments.map((s) => s.label)).toEqual(['p. 1'])
    expect(t.warnings).toEqual(['2 pagine senza testo (scansioni): non le posso leggere'])
  })
  it('refuses a PDF with no text at all', async () => {
    const f = join(dir, 'c.pdf')
    await writeFile(f, makePdf(['', '']))
    await expect(readPdf(f)).rejects.toThrow('PDF senza testo (scansione)')
  })
})

describe('readSlides', () => {
  const slide = (texts: string[]): string =>
    `<?xml version="1.0"?><p:sld xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree>${texts.map((t) => `<p:sp><p:txBody><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:txBody></p:sp>`).join('')}</p:spTree></p:cSld></p:sld>`
  it('reads slides in numeric order with their speaker notes', async () => {
    const f = join(dir, 'd.pptx')
    const zip = zipSync({
      'ppt/slides/slide1.xml': strToU8(slide(['Introduzione', 'Limiti &amp; continuità'])),
      'ppt/slides/slide2.xml': strToU8(slide(['Derivate'])),
      'ppt/slides/slide10.xml': strToU8(slide(['Fine'])),
      'ppt/slides/_rels/slide2.xml.rels': strToU8('<Relationships><Relationship Id="rId2" Target="../notesSlides/notesSlide7.xml"/></Relationships>'),
      'ppt/notesSlides/notesSlide7.xml': strToU8(slide(['Ricordare il rapporto incrementale']))
    })
    await writeFile(f, zip)
    const t = await readSlides(f)
    expect(t.segments.map((s) => s.label)).toEqual(['slide 1', 'slide 2', 'slide 10'])
    expect(t.segments[0].text).toBe('Introduzione\nLimiti & continuità')
    expect(t.segments[1].text).toBe('Derivate\n\nNote: Ricordare il rapporto incrementale')
  })
})

describe('readTextDoc', () => {
  it('splits markdown at headings and drops the frontmatter', () => {
    const t = readTextDoc('---\ntags: [x]\n---\nIntro breve.\n\n## Enunciato\nSia f…\n\n### Ipotesi\nContinua.')
    expect(t.segments).toEqual([
      { label: 'inizio', text: 'Intro breve.' },
      { label: 'Enunciato', text: '## Enunciato\nSia f…' },
      { label: 'Ipotesi', text: '### Ipotesi\nContinua.' }
    ])
  })
  it('splits plain text without headings into parts', () => {
    const para = 'parola '.repeat(300).trim()
    const t = readTextDoc([para, para, para].join('\n\n'))
    expect(t.segments.map((s) => s.label)).toEqual(['parte 1', 'parte 2'])
  })
  it('refuses an empty document', () => {
    expect(() => readTextDoc('  \n')).toThrow('vuot')
  })
})

describe('transcripts', () => {
  it('groups whisper segments into windows of about a minute', () => {
    const json = { text: 'x', segments: [
      { start: 0, end: 20, text: ' Oggi parliamo' },
      { start: 20, end: 59, text: ' di derivate.' },
      { start: 61, end: 80, text: ' Il rapporto incrementale' },
      { start: 3700, end: 3710, text: ' Fine.' }
    ] }
    expect(parseWhisperJson(json).segments).toEqual([
      { label: '0:00', start: 0, text: 'Oggi parliamo di derivate.' },
      { label: '1:01', start: 61, text: 'Il rapporto incrementale' },
      { label: '1:01:40', start: 3700, text: 'Fine.' }
    ])
  })
  it('reads a YouTube VTT without the rolling duplicates', () => {
    const vtt = `WEBVTT
Kind: captions
Language: it

00:00:00.000 --> 00:00:02.000 align:start position:0%
ciao<00:00:00.500><c> a</c><00:00:01.000><c> tutti</c>

00:00:02.000 --> 00:00:02.010 align:start position:0%
ciao a tutti


00:00:02.010 --> 00:00:05.000 align:start position:0%
ciao a tutti
oggi<00:00:03.000><c> vediamo</c><00:00:04.000><c> Rolle</c>

00:01:05.000 --> 00:01:07.000
seconda parte &amp; fine
`
    expect(parseVtt(vtt).segments).toEqual([
      { label: '0:00', start: 0, text: 'ciao a tutti oggi vediamo Rolle' },
      { label: '1:05', start: 65, text: 'seconda parte & fine' }
    ])
  })
  it('formats times', () => {
    expect(fmtTime(0)).toBe('0:00')
    expect(fmtTime(605.4)).toBe('10:05')
    expect(fmtTime(3725)).toBe('1:02:05')
  })
})
