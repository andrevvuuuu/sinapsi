# Sinapsi — documento di progetto

Stato: approvato il 26 ottobre 2026 (brainstorming concluso; l'utente ha delegato le scelte rimaste aperte).
Nome provvisorio: **Sinapsi**.

## 1. Cos'è

Un'app per Mac per studiare in modo attivo e ricordare a lungo: niente "leggi e dimentica" e niente ripasso del giorno prima. Unisce:

- le **sessioni** di Learn Harness (Apprendimento e Pratica guidate da un'AI che ti fa prevedere, spiegare e verificare);
- il **ripasso a intervalli** (FSRS), che Learn Harness non ha;
- le **note vive**: note complete da cui studiare, interattive (figure che seguono lo scroll, quiz accanto ai paragrafi, punti da trascinare);
- il **grafo** che unisce Obsidian (note e link) e Learn Harness (concetti, catene di ragionamento, profondità);
- una sezione **Notebook** simile a NotebookLM: fonti caricate e chat sulle fonti.

È personale (per Andrea: Scienze matematiche per l'IA + bodybuilding), ma progettata per poter diventare un prodotto.

## 2. Decisioni prese

| Tema | Decisione |
|---|---|
| Piattaforma | App desktop **solo Mac** (Electron) |
| Motore AI | **Antigravity CLI (`agy`)** con Gemini 3.8 come motore principale, **Claude Code (`claude -p`)** come secondario. Si usano gli abbonamenti, **nessuna chiave API**. Verificato il 26/10: entrambi rispondono in automatico in formato JSON |
| Obsidian | L'app **legge** il vault `~/Obsidian Vault` e **non lo modifica mai**. Le correzioni proposte si copiano a mano |
| Fonti grezze | PDF, slide, audio, YouTube si caricano **nell'app** (Notebook), non in Obsidian |
| Sessione di Apprendimento | **Stile chat** (prototipo A): sondaggio iniziale → piano → passi prevedi/spiega/verifica → "svuota la testa" |
| Dopo la sessione | Gemini scrive la **nota viva** usando la nota Obsidian come base (struttura e contenuto) + fonti del notebook + sessione (enfasi, annotazioni personali) |
| Nota viva | Nota completa da cui studiare; strati attivabili (Sessione, Quiz, Fonti); modalità "Prova da solo"; tasto "Mostra i punti" sulle figure; segnalazioni senza correzioni silenziose |
| Esercizi | 12 tipi (risposta aperta, grafico interattivo, riordina, trova l'errore, completa, abbina, vero/falso+perché, stima, controesempio, spiegalo a voce, etichetta schema, collega concetti) |
| Ripasso | FSRS per **concetto**; domande sempre in forma nuova (4–5 varianti pre-generate); fiducia + ragionamento; voto proposto dall'AI e modificabile; errori sicuri → misconcezione → mini-Apprendimento |
| Pratica | Allenamento o Simulazione d'esame (durata 30/60/90/a scelta, niente indizi, voto alla fine); selettore del materiale; foto del foglio con Continuity Camera |
| Grafo | Livelli Materie → Note → Concetti. Nodi = enunciati; frecce = catene premesse ⇒ conclusione; un nodo per idea anche se compare in più note; regione = nota d'origine; disposizione Radiale / A piani / Libera; frontiera = note citate nei MOC ma non scritte |
| Estrazione dei concetti | **Progressiva**: subito per le note che studi o apri; in background, quando il Mac è inattivo, un numero limitato di note al giorno (prima quelle collegate ai corsi attivi). Così il grafo cresce senza bruciare la quota |
| Divisione Gemini/Claude | Gemini (via `agy`): estrazione, note vive, varianti di domande, notebook, trascrizioni. Claude: insegnante nelle sessioni di Apprendimento e Pratica (ragionamento passo passo), correzione delle risposte aperte. Ogni compito può cambiare motore dalle impostazioni |

## 3. Architettura

```
Electron
├── main (Node)           — finestre, file system, processi AI, Obsidian (sola lettura)
│   ├── ai/               — ponte verso agy e claude: coda, una richiesta alla volta per motore,
│   │                       JSON validato con schema (zod), cache su disco, conteggio quota
│   ├── vault/            — lettura e indicizzazione del vault Obsidian, osservazione delle modifiche
│   ├── store/            — dati dell'app in ~/Library/Application Support/Sinapsi/
│   └── jobs/             — lavori in background (estrazione, note vive, varianti)
├── preload               — API sicura esposta all'interfaccia (contextIsolation)
└── renderer (React + TS) — Home, Sessioni, Ripasso, Note vive, Grafo, Notebook
```

**Regola d'oro (da Learn Harness):** i dati scritti sono **evidenza in sola aggiunta** (file JSONL); tutto il resto si **ricalcola** leggendo. Un solo modulo scrive ciascun archivio.

### Dati (cartella dell'app)

| File | Contenuto |
|---|---|
| `sources.jsonl` | fonti del notebook (PDF, audio, YouTube…) e note Obsidian indicizzate |
| `propositions.jsonl` | concetti: nome breve, enunciato, provenienza (nota/sessione/pagina) |
| `chains.jsonl` | catene: premesse ⇒ conclusione |
| `sessions/*.json` | sessioni di Apprendimento e Pratica (messaggi, risposte, fiducia) |
| `reviews.jsonl` | eventi di ripasso (FSRS) per concetto |
| `notes/*.json` | note vive generate (contenuto strutturato, non HTML libero) |
| `positions.json` | posizioni del grafo (il grafo cresce senza rimescolarsi) |
| `ai-cache/` | risposte AI già ottenute, per non ripagare la quota |

### Nota viva: formato

Gemini non scrive HTML libero: produce **JSON strutturato** (sezioni, paragrafi con LaTeX, blocchi: teorema, decodifica, dimostrazione a passi, figura parametrica, quiz, flashcard, esercizio, segnalazione, annotazione di sessione). L'app ha un componente per ogni blocco. Le figure sono **descrizioni dichiarative** (funzione, intervallo, elementi, stati per passo, punti notevoli) disegnate dal motore di figure dell'app. Così ogni nota è sicura, coerente e accessibile.

## 4. Ordine di costruzione

1. **Base**: guscio dell'app per Mac, ponte AI (agy + claude), lettura del vault Obsidian, archivio dati, home vuota con il layout approvato.
2. **Apprendimento**: sessione in stile chat.
3. **Note vive**: generazione + visualizzatore con i blocchi interattivi.
4. **Grafo + memoria + Ripasso**: estrazione dei concetti, grafo unito, FSRS, sessione di ripasso.
5. **Notebook**: fonti, chat sulle fonti, trascrizioni.
6. **Pratica**: allenamento, simulazione d'esame, selettore del materiale.

Ogni fase si chiude con l'app che funziona davvero e test automatici verdi.

## 5. Stile visivo

Temi **Lavagna** (scuro) e **Trattato** (chiaro); font Instrument Serif, Geist, Geist Mono, Caveat (strato personale); schede a doppia cornice, isola fluttuante, grana leggera; contrasto WCAG AA, bersagli da 44 px, `prefers-reduced-motion`. Prototipi di riferimento in `docs/prototipi/`.

## 6. Rischi

- **Quote degli abbonamenti**: ogni chiamata ad `agy` costa circa 33 mila token di contesto fisso → si raggruppano i lavori, si mette in cache, si mostra il consumo.
- **CLI che cambiano**: il ponte AI è isolato in un solo modulo con test; se un comando cambia si corregge lì.
- **Prodotto futuro**: per altri utenti servirà "porta la tua chiave API". Il ponte è già pensato per avere più motori.
- **Login scaduti**: l'app riconosce quando `agy` o `claude` chiedono l'accesso e lo dice chiaramente.
