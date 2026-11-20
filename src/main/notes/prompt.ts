import { stripNoise } from './strip-noise'
import type { SessionState } from '../session/events'
import { capNote } from '../session/prompt'
import { NOTA_FORMAT, type Section } from '../../shared/nota-schema'
import type { Excerpt } from '../../shared/notebook-types'
import { MISCONCEPTION_CONFIDENCE } from '../../shared/memory-types'

const DIGEST_LIMIT = 8000
const clip = (t: string, n = 300): string => (t.length > n ? t.slice(0, n - 1) + '…' : t).replace(/\s+/g, ' ').trim()

export const NOTE_RULES = `REGOLE
- Base: la nota Obsidian di Andrea qui sotto. Tieni le sue sezioni, nello stesso ordine e con gli stessi titoli (i titoli "##"). Non riassumere: la nota viva deve bastare per studiare.
- Non correggere mai in silenzio. Se qualcosa è impreciso o sbagliato, lascialo com'è nel testo e aggiungi un blocco "flag" che spiega il problema, con "correction" = il testo corretto da copiare in Obsidian. Elenca le segnalazioni anche in provenance.flagged.
- Quiz e flashcard già presenti nella nota (per esempio nella "Palestra"): trasformali in blocchi "quiz" / "flashcard" con fromNote: true e mettili accanto alla sezione giusta, non tutti in fondo.
- Figure: sono il cuore della nota viva. Metti una figura in ogni sezione dove c'è qualcosa da vedere (definizioni con secanti e tangenti, enunciato, ruolo dei teoremi usati, controesempi, corollari, esercizi): per una nota su un teorema di analisi di solito 5–9 figure, al massimo una per sezione. Ogni figura si deve poter toccare: un cursore o un punto trascinabile. La dimostrazione principale ha la sua figura dentro proof, con stepParams che la fanno cambiare a ogni passo. Quando qualcosa "diventa vero" in certi punti (una tangente parallela, una derivata nulla, un segno che cambia) usa greenWhen e aggiungi "points" con label "Mostra i punti". Scegli finestre x/y in cui la curva si vede bene.
- Enunciati con "theorem", decodifica logico-formale con "decode" quando la nota la contiene, tabelle di simboli con "glossary".
- Dimostrazioni con "proof": un passo per step, con tryPrompt ("Prima prova tu") sui passi che Andrea può ricostruire da solo; se una figura aiuta, mettila dentro proof con stepParams (un oggetto per passo).
- Esercizi a difficoltà crescente: "svolto", poi "completa" (con le scelte {{…|*giusta|…}}), poi "solo".
- I blocchi "session" vengono SOLO dalla sessione qui sotto, se c'è; non inventarli.
- Italiano. Matematica in LaTeX: $…$ in linea, $$…$$ in blocco. Nelle stringhe JSON i backslash vanno raddoppiati (\\\\frac).
- FORMULE OVUNQUE TRA $…$: ogni formula, simbolo o variabile in ogni campo, anche titoli (title, titleEm, titoli di sezione, di figura, di esercizio, di passo), idee del recap, etichette (label dei cursori e dei readouts), opzioni e spiegazioni dei quiz, provenance. Mai matematica in testo semplice: non "g(x) = f(x) - y_sec(x)" ma "$g(x) = f(x) - y_{\\text{sec}}(x)$", non "x² - 4x + 3" ma "$x^2 - 4x + 3$", non "Pendenza m_sec" ma "Pendenza $m_{\\text{sec}}$". Ogni $ aperto va chiuso nello stesso campo.
- Scelte {{…}} negli esercizi "completa": SEMPRE fuori dalle formule. Chiudi $ prima della scelta e riaprilo dopo se la formula continua: "$f(1) =$ {{$-2$|*$0$|$1$}} e $f(5) =$ {{$6$|*$8$|$10$}}", mai "$f(1) = {{-2|*0|1}}$". Se un'opzione è una formula, mettila tra $…$ dentro la scelta.
- Diagrammi Mermaid (blocchi \`\`\`mermaid dentro "md"): etichette dei nodi tra virgolette, in testo semplice e leggibile, senza LaTeX né $: scrivi "g(x) = f(x) - y sec(x)" o a parole, vai a capo con <br/>.
- In provenance.fromNote scrivi cosa viene dalla nota, in provenance.added cosa hai aggiunto tu.`

/**
 * What happened in the session, as lines the note writer may turn into "session" blocks:
 * previsione (his predictions), errore (wrong and sure), parole (his own words).
 */
export function sessionDigest(s: SessionState): string {
  const headLines = [`Argomento: ${s.topic}`]
  if (s.summary) {
    headLines.push(`Hai imparato: ${s.summary.learned.join('; ')}`)
    if (s.summary.shaky.length) headLines.push(`Ancora incerto: ${s.summary.shaky.join('; ')}`)
    if (s.summary.misconceptions.length) headLines.push(`Misconcezioni: ${s.summary.misconceptions.join('; ')}`)
  }
  for (const ev of s.evidence ?? []) {
    if (!ev.verdict) continue
    const name = s.tree?.nodes.find((n) => n.id === ev.conceptId)?.name ?? ev.conceptId
    headLines.push(`verdetto correttore: ${name} — ${ev.verdict}`)
  }

  const bodyLines: string[] = []
  for (const it of s.items) {
    if (it.kind !== 'learner' || !it.answer || !it.question) continue
    const q = it.question
    const a = it.answer
    const chosen = a.choice !== undefined && q.options ? q.options[a.choice] : undefined
    if (q.role === 'predict') bodyLines.push(`previsione: alla domanda «${clip(q.prompt, 200)}» ha risposto «${clip(chosen ?? a.text ?? '')}»`)
    else if (q.kind === 'choice' && a.choice !== undefined && q.correct !== undefined && a.choice !== q.correct && (a.confidence ?? 0) >= MISCONCEPTION_CONFIDENCE)
      bodyLines.push(`errore: alla domanda «${clip(q.prompt, 200)}» ha scelto «${clip(chosen ?? '')}» con fiducia ${a.confidence}% (giusta: «${clip(q.options?.[q.correct] ?? '')}»)`)
    if (q.role !== 'predict' && a.text) bodyLines.push(`parole: ${clip(a.text)}`)
    if (a.thoughts) bodyLines.push(`parole: ${clip(a.thoughts)}`)
  }

  let body = bodyLines.join('\n')
  const cut = '\n[…sessione troncata]'
  if (body.length > DIGEST_LIMIT) body = body.slice(0, DIGEST_LIMIT - cut.length) + cut
  return [headLines.join('\n'), body].filter(Boolean).join('\n')
}

export function buildNotePrompt(input: { noteTitle: string; noteText: string; session?: SessionState; sources?: Excerpt[] }): string {
  const parts = [
    `Sei l'autore delle note vive di Sinapsi per Andrea, studente di Scienze matematiche per l'intelligenza artificiale (si interessa anche di bodybuilding: fisiologia, nutrizione). Una nota viva è una nota completa da cui studiare, interattiva, costruita sulla sua nota Obsidian.`,
    NOTE_RULES,
    NOTA_FORMAT,
    `NOTA OBSIDIAN «${input.noteTitle}»\n\n${capNote(input.noteText)}`
  ]
  if (input.sources?.length)
    parts.push(
      `FONTI DEL NOTEBOOK (estratti dalle fonti che Andrea ha caricato: usali per completare e precisare, ma la nota Obsidian resta la base; quando usi un estratto cita la fonte tra parentesi, per esempio (Dispensa, p. 12))\n\n${input.sources.map((e) => `(${e.title}, ${e.label}) ${e.text}`).join('\n')}`
    )
  if (input.session) parts.push(`SESSIONE DI STUDIO (usala per i blocchi "session" e per dare più spazio a ciò che è rimasto incerto)\n\n${sessionDigest(input.session)}`)
  parts.push('Non usare strumenti né file. Rispondi solo con l\'oggetto JSON della nota viva, senza testo prima o dopo.')
  return parts.join('\n\n---\n\n')
}

export type SectionUpdateInput = {
  noteTitle: string
  sections: {
    obsidianText: string
    currentSection: Section
  }[]
}

export function buildSectionUpdatePrompt(input: SectionUpdateInput): string {
  const parts = [
    `Sei l'autore delle note vive di Sinapsi per Andrea, studente di Scienze matematiche per l'intelligenza artificiale (si interessa anche di bodybuilding: fisiologia, nutrizione). Una nota viva è una nota completa da cui studiare, interattiva, costruita sulla sua nota Obsidian. La nota «${input.noteTitle}» è già stata generata in passato; alcune sezioni della nota Obsidian sono state modificate e vanno aggiornate nella nota viva senza riscrivere il resto.`,
    NOTE_RULES,
    NOTA_FORMAT
  ]

  const sectionsText = input.sections
    .map(
      (s, i) =>
        `### SEZIONE DA AGGIORNARE ${i + 1}: «${s.currentSection.title}»\n\n` +
        `TESTO NUOVO DELLA SEZIONE OBSIDIAN:\n${stripNoise(s.obsidianText)}\n\n` +
        `JSON ATTUALE DELLA SEZIONE NELLA NOTA VIVA:\n${JSON.stringify(s.currentSection)}`
    )
    .join('\n\n---\n\n')

  parts.push(sectionsText)

  parts.push(
    `ISTRUZIONI DI AGGIORNAMENTO
- Riscrivi SOLO le sezioni indicate sopra, aggiornandole in base al nuovo testo della sezione Obsidian.
- Mantieni gli stessi "id", "num" e "title" di ciascuna sezione.
- Tieni identici i blocchi con type: "session" presenti nel JSON attuale (non modificarli, non eliminarli).
- Rispondi con un unico oggetto JSON nel formato:
{
  "sections": Section[]
}
Non usare strumenti né file. Rispondi solo con l'oggetto JSON, senza testo prima o dopo.`
  )

  return parts.join('\n\n---\n\n')
}
