import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createNoteGenerator, type NoteMeta } from '../../src/main/notes/generator'
import { splitSections, introHash } from '../../src/main/notes/sections'
import { parseNota, type Nota, type Section } from '../../src/shared/nota-schema'
import type { VaultIndex, VaultNote } from '../../src/shared/vault-types'
import type { Bridge } from '../../src/main/ai/bridge'

const note = (title: string, available = true): VaultNote => ({
  path: `/vault/Matematica/${title}.md`,
  title,
  folder: 'Matematica',
  tags: [],
  aliases: [],
  links: [],
  headings: [],
  blockIds: [],
  subject: 'Matematica',
  mtime: 1,
  size: 10,
  available
})

const index: VaultIndex = {
  root: '/vault',
  notes: [note('Teorema di Cauchy')],
  subjects: [],
  scannedAt: 1
}

const baseNota: Nota = {
  title: 'Teorema di Cauchy',
  eyebrow: 'Analisi 1',
  aka: [],
  lede: 'Generalizzazione del teorema di Lagrange.',
  tldr: ['Rapporto degli incrementi di due funzioni.'],
  provenance: { fromNote: ['Cauchy'], added: [], flagged: [] },
  recap: { ideas: ['Rapporto derivate'], formulas: [] },
  sections: [
    {
      id: 's1',
      num: '§1',
      title: '1. Definizione',
      blocks: [{ type: 'prose', md: 'Definizione iniziale.' }]
    },
    {
      id: 's2',
      num: '§2',
      title: '2. Enunciato',
      blocks: [
        { type: 'theorem', label: 'Teorema', md: 'Enunciato Cauchy.' },
        { type: 'session', kind: 'previsione', md: 'Previsione dello studente.' }
      ]
    },
    {
      id: 's3',
      num: '§3',
      title: '3. Dimostrazione',
      blocks: [{ type: 'proof', steps: [{ title: 'Passo 1', md: 'Usa Rolle.' }] }]
    },
    {
      id: 's4',
      num: '§4',
      title: '4. Esempi',
      blocks: [{ type: 'prose', md: 'Esempio pratico.' }]
    }
  ]
}

const initialObsidianText = `---
disciplina: Matematica
---
Intro della dispensa.

## 1. Definizione
Definizione iniziale nel vault.

## 2. Enunciato
Enunciato Cauchy nel vault.

## 3. Dimostrazione
Dimostrazione con Rolle.

## 4. Esempi
Esempi nel vault.`

describe('splitSections', () => {
  it('frontmatter ignorato, ### dentro la sezione, ## dentro un blocco di codice non spezza', () => {
    const text = `---
autore: Andrea
disciplina: Matematica
---
Intro generale qui.

## 1. Prima sezione
Testo della prima sezione.
### 1.1 Sottosezione
Questo è un sottotitolo di livello 3 che deve restare dentro.

\`\`\`python
## Questo commento nel codice non deve spezzare
x = 42
\`\`\`

Fine prima sezione.

## 2. Seconda sezione
Testo seconda sezione.`

    const res = splitSections(text)
    expect(res.intro).toBe('Intro generale qui.')
    expect(res.sections).toHaveLength(2)

    expect(res.sections[0].title).toBe('1. Prima sezione')
    expect(res.sections[0].text).toContain('### 1.1 Sottosezione')
    expect(res.sections[0].text).toContain('## Questo commento nel codice non deve spezzare')
    expect(res.sections[0].text).toContain('Fine prima sezione.')

    expect(res.sections[1].title).toBe('2. Seconda sezione')
    expect(res.sections[1].text).toBe('## 2. Seconda sezione\nTesto seconda sezione.')

    expect(res.sections[0].hash).toMatch(/^[0-9a-f]{64}$/)
    expect(res.sections[1].hash).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('refresh per sezione', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sinapsi-sec-'))
  })

  function createTestSetup(ask: Bridge['ask'], readNote: () => Promise<string>) {
    const updates: NoteMeta[] = []
    const g = createNoteGenerator({
      bridge: { ask },
      dir: join(dir, 'notes'),
      workDir: join(dir, 'ai-work'),
      vault: async () => index,
      readNote,
      session: async () => null,
      onUpdate: (m) => updates.push(m)
    })
    return { g, updates }
  }

  it('modifico il testo di 1 sezione su 4 → una chiamata ask con prompt di aggiornamento parziale che contiene solo quella sezione; le altre 3 sezioni della nota viva restano identiche (stesso oggetto/JSON)', async () => {
    let currentNoteText = initialObsidianText

    // Step 1: Initial creation (full write)
    const initialAsk = vi.fn(async () => ({
      data: { nota: JSON.parse(JSON.stringify(baseNota)), dropped: 0 },
      fromCache: false,
      engine: 'agy' as const
    }))

    const { g } = createTestSetup(initialAsk as never, async () => currentNoteText)
    const id = await g.create({ sourcePath: '/vault/Matematica/Teorema di Cauchy.md' })

    await vi.waitFor(async () => {
      const stored = await g.get(id)
      expect(stored.status).toBe('ready')
    })

    const noteBefore = await g.get(id)
    expect(noteBefore.sourceSections).toHaveLength(4)
    expect(noteBefore.sourceIntroHash).toBe(introHash('Intro della dispensa.'))

    // Step 2: Modify section 2 text in Obsidian
    currentNoteText = `---
disciplina: Matematica
---
Intro della dispensa.

## 1. Definizione
Definizione iniziale nel vault.

## 2. Enunciato
Enunciato Cauchy nel vault - MODIFICATO con nuova formula.

## 3. Dimostrazione
Dimostrazione con Rolle.

## 4. Esempi
Esempi nel vault.`

    const updatedSection2: Section = {
      id: 's2',
      num: '§2',
      title: '2. Enunciato',
      blocks: [
        { type: 'theorem', label: 'Teorema 2.0', md: 'Enunciato Cauchy aggiornato.' }
      ]
    }

    const refreshAsk = vi.fn(async (req: { prompt: string; schema: unknown; timeoutMs: number }) => {
      expect(req.timeoutMs).toBe(240_000)
      expect(req.prompt).toContain('SEZIONE DA AGGIORNARE')
      expect(req.prompt).toContain('Enunciato Cauchy nel vault - MODIFICATO con nuova formula.')
      // Must NOT contain other sections to update
      expect(req.prompt).not.toContain('Definizione iniziale nel vault.')
      expect(req.prompt).not.toContain('Dimostrazione con Rolle.')
      return {
        data: { sections: [updatedSection2], dropped: 0 },
        fromCache: false,
        engine: 'agy' as const
      }
    })

    const { g: refreshGen } = createTestSetup(refreshAsk as never, async () => currentNoteText)
    const refreshedCount = await refreshGen.refresh('/vault/Matematica/Teorema di Cauchy.md')
    expect(refreshedCount).toBe(1)
    expect(refreshAsk).toHaveBeenCalledTimes(1)

    const noteAfter = await refreshGen.get(id)
    expect(noteAfter.status).toBe('ready')

    // Sections 0, 2, 3 must be identical to noteBefore
    expect(noteAfter.nota?.sections[0]).toEqual(noteBefore.nota?.sections[0])
    expect(noteAfter.nota?.sections[2]).toEqual(noteBefore.nota?.sections[2])
    expect(noteAfter.nota?.sections[3]).toEqual(noteBefore.nota?.sections[3])

    // Section 1 (s2) is updated
    expect(noteAfter.nota?.sections[1].title).toBe('2. Enunciato')
    expect(noteAfter.nota?.sections[1].blocks[0]).toEqual({
      type: 'theorem',
      label: 'Teorema 2.0',
      md: 'Enunciato Cauchy aggiornato.'
    })
    // And its session block was preserved at the end!
    expect(noteAfter.nota?.sections[1].blocks[1]).toEqual({
      type: 'session',
      kind: 'previsione',
      md: 'Previsione dello studente.'
    })
  })

  it('aggiungo o rinomino una sezione → riscrittura completa (prompt di buildNotePrompt)', async () => {
    let currentNoteText = initialObsidianText

    const ask = vi.fn(async () => ({
      data: { nota: JSON.parse(JSON.stringify(baseNota)), dropped: 0 },
      fromCache: false,
      engine: 'agy' as const
    }))

    const { g } = createTestSetup(ask as never, async () => currentNoteText)
    const id = await g.create({ sourcePath: '/vault/Matematica/Teorema di Cauchy.md' })
    await vi.waitFor(async () => expect((await g.get(id)).status).toBe('ready'))

    // Case A: Rename section 2: "## 2. Enunciato" -> "## 2. Teorema"
    currentNoteText = initialObsidianText.replace('## 2. Enunciato', '## 2. Teorema')
    ask.mockClear()

    await g.refresh('/vault/Matematica/Teorema di Cauchy.md')
    expect(ask).toHaveBeenCalledTimes(1)
    const reqRename = ask.mock.calls[0][0] as { timeoutMs: number; prompt: string }
    expect(reqRename.timeoutMs).toBe(480_000)
    expect(reqRename.prompt).toContain('NOTA OBSIDIAN «Teorema di Cauchy»')

    // Case B: Add section 5
    currentNoteText = `${initialObsidianText}\n\n## 5. Corollario\nAltro testo.`
    ask.mockClear()

    await g.refresh('/vault/Matematica/Teorema di Cauchy.md')
    expect(ask).toHaveBeenCalledTimes(1)
    const reqAdd = ask.mock.calls[0][0] as { timeoutMs: number; prompt: string }
    expect(reqAdd.timeoutMs).toBe(480_000)
    expect(reqAdd.prompt).toContain('NOTA OBSIDIAN «Teorema di Cauchy»')
  })

  it('3 sezioni cambiate su 4 → riscrittura completa', async () => {
    let currentNoteText = initialObsidianText

    const ask = vi.fn(async () => ({
      data: { nota: JSON.parse(JSON.stringify(baseNota)), dropped: 0 },
      fromCache: false,
      engine: 'agy' as const
    }))

    const { g } = createTestSetup(ask as never, async () => currentNoteText)
    const id = await g.create({ sourcePath: '/vault/Matematica/Teorema di Cauchy.md' })
    await vi.waitFor(async () => expect((await g.get(id)).status).toBe('ready'))

    // Modify 3 sections out of 4 (sections 1, 2, 3 changed)
    currentNoteText = `---
disciplina: Matematica
---
Intro della dispensa.

## 1. Definizione
Definizione cambiata.

## 2. Enunciato
Enunciato cambiato.

## 3. Dimostrazione
Dimostrazione cambiata.

## 4. Esempi
Esempi nel vault.`

    ask.mockClear()
    await g.refresh('/vault/Matematica/Teorema di Cauchy.md')
    expect(ask).toHaveBeenCalledTimes(1)
    const req = ask.mock.calls[0][0] as { timeoutMs: number; prompt: string }
    // 3 > ceil(4 / 2) = 2, so full rewrite
    expect(req.timeoutMs).toBe(480_000)
    expect(req.prompt).toContain('NOTA OBSIDIAN «Teorema di Cauchy»')
  })

  it('blocco session della sezione cambiata preservato anche se il modello lo omette', async () => {
    let currentNoteText = initialObsidianText

    const ask = vi.fn(async () => ({
      data: { nota: JSON.parse(JSON.stringify(baseNota)), dropped: 0 },
      fromCache: false,
      engine: 'agy' as const
    }))

    const { g } = createTestSetup(ask as never, async () => currentNoteText)
    const id = await g.create({ sourcePath: '/vault/Matematica/Teorema di Cauchy.md' })
    await vi.waitFor(async () => expect((await g.get(id)).status).toBe('ready'))

    // Modify section 2 (which had a session block)
    currentNoteText = initialObsidianText.replace('Enunciato Cauchy nel vault.', 'Enunciato Cauchy nel vault modificato.')

    // Model returns section without session block
    ask.mockImplementation(async () => ({
      data: {
        sections: [
          {
            id: 's2',
            num: '§2',
            title: '2. Enunciato',
            blocks: [{ type: 'theorem', label: 'T', md: 'Nuovo testo.' }]
          }
        ],
        dropped: 0
      },
      fromCache: false,
      engine: 'agy' as const
    }))

    await g.refresh('/vault/Matematica/Teorema di Cauchy.md')
    const note = await g.get(id)
    const s2 = note.nota?.sections.find((s) => s.id === 's2')
    expect(s2?.blocks).toHaveLength(2)
    expect(s2?.blocks[1]).toEqual({
      type: 'session',
      kind: 'previsione',
      md: 'Previsione dello studente.'
    })
  })

  it('nota senza sourceSections → riscrittura completa, e dopo il salvataggio ha sourceSections', async () => {
    let currentNoteText = initialObsidianText

    const ask = vi.fn(async () => ({
      data: { nota: JSON.parse(JSON.stringify(baseNota)), dropped: 0 },
      fromCache: false,
      engine: 'agy' as const
    }))

    const { g } = createTestSetup(ask as never, async () => currentNoteText)
    const id = await g.create({ sourcePath: '/vault/Matematica/Teorema di Cauchy.md' })
    await vi.waitFor(async () => expect((await g.get(id)).status).toBe('ready'))

    // Manually delete sourceSections and sourceIntroHash to simulate legacy note
    const filePath = join(dir, 'notes', `${id}.json`)
    const raw = JSON.parse(await readFile(filePath, 'utf8'))
    delete raw.sourceSections
    delete raw.sourceIntroHash
    await writeFile(filePath, JSON.stringify(raw), 'utf8')

    // Modify 1 section
    currentNoteText = initialObsidianText.replace('Definizione iniziale nel vault.', 'Definizione modificata.')
    ask.mockClear()

    await g.refresh('/vault/Matematica/Teorema di Cauchy.md')
    expect(ask).toHaveBeenCalledTimes(1)
    const req = ask.mock.calls[0][0] as { timeoutMs: number; prompt: string }
    expect(req.timeoutMs).toBe(480_000) // Full rewrite
    expect(req.prompt).toContain('NOTA OBSIDIAN «Teorema di Cauchy»')

    // After rewrite, it must have sourceSections and sourceIntroHash
    const updated = await g.get(id)
    expect(updated.sourceSections).toHaveLength(4)
    expect(updated.sourceIntroHash).toBeDefined()
  })

  it('se una sezione richiesta manca nella risposta parziale → ripiega sulla riscrittura completa', async () => {
    let currentNoteText = initialObsidianText

    const ask = vi.fn(async () => ({
      data: { nota: JSON.parse(JSON.stringify(baseNota)), dropped: 0 },
      fromCache: false,
      engine: 'agy' as const
    }))

    const { g } = createTestSetup(ask as never, async () => currentNoteText)
    const id = await g.create({ sourcePath: '/vault/Matematica/Teorema di Cauchy.md' })
    await vi.waitFor(async () => expect((await g.get(id)).status).toBe('ready'))

    // Modify section 2
    currentNoteText = initialObsidianText.replace('Enunciato Cauchy nel vault.', 'Enunciato Cauchy nel vault modificato.')
    ask.mockClear()

    let callCount = 0
    ask.mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        // First call is partial update: return empty or wrong id section
        return {
          data: {
            sections: [
              {
                id: 'wrong-id',
                num: '§99',
                title: 'Altro',
                blocks: []
              }
            ],
            dropped: 0
          },
          fromCache: false,
          engine: 'agy' as const
        }
      }
      // Second call is full rewrite fallback
      return {
        data: { nota: JSON.parse(JSON.stringify(baseNota)), dropped: 0 },
        fromCache: false,
        engine: 'agy' as const
      }
    })

    const refreshed = await g.refresh('/vault/Matematica/Teorema di Cauchy.md')
    expect(refreshed).toBe(1)
    expect(callCount).toBe(2)
    const secondReq = ask.mock.calls[1][0] as { timeoutMs: number; prompt: string }
    expect(secondReq.timeoutMs).toBe(480_000)
    expect(secondReq.prompt).toContain('NOTA OBSIDIAN «Teorema di Cauchy»')
  })
})
