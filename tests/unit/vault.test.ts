import { readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseWikilinks } from '../../src/main/vault/links'
import { scanVault } from '../../src/main/vault/scan'
import { readSubjects } from '../../src/main/vault/subjects'

const ROOT = resolve('tests/fixtures/vault')
const EXCLUDED = ['.obsidian', '.antigravity', '.trash', 'Prompts']

describe('parseWikilinks', () => {
  it('parses heading, block and alias variants', () => {
    expect(parseWikilinks('[[A]] [[B|b]] [[C#Titolo]] [[D#^blk|d]]')).toEqual([
      { target: 'A' },
      { target: 'B', alias: 'b' },
      { target: 'C', heading: 'Titolo' },
      { target: 'D', block: 'blk', alias: 'd' }
    ])
  })
  it('ignores links in code fences and inline code', () => {
    expect(parseWikilinks('```\n[[X]]\n```\n`[[Y]]` [[Z]]')).toEqual([{ target: 'Z' }])
  })
})

describe('scanVault', () => {
  it('lists notes and skips excluded and dot folders', async () => {
    const idx = await scanVault(ROOT, EXCLUDED)
    expect(idx.notes.map((n) => n.title).sort()).toEqual(['Bicipite', 'Senza tag', 'Teorema di Lagrange', 'Teorema di Rolle'])
  })

  it('reads frontmatter, headings and block ids', async () => {
    const rolle = (await scanVault(ROOT, EXCLUDED)).notes.find((n) => n.title === 'Teorema di Rolle')!
    expect(rolle).toMatchObject({ folder: 'Matematica', type: 'Teorema', aliases: ['Rolle'], blockIds: ['teo-rolle'], available: true })
    expect(rolle.headings).toContain('2. Enunciato')
  })

  it('resolves links by title and alias and flags missing notes', async () => {
    const lag = (await scanVault(ROOT, EXCLUDED)).notes.find((n) => n.title === 'Teorema di Lagrange')!
    const rolle = join(ROOT, 'Matematica', 'Teorema di Rolle.md')
    expect(lag.links).toEqual([
      { target: 'Teorema di Rolle', block: 'teo-rolle', alias: 'Rolle', resolved: true, path: rolle },
      { target: 'Teorema di Rolle', heading: '2. Enunciato', resolved: true, path: rolle },
      { target: 'Teorema di Rolle', resolved: true, path: rolle },
      { target: 'Nota Inesistente', resolved: false }
    ])
  })

  it('assigns subjects and colors from the Obsidian color groups', async () => {
    const idx = await scanVault(ROOT, EXCLUDED)
    expect(idx.notes.find((n) => n.title === 'Teorema di Rolle')!.subject).toBe('matematica')
    expect(idx.notes.find((n) => n.title === 'Bicipite')!.subject).toBe('bodybuilding')
    expect(idx.notes.find((n) => n.title === 'Senza tag')!.subject).toBeNull()
    expect(readSubjects(ROOT)).toEqual([
      { tag: 'matematica', color: '#de77a9' },
      { tag: 'bodybuilding', color: '#885bf1' }
    ])
  })

  it('keeps going when a file cannot be read (iCloud placeholder)', async () => {
    const realRead = (p: string) => readFile(p, 'utf8')
    const idx = await scanVault(ROOT, EXCLUDED, {
      readFile: (p) => (p.endsWith('Bicipite.md') ? Promise.reject(Object.assign(new Error('busy'), { code: 'EAGAIN' })) : realRead(p))
    })
    expect(idx.notes.find((n) => n.title === 'Bicipite')).toMatchObject({ available: false })
    expect(idx.notes.find((n) => n.title === 'Teorema di Rolle')).toMatchObject({ available: true })
  })

  it('reads the outcome of the correctness check, ignoring unknown values', async () => {
    const realRead = (p: string) => readFile(p, 'utf8')
    const idx = await scanVault(ROOT, EXCLUDED, {
      readFile: async (p) =>
        p.endsWith('Teorema di Rolle.md') ? '---\nVerifica: errori\nVerificata: 2026-11-02\n---\n# Rolle' : p.endsWith('Bicipite.md') ? '---\nVerifica: forse\n---\n' : realRead(p)
    })
    expect(idx.notes.find((n) => n.title === 'Teorema di Rolle')?.verifica).toBe('errori')
    expect(idx.notes.find((n) => n.title === 'Bicipite')?.verifica).toBeUndefined()
    expect(idx.notes.find((n) => n.title === 'Teorema di Lagrange')?.verifica).toBeUndefined()
  })

  it('never changes the vault', async () => {
    const file = join(ROOT, 'Matematica/Teorema di Rolle.md')
    const before = [(await stat(file)).mtimeMs, await readFile(file, 'utf8')]
    await scanVault(ROOT, EXCLUDED)
    expect([(await stat(file)).mtimeMs, await readFile(file, 'utf8')]).toEqual(before)
  })
})
