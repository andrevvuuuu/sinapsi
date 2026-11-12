<div align="center">

<img src="build/icon.png" width="112" alt="" />

# Sinapsi

**Un'app di studio per macOS che trasforma le tue note di Obsidian in ripasso attivo, pratica socratica e un piano verso l'esame.**

Electron · React 19 · TypeScript · FSRS-5 · macOS

</div>

---

## Che cos'è

Rileggere gli appunti dà una sensazione di familiarità che sparisce davanti a un esercizio nuovo. Sinapsi parte dalle note che hai già scritto nel tuo vault Obsidian e ti fa lavorare su di esse: ti chiede di ricordare invece di riconoscere, ti guida con domande invece di darti la soluzione e programma i ripassi quando stai per dimenticare.

Tre principi reggono tutta l'app:

- **Il vault è in sola lettura.** Sinapsi legge le note ma non scrive mai nei tuoi file Markdown. Tutto quello che produce sta nella sua cartella dati.
- **Prima il tentativo, poi l'aiuto.** Il tutor non dà la soluzione: sale una scala di indizi solo dopo che hai provato.
- **La memoria si misura, non si dichiara.** La padronanza di un concetto è la probabilità di ricordarlo stimata da FSRS sulle tue risposte, non una spunta che metti tu.

## Cosa fa

### Oggi, Mappa, Piano

L'interfaccia è una «cabina» con una barra laterale e un dock liquido in basso, con tre destinazioni.

- **Oggi.** Cosa studiare adesso: suggerimenti, concetti in scadenza, lezioni da rielaborare, prontezza per il prossimo esame. Il compositore «Cosa vuoi studiare?» avvia una sessione su qualsiasi argomento.
- **Mappa.** Il grafo dei concetti delle tue note vive. I nodi sono enunciati e gli archi sono catene di deduzione (premesse → conclusione). Si colora per stato di memoria e si può filtrare su ciò che va ripassato, su ciò che non hai mai visto e sulle basi fragili.
- **Piano.** Gli esami con le date, il piano settimanale sulle tue ore di studio e un indice di prontezza per ogni esame.

La barra laterale divide le materie (le cartelle di primo livello del vault) in **universitarie** e **personali**. L'ordine si cambia trascinando o con le frecce, e la scelta resta salvata.

### Studio socratico

Una sessione di studio su una nota o su un argomento libero. Il tutor parte da ciò che sai già (la memoria dei concetti di quella nota), fa domande, chiede spiegazioni e propone giochi brevi (Lampo, Coppie, Ricomponi, Trova l'intruso, Tabù). I nomi delle sessioni si salvano con le iniziali maiuscole.

### Note vive

Da una nota di Obsidian, Sinapsi scrive una dispensa interattiva a blocchi validati: definizioni e teoremi, la decodifica su tre livelli (formula, lettura in italiano, intuizione), dimostrazioni passo per passo e figure SVG con cursori e punti trascinabili. Le formule sono rese con KaTeX e i diagrammi con Mermaid. Dimostrazioni ed esercizi restano coperti finché non hai provato. Se la nota contiene un errore, la nota viva lo segnala e prepara la correzione da copiare in Obsidian.

### Ripasso con FSRS-5

Ripasso spaziato con `ts-fsrs`. La probabilità di ricordo è calcolata con tempo frazionario, così cambia nel corso della giornata. Per ogni concetto l'AI prepara diverse varianti di domanda: risposta aperta, scelta multipla, vero/falso, riordino dei passaggi, completamento, accoppiamento, controesempio, stima, trova l'errore, grafico, «Spiegalo tu». Prima di rispondere dichiari quanto sei sicuro: una risposta sbagliata data con molta sicurezza segnala una possibile misconcezione.

### Pratica e simulazione d'esame

- **Allenamento.** Esercizi su al massimo quattro concetti, con una scala di sei indizi (dall'attenzione alla soluzione) che si sblocca solo dopo un tentativo.
- **Simulazione d'esame.** A tempo, senza aiuti, con voto in trentesimi. Si può svolgere anche su carta: fotografi il foglio con l'iPhone (Continuity Camera), la correzione legge le formule e tu ti autovaluti.

### Registro lezioni e tutor di Sinapsi

Il Registro raccoglie le lezioni del corso. Le lezioni e i concetti di ciascuna arrivano dal tutor delle lezioni del vault (`.antigravity/tutor`, letto e mai modificato). La copertura e la padronanza invece le calcola Sinapsi, solo dai tuoi ripassi e dalle tue pratiche. Ogni concetto della lezione risulta in uno di questi stati:

- interiorizzato;
- in corso;
- fragile;
- mai studiato;
- da estrarre (con un bottone per estrarre i concetti della nota);
- senza nota.

### Ritmo di studio

Due opzioni facoltative, spente per impostazione predefinita:

- micro-pause di 15 secondi ogni 10 minuti di studio;
- un limite di durata della sessione (50 minuti, poi 10 di pausa).

Valgono per studio, ripasso e pratica e contano solo il tempo con la finestra visibile.

### Dettatura

In ogni campo di testo si può dettare (anche con ⌥ Spazio). La trascrizione avviene in locale con `mlx_whisper` su Apple Silicon, tramite un piccolo server che tiene il modello caricato.

### Temi

Due temi, **Lavagna** (scuro) e **Trattato** (chiaro), con un interruttore di vetro nelle Impostazioni. Il materiale visivo è Liquid Glass (`@glass-sdk/liquid-glass`) e i contrasti del testo rispettano il livello AA.

## Come funziona

```
Vault Obsidian (sola lettura) ──► indice delle note ──► estrazione dei concetti (AI)
                                                              │
                                    registri JSONL in sola aggiunta (cartella dati)
                                    proposizioni · catene · ripassi · lezioni · sessioni
                                                              │
                       Main process (Node) ◄── IPC tipizzato (src/shared/api.ts) ──► Renderer (React)
```

- **Main process** (`src/main`): vault e watcher, grafo, memoria FSRS, sessioni, pratica, esami, piano, tutor delle lezioni, dettatura, ponte verso i motori AI.
- **Preload** (`src/preload`): espone al renderer solo i canali dichiarati in `src/shared/api.ts`.
- **Renderer** (`src/renderer/src`): la shell (`shell/`) e le viste (`lessons/`, `review/`, `practice/`, `session/`, `nota/`, `graph/`, `plan/`).
- **Dati**: registri `.jsonl` in sola aggiunta. Lo stato (memoria FSRS, grafo, lezioni) si ricostruisce rileggendoli, e ogni payload passa da uno schema Zod.

La specifica completa è in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Motori AI

Sinapsi non usa chiavi API: chiama le CLI già installate e collegate ai tuoi abbonamenti.

| Motore | CLI | Usato per (predefinito) |
| --- | --- | --- |
| Gemini, tramite Antigravity | `agy` | estrazione dei concetti, note vive, domande del Ripasso |
| Claude, tramite Claude Code | `claude` | tutor di studio e pratica, correzione e foto del foglio |

Per ogni compito il motore e il modello si cambiano in **Impostazioni → Motori AI**. Se una CLI chiede l'accesso, aprila una volta nel terminale (`agy` o `claude`), completa il login e riapri Sinapsi.

Facoltativi: `pip install mlx-whisper` per la dettatura e `yt-dlp` per le fonti video.

## Avvio

Requisiti: macOS 13 o successivo (Apple Silicon consigliato) e Node.js 20 o superiore.

```bash
git clone https://github.com/andrevvuuuu/sinapsi.git
cd sinapsi
npm install
npm run dev
```

Il vault predefinito è `~/Obsidian Vault`; si cambia dalle Impostazioni.

### Creare l'app

```bash
npm run build:unpack   # dist/mac-arm64/Sinapsi.app, senza installer
npm run dist           # .app e .dmg in dist/
```

L'app non è firmata con un Developer ID: la prima volta aprila con clic destro → Apri.

## Sviluppo

```bash
npm test            # test unitari (Vitest)
npm run typecheck   # TypeScript, main e renderer
npm run lint        # ESLint
npm run test:e2e    # end-to-end con Playwright sull'app Electron
```

Alcuni test unitari falliscono già sul ramo principale, soprattutto sui moduli in dismissione (notebook e vecchia Home). Prima di unire una modifica, confronta i fallimenti con quelli del ramo principale invece di aspettarti zero.

### Variabili d'ambiente

| Variabile | Effetto |
| --- | --- |
| `SINAPSI_DATA` | cartella dati alternativa (predefinita: `~/Library/Application Support/Sinapsi`); serve anche a isolare le istanze di test |
| `SINAPSI_VAULT` | percorso del vault, al posto di quello delle impostazioni |
| `SINAPSI_FAKE_EXTRACT`, `SINAPSI_FAKE_NOTE`, `SINAPSI_FAKE_REVIEW`, `SINAPSI_FAKE_TEACHER`, `SINAPSI_FAKE_PRACTICE`, `SINAPSI_FAKE_MEDIA` | con `1`, sostituiscono il motore AI o i media di quel modulo con risposte finte deterministiche, per lavorare offline e nei test |

### Regole del codice

1. Non scrivere mai nel vault: i dati prodotti vanno nella cartella dati.
2. I registri `.jsonl` sono in sola aggiunta: un cambiamento è un nuovo evento, non una riga modificata.
3. Ogni payload tra main, renderer e risposte AI passa da uno schema Zod.
4. Il renderer non importa moduli di Node: le operazioni di sistema passano dai canali di `src/shared/api.ts`.
5. Commit in stile [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`…).

## Documentazione

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): architettura e flussi dei dati
- [`docs/design.md`](docs/design.md): il progetto iniziale
- [`docs/ricerca/il-mio-metodo.md`](docs/ricerca/il-mio-metodo.md): il metodo di studio su cui si basa l'app
- [`reports/ui-reference/STYLE.md`](reports/ui-reference/STYLE.md): lo stile dell'interfaccia
