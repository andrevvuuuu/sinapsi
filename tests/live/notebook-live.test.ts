import { execFileSync } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createBridge } from '../../src/main/ai/bridge'
import { nodeSpawn } from '../../src/main/ai/engines'
import { createNotebookChat } from '../../src/main/notebook/chat'
import { createIngestor } from '../../src/main/notebook/ingest'
import { notebookStore } from '../../src/main/notebook/store'
import { DEFAULT_ENGINES } from '../../src/shared/settings-schema'
import { makePdf } from '../unit/helpers/pdf'

// Real tools: pdfjs, mlx_whisper (downloads its model the first time), yt-dlp, and Gemini through agy.
describe.runIf(process.env.LIVE_AI === '1')('live notebook', () => {
  it('imports real sources and answers only from them', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-live-nb-'))
    const store = notebookStore(join(dir, 'nb'))
    const nb = await store.create('Analisi 1')
    const ingest = createIngestor({ store, run: nodeSpawn, readVault: async () => '', onChange: () => undefined })

    const pdf = join(dir, 'Dispensa.pdf')
    // Deliberately unusual: the course renames Rolle's theorem, and says nothing about its history.
    await writeFile(pdf, makePdf(['Teorema di Rolle. Sia f continua in [a,b], derivabile in (a,b), con f(a)=f(b).\nAllora esiste c in (a,b) con f\'(c)=0.\nNel nostro corso questo risultato si chiama lemma del cammello.', 'Esempio: f(x)=x^2-4x+3 su [1,3]. f(1)=f(3)=0 e il punto e c=2.']))
    const audio = join(dir, 'lezione.aiff')
    execFileSync('say', ['-v', 'Alice', '-o', audio, 'Il teorema di Lagrange si dimostra applicando il teorema di Rolle a una funzione ausiliaria.'])
    const t0 = Date.now()
    await ingest.addFiles(nb, [pdf, audio])
    await ingest.addYoutube(nb, 'https://www.youtube.com/watch?v=jNQXAC9IVRw')
    await ingest.idle()
    const sources = (await store.notebooks())[0].sources
    console.log(`[live notebook] fonti in ${Math.round((Date.now() - t0) / 1000)} s:`, sources.map((s) => `${s.kind} ${s.title}: ${s.status} ${s.info ?? s.error}`))
    expect(sources.map((s) => s.status)).toEqual(['ready', 'ready', 'ready'])
    const said = (await store.readText(sources[1].id))!.segments.map((s) => s.text).join(' ')
    console.log('[live notebook] trascrizione:', said)
    expect(said.toLowerCase()).toContain('lagrange')
    expect(sources[2].title).toBe('Me at the zoo')

    const bridge = createBridge({ spawn: nodeSpawn, cacheDir: join(dir, 'c'), usageFile: join(dir, 'usage.jsonl'), engines: async () => DEFAULT_ENGINES })
    const chat = createNotebookChat({ bridge, store, workDir: join(dir, 'w'), onTurn: () => undefined })
    const ids = sources.map((s) => s.id)
    const t1 = Date.now()
    await chat.ask(nb, 'Come si chiama il teorema di Rolle nel corso, e come si dimostra Lagrange?', ids)
    await chat.ask(nb, 'Chi ha dimostrato il teorema di Rolle e in che anno?', ids)
    const turns = await store.chat(nb)
    console.log(`[live notebook] risposte in ${Math.round((Date.now() - t1) / 1000)} s:`, JSON.stringify(turns.filter((t) => t.role !== 'user'), null, 1))
    const [a1, a2] = turns.filter((t) => t.role !== 'user')
    expect(a1.role).toBe('assistant')
    if (a1.role !== 'assistant' || a2.role !== 'assistant') throw new Error('nessuna risposta')
    expect(a1.claims.map((c) => c.text).join(' ').toLowerCase()).toContain('cammello')
    expect(a1.excerpts.length).toBeGreaterThan(0)
    // Rolle published in 1691: the sources do not say so, so neither may the answer.
    expect(a2.claims.map((c) => c.text).join(' ')).not.toMatch(/1691|Michel/)
    expect(a2.missing).toBeTruthy()
  }, 1_800_000)
})
