import type { SessionState } from '../session/events'
import { capNote } from '../session/prompt'
import { NOTA_FORMAT } from '../../shared/nota-schema'
import type { Excerpt } from '../../shared/notebook-types'

const DIGEST_LIMIT = 8000
const clip = (t: string, n = 300): string => (t.length > n ? t.slice(0, n - 1) + '…' : t).replace(/\s+/g, ' ').trim()

/**
 * What happened in the session, as lines the note writer may turn into "session" blocks:
 * previsione (his predictions), errore (wrong and sure), parole (his own words).
 */
export function sessionDigest(s: SessionState): string {
  const lines = [`Argomento: ${s.topic}`]
  for (const it of s.items) {
    if (it.kind !== 'learner' || !it.answer || !it.question) continue
    const q = it.question
    const a = it.answer
    const chosen = a.choice !== undefined && q.options ? q.options[a.choice] : undefined
    if (q.role === 'predict') lines.push(`previsione: alla domanda «${clip(q.prompt, 200)}» ha risposto «${clip(chosen ?? a.text ?? '')}»`)
    else if (q.kind === 'choice' && a.choice !== undefined && q.correct !== undefined && a.choice !== q.correct && (a.confidence ?? 0) >= 70)
      lines.push(`errore: alla domanda «${clip(q.prompt, 200)}» ha scelto «${clip(chosen ?? '')}» con fiducia ${a.confidence}% (giusta: «${clip(q.options?.[q.correct] ?? '')}»)`)
    if (q.role !== 'predict' && a.text) lines.push(`parole: ${clip(a.text)}`)
    if (a.thoughts) lines.push(`parole: ${clip(a.thoughts)}`)
  }
  if (s.summary) {
    lines.push(`Hai imparato: ${s.summary.learned.join('; ')}`)
    if (s.summary.shaky.length) lines.push(`Ancora incerto: ${s.summary.shaky.join('; ')}`)
    if (s.summary.misconceptions.length) lines.push(`Misconcezioni: ${s.summary.misconceptions.join('; ')}`)
  }
  let out = lines.join('\n')
  const cut = '\n[…sessione troncata]'
  if (out.length > DIGEST_LIMIT) out = out.slice(0, DIGEST_LIMIT - cut.length) + cut
  return out
}

export function buildNotePrompt(input: { noteTitle: string; noteText: string; session?: SessionState; sources?: Excerpt[] }): string {
  const parts = [
    `Sei l'autore delle note vive di Sinapsi per Andrea, studente di Scienze matematiche per l'intelligenza artificiale (si interessa anche di bodybuilding: fisiologia, nutrizione). Una nota viva è una nota completa da cui studiare, interattiva, costruita sulla sua nota Obsidian.`,
    `REGOLE
- Base: la nota Obsidian di Andrea qui sotto. Tieni le sue sezioni, nello stesso ordine e con gli stessi titoli (i titoli "##"). Non riassumere: la nota viva deve bastare per studiare.
- Non correggere mai in silenzio. Se qualcosa è impreciso o sbagliato, lascialo com'è nel testo e aggiungi un blocco "flag" che spiega il problema, con "correction" = il testo corretto da copiare in Obsidian. Elenca le segnalazioni anche in provenance.flagged.
- Quiz e flashcard già presenti nella nota (per esempio nella "Palestra"): trasformali in blocchi "quiz" / "flashcard" con fromNote: true e mettili accanto alla sezione giusta, non tutti in fondo.
- Figure: sono il cuore della nota viva. Metti una figura in ogni sezione dove c'è qualcosa da vedere (definizioni con secanti e tangenti, enunciato, ruolo dei teoremi usati, controesempi, corollari, esercizi): per una nota su un teorema di analisi di solito 5–9 figure, al massimo una per sezione. Ogni figura si deve poter toccare: un cursore o un punto trascinabile. La dimostrazione principale ha la sua figura dentro proof, con stepParams che la fanno cambiare a ogni passo. Quando qualcosa "diventa vero" in certi punti (una tangente parallela, una derivata nulla, un segno che cambia) usa greenWhen e aggiungi "points" con label "Mostra i punti". Scegli finestre x/y in cui la curva si vede bene.
- Enunciati con "theorem", decodifica logico-formale con "decode" quando la nota la contiene, tabelle di simboli con "glossary".
- Dimostrazioni con "proof": un passo per step, con tryPrompt ("Prima prova tu") sui passi che Andrea può ricostruire da solo; se una figura aiuta, mettila dentro proof con stepParams (un oggetto per passo).
- Esercizi a difficoltà crescente: "svolto", poi "completa" (con le scelte {{…|*giusta|…}}), poi "solo".
- I blocchi "session" vengono SOLO dalla sessione qui sotto, se c'è; non inventarli.
- Italiano. Matematica in LaTeX: $…$ in linea, $$…$$ in blocco. Nelle stringhe JSON i backslash vanno raddoppiati (\\\\frac).
- In provenance.fromNote scrivi cosa viene dalla nota, in provenance.added cosa hai aggiunto tu.`,
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
