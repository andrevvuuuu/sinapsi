import type { Concept } from '../../shared/graph-types'
import { capNote } from '../session/prompt'

/** Learn Harness EXTRACTION_CORE + the auditor's equivalence bias, in one call (no tools headless). */
export function buildExtractPrompt(input: { noteTitle: string; noteText: string; candidates: Concept[] }): string {
  const cands = input.candidates.map((c) => `${c.id} | ${c.name} | ${c.statement.replace(/\s+/g, ' ')}`).join('\n')
  return [
    `Sei lo stadio di estrazione di un'app di studio. Leggi una nota personale di Andrea (studente di Scienze matematiche per l'IA) e riporti ciò che insegna per il suo grafo della conoscenza, che unisce tutte le sue note.`,
    `L'OBIETTIVO: trovare le IDEE CENTRALI della nota e mostrare come tutto deriva dalle fondamenta. La nota insegna argomentando: idee ricavate da altre idee, fino a una base su cui il resto poggia. Consegni due cose: le idee centrali e le catene di ragionamento che le ricavano.
- Ogni catena è un insieme di premesse che INSIEME implicano una conclusione. Solo l'implicazione giustifica una catena: dove il legame è storico o narrativo non c'è catena. Argomenti indipendenti per la stessa conclusione sono catene separate.
- Il grafo contiene solo idee VERE sul mondo, mai qualcosa su Andrea, sullo studio o su questa lettura. Un errore comune entra come la sua correzione vera.
- Estrai le idee portanti, quelle che un manuale insegnerebbe: definizioni, teoremi, lemmi, criteri, conseguenze. Non gli esempi o le glosse di notazione che nessun argomento usa, non la numerazione della nota.
- "name": un'etichetta brevissima (al massimo 6 parole, es. "Teorema di Fermat"). "statement": un enunciato autosufficiente e preciso, comprensibile da chi non ha mai visto la nota; formule in LaTeX con $…$; dentro le stringhe JSON ogni backslash va raddoppiato (\\\\frac, \\\\mathbb).
- "section": il titolo della sezione della nota (es. "§2 Enunciato") dove l'idea è detta.`,
    `IDEE GIÀ NEL GRAFO (da questa nota e da note collegate). Se un'idea della nota È una di queste, anche detta con altre parole o con un'altra precisione, NON crearne una nuova: scrivi { "ref": "n_…" }. Parafrasi e riformulazioni della stessa affermazione vanno unite; restano separate solo affermazioni davvero diverse. Puoi usare questi id anche come premesse o conclusioni delle catene.
${cands || '(nessuna)'}`,
    `FORMATO (un solo oggetto JSON, rispetta i nomi dei campi):
{
  "propositions": [
    { "id": "p1", "name": "…", "statement": "…", "section": "…" },
    { "ref": "n_…", "section": "…" }
  ],
  "chains": [ { "premises": ["p1", "n_…"], "conclusion": "p2" } ]
}
Gli id nuovi sono locali ("p1", "p2"…). Includi "chains": [] se la nota non argomenta.`,
    `NOTA OBSIDIAN «${input.noteTitle}»\n\n${capNote(input.noteText)}`,
    `Non usare strumenti né file. Rispondi solo con l'oggetto JSON, senza testo prima o dopo.`
  ].join('\n\n---\n\n')
}
