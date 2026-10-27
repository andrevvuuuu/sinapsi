import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NOTA_FORMAT, NotaSchema, parseNota } from '../../src/shared/nota-schema'

const fixture = (): any => JSON.parse(readFileSync(join(__dirname, '../fixtures/nota-min.json'), 'utf8'))

describe('parseNota', () => {
  it('parses the minimal fixture with nothing dropped', () => {
    const { nota, dropped } = parseNota(fixture())
    expect(dropped).toBe(0)
    expect(nota.title).toBe('Teorema di Rolle')
    expect(nota.sections).toHaveLength(2)
    expect(nota.sections[0].blocks.map((b) => b.type)).toEqual(['prose', 'theorem', 'figure', 'quiz'])
    const proof = nota.sections[1].blocks[0]
    expect(proof.type === 'proof' && proof.figure?.stepParams).toEqual([{ p: 1 }, { p: 0 }])
  })
  it('drops a block of unknown type and keeps the rest', () => {
    const raw = fixture()
    raw.sections[0].blocks.splice(1, 0, { type: 'video', url: 'x' })
    const { nota, dropped } = parseNota(raw)
    expect(dropped).toBe(1)
    expect(nota.sections[0].blocks).toHaveLength(4)
  })
  it('drops a figure whose expression does not compile', () => {
    const raw = fixture()
    raw.sections[0].blocks[2].functions.f = 'x^^2'
    const { nota, dropped } = parseNota(raw)
    expect(dropped).toBe(1)
    expect(nota.sections[0].blocks.some((b) => b.type === 'figure')).toBe(false)
  })
  it('drops a figure whose draggable point names no param', () => {
    const raw = fixture()
    raw.sections[0].blocks[2].elements[2].drag = 'q'
    expect(parseNota(raw).dropped).toBe(1)
  })
  it('drops a figure whose points.at names no function', () => {
    const raw = fixture()
    raw.sections[0].blocks[2].points.at = 'g'
    expect(parseNota(raw).dropped).toBe(1)
  })
  it('drops a proof whose figure stepParams name an unknown param', () => {
    const raw = fixture()
    raw.sections[1].blocks[0].figure.stepParams = [{ z: 1 }]
    expect(parseNota(raw).dropped).toBe(1)
  })
  it('drops a quiz whose why does not match the options', () => {
    const raw = fixture()
    raw.sections[0].blocks[3].why = ['solo uno']
    expect(parseNota(raw).dropped).toBe(1)
  })
  it('drops a quiz whose correct index is out of range', () => {
    const raw = fixture()
    raw.sections[0].blocks[3].correct = 2
    expect(parseNota(raw).dropped).toBe(1)
  })
  it('drops nested tabs but keeps valid tab content', () => {
    const raw = fixture()
    raw.sections[1].blocks.push({
      type: 'tabs',
      tabs: [{ label: 'Uno', blocks: [{ type: 'prose', md: 'ok' }, { type: 'tabs', tabs: [] }] }]
    })
    const { nota, dropped } = parseNota(raw)
    expect(dropped).toBe(1)
    const tabs = nota.sections[1].blocks[2]
    expect(tabs.type === 'tabs' && tabs.tabs[0].blocks).toHaveLength(1)
  })
  it('keeps a section whose blocks were all dropped', () => {
    const raw = fixture()
    raw.sections[1].blocks = [{ type: 'nope' }]
    const { nota } = parseNota(raw)
    expect(nota.sections[1].title).toBe('Dimostrazione')
    expect(nota.sections[1].blocks).toEqual([])
  })
  it('throws when the top level is unusable', () => {
    const raw = fixture()
    delete raw.sections
    expect(() => parseNota(raw)).toThrow()
    expect(() => parseNota('ciao')).toThrow()
  })
  it('makes section ids unique', () => {
    const raw = fixture()
    raw.sections[1].id = 's1'
    delete raw.sections[0].id
    const ids = parseNota(raw).nota.sections.map((s) => s.id)
    expect(new Set(ids).size).toBe(2)
  })
  it('fills optional arrays with defaults', () => {
    const raw = fixture()
    delete raw.aka
    delete raw.provenance
    delete raw.recap
    const { nota } = parseNota(raw)
    expect(nota.aka).toEqual([])
    expect(nota.provenance).toEqual({ fromNote: [], added: [], flagged: [] })
    expect(nota.recap).toEqual({ ideas: [], formulas: [] })
  })
})

describe('NotaSchema', () => {
  it('is usable by the bridge and reports dropped blocks', () => {
    const r = NotaSchema.safeParse(fixture())
    expect(r.success).toBe(true)
    expect(r.success && r.data.dropped).toBe(0)
    expect(NotaSchema.safeParse({}).success).toBe(false)
  })
  it('has a format description naming every block type', () => {
    for (const t of ['prose', 'theorem', 'decode', 'proof', 'figure', 'quiz', 'flashcard', 'tryit', 'exercise', 'glossary', 'flag', 'session', 'why', 'tabs'])
      expect(NOTA_FORMAT).toContain(`"${t}"`)
    expect(NOTA_FORMAT).toContain('greenWhen')
    expect(NOTA_FORMAT).toContain('{{')
  })
})
