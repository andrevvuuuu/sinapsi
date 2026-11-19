# Analisi tecnica delle Sessioni di Apprendimento — Sinapsi

> Documento di input per una deep research di ottimizzazione. Stato del codice: branch `feat/ui-fixes-r5` (ultimo commit `b389b16`), novembre 2026.
> Stack: Electron 44 + React 19 + TypeScript, `ts-fsrs 5.4.2`, `zod 4`, LLM invocati come CLI esterne (`claude`, `agy`/Gemini).

---

## 0. Sintesi in cinque righe

1. Una "sessione di apprendimento" (modalità **Apprendimento**) è una **conversazione multi-turno con un singolo agente LLM** (il "tutor"), vincolata da uno schema JSON (`TeacherTurn`) e persistita come **event log JSONL** per sessione.
2. Il tutor segue un protocollo pedagogico a fasi (obiettivo → misura → piano → insegnamento → consolidamento → fine) definito **interamente nel system prompt**: il codice non impone né verifica la sequenza delle fasi.
3. La sessione **legge** il vault Obsidian (una nota abbinata per titolo) e **legge** lo stato FSRS dei concetti di quella nota, ma **non scrive mai evidenza nel log FSRS**: le risposte date in sessione non influenzano la pianificazione dei ripassi.
4. Il "piano" della sessione è un grafo generato dall'LLM con id inventati, **scollegato dal grafo dei concetti** estratto dal vault.
5. L'UI è uno split 60/40 (lezione scorrevole | dock della domanda) con timeline del piano, mini-giochi in modale e un punteggio "leggero" calcolato lato renderer.

---

## 1. Architettura corrente

### 1.1 Componenti coinvolti

| Livello | File | Ruolo |
|---|---|---|
| Renderer – ingresso | `src/renderer/src/home/Home.tsx` (Composer, modo `Apprendimento`) | Chiama `window.sinapsi.session.start(topic)` e naviga a `SessionView` |
| Preload/IPC | `src/preload/index.ts`, `src/main/ipc.ts` (righe ~155–195), `src/main/ipc-handlers.ts` (`makeSessionHandlers`) | Validazione zod degli input, canali `session:*`, broadcast `session:updated` |
| Orchestrazione | `src/main/session/runner.ts` | `create / answer / say / retry / get / list`; serializzazione per sessione; gestione errori |
| Stato | `src/main/session/events.ts` | Tipi evento + `reduceSession()` (riduttore puro: stato = fold degli eventi) |
| Prompting | `src/main/session/prompt.ts` | `TEACHER_SYSTEM_PROMPT`, `firstMessage()`, `capNote()` (taglio a 60 000 caratteri) |
| Protocollo | `src/shared/teacher-protocol.ts` | Schema `TeacherTurn` (zod + `superRefine`), `LearnerAnswer`, `formatLearnerReply()` |
| Contesto vault | `src/main/session/note-match.ts` | Abbina il topic digitato a **una** nota del vault |
| Contesto memoria | `src/main/session/memory-brief.ts` + `src/main/memory/fsrs.ts` | Riassunto testuale dello stato FSRS dei concetti della nota |
| Trasporto LLM | `src/main/ai/bridge.ts` (`converse`), `src/main/ai/engines.ts` | Spawn della CLI, resume della conversazione, validazione + 1 retry |
| Persistenza | `src/main/store/jsonl.ts` | Append serializzato per file; lettura tollerante a righe corrotte |
| UI | `src/renderer/src/session/*` (`SessionView`, `QuestionDock`, `AnswerCard`, `PlanMap`, `games/*`) | Rendering, input risposta, giochi |
| Post-sessione | `src/main/notes/generator.ts`, `src/main/notes/prompt.ts` (`sessionDigest`) | "Crea la nota viva" dalla nota + digest della sessione |
| Suggerimenti | `src/main/suggest/suggest.ts` | Usa `SessionSummary` per "sessione da finire" e per marcare note come studiate |

### 1.2 Flusso end-to-end

```
Home/Composer ──session.start(topic)──▶ IPC sessionStart
                                          │
                                          ├─ runner.create(topic)          (ritorna subito l'id)
                                          │    ├─ vault index → matchNote(topic)        → nota | null
                                          │    ├─ readNote(path)                         → testo (≤60k char)
                                          │    ├─ memory(notePath) = memoryBrief(graph, memoryOf(reviews.jsonl))
                                          │    ├─ settings.gamesInSessions
                                          │    └─ append {t:'created'}, append {t:'learner', text: firstMessage(...)}
                                          │
                                          └─ background(runner.retry(id)) → teacherTurn(id)
                                                 ├─ bridge.converse({task:'teach', conversationId, resume, systemPrompt, jsonSchema})
                                                 │     └─ enqueue(engine) → spawn `claude -p … --session-id|--resume …`
                                                 │                         (o `agy -p … --conversation …`)
                                                 │     └─ validate(TeacherTurnSchema) → se KO: 1 retry nella stessa conversazione
                                                 ├─ OK  → append {t:'teacher', turn, conversationId}
                                                 └─ KO  → append {t:'error', message: friendly(e)}
                                          ogni append → load() (rilegge l'intero file + reduce) → broadcast session:updated

SessionView ◀──session:updated (stato completo)── main
   │
   ├─ risposta a domanda → session.answer(id, LearnerAnswer)
   │      └─ runner.answer: verifica questionId == pendingQuestion.id
   │             → append {t:'learner', text: formatLearnerReply(q,a), answer, question} → teacherTurn
   ├─ testo libero (solo se nessuna domanda aperta o domanda 'plan') → session.say(id, text)
   └─ Riprova → session.retry(id)

phase === 'done' → "Crea la nota viva" → notes.create({sessionId}) → generator con sessionDigest(s)
```

### 1.3 Proprietà architetturali rilevanti

- **Event sourcing puro**: `SessionState` non è mai salvato; è sempre ricostruito da `reduceSession(events)`. Quattro tipi di evento: `created`, `learner`, `teacher`, `error`.
- **Serializzazione per sessione** (`serial()` in `runner.ts`): una catena di Promise per id evita eventi interleaved (test: `serializes two answers fired together`).
- **De-duplicazione doppio click** (`once()`): stesso `kind:topic` entro 2 s → stessa sessione.
- **Recupero da crash**: se l'ultimo evento è `learner` e nessuna chiamata è in volo (`inflight`), lo stato diventa `awaiting: 'retry'`. Dopo un errore a metà sessione il prompt viene prefissato con "(Ripeto il mio ultimo messaggio…)".
- **Gestione conversazione**: la memoria conversazionale è delegata alla CLI (`--session-id`/`--resume` per Claude, `--conversation` per agy). Il system prompt e la nota viaggiano **solo nel primo turno**; i turni successivi inviano solo la risposta formattata dello studente.
- **Tool lockdown**: in conversazione Claude gira con `--tools ''`, `--disallowedTools …`, `--strict-mcp-config`, `--setting-sources ''` (il tutor "parla soltanto").
- **Coda per motore** (`enqueue` in `bridge.ts`): una sola chiamata alla volta per engine (`claude` | `agy`), condivisa con tutte le altre feature.
- **Default motori** (`settings-schema.ts`): `teach: claude/sonnet`, `grade: claude/sonnet`, `extract|note: gemini-3.8-flash-medium`, `variants: gemini-3.8-flash-high`. Timeout default 180 s.

---

## 2. Integrazione dati

### 2.1 Vault Obsidian

- **Abbinamento nota** (`matchNote`): confronto tra topic digitato e `title` + `aliases` delle note `available`. Match esatto → punteggio ∞; altrimenti numero di parole condivise (≥3 lettere, stopword italiane rimosse). Soglia: `max(2, ceil(n/2))` parole se il topic ha ≥2 parole, altrimenti 1. Tie-break: titolo più corto.
- **Nessun uso del contenuto** della nota per il matching (né corpo, né heading, né embedding, né grafo).
- **Iniezione**: la nota intera (capata a 60 000 char, con marker `[…nota troncata]`) entra nel primo messaggio. Se contiene il marker `%% verifica-inizio %%` (callout di correttezza generato da `correctness_check.py`), viene anteposto un avviso che istruisce il tutor a non insegnare le parti segnalate.
- **Una sola nota**: i link `[[…]]`, le note prerequisito e le note correlate non vengono mai portate nel contesto.
- **Scrittura sul vault**: nessuna. La sessione è read-only rispetto al vault.

### 2.2 Grafo dei concetti

- Il grafo (`src/main/graph/derive.ts`) è derivato da ledger di proposizioni e catene inferenziali estratte dalle note; ogni `Concept` ha `id`, `name`, `statement`, `birth` (nota di origine), `notes[]`, `depth` (profondità inferenziale via Tarjan SCC).
- La sessione usa il grafo **solo** in `memoryBrief`: filtra i concetti con `notes.includes(notePath)`, li ordina per `depth` crescente (basi prima), ne mostra al più 40.
- Il **piano della sessione** (`Plan` in `teacher-protocol.ts`) è invece un grafo **generato dall'LLM** con `id` liberi ("id brevi in minuscolo con trattini"). Non c'è alcuna mappatura `PlanNode.id ↔ Concept.id`. Le dipendenze già note al grafo (`chains`) non vengono passate al tutor come struttura, né il piano risultante viene confrontato o riconciliato con esse.

### 2.3 Note interattive ("note vive")

- A sessione conclusa, se la sessione è collegata a una nota, l'utente può generare una nota viva: `notes.create({ sessionId })` → `generator.resolveSource()` → `buildNotePrompt({ noteText, session })`.
- `sessionDigest()` estrae dal log: previsioni (`role: 'predict'`), errori sicuri (scelta sbagliata con fiducia ≥70%), "parole" dello studente (ragionamenti e pensieri), e il `summary` finale. Limite: 8 000 caratteri, troncamento in coda (quindi si perdono gli eventi **più recenti**, cioè consolidamento e summary, se la sessione è lunga).
- Quando la nota viva è pronta parte un'estrazione (`extractor.request(path, 'study')`) che aggiorna il grafo.

### 2.4 Persistenza

- `dataDir()/sessions/<uuid>.jsonl`: un file per sessione, append-only.
- `dataDir()/memory/reviews.jsonl`: unico log FSRS globale (Ripasso + Pratica). **La sessione non vi scrive.**
- Lettura tollerante: righe non valide vengono saltate con un warning (`AnyEvent` è uno `z.custom` che verifica solo la presenza di `t`).

---

## 3. Algoritmo FSRS

### 3.1 Implementazione generale (fuori dalla sessione)

- `src/main/memory/fsrs.ts`: scheduler `ts-fsrs` con `generatorParameters({ enable_fuzz: false })` — **parametri di default, nessuna ottimizzazione per-utente**.
- **Nessuna card persistita**: per ogni concetto la card viene ricostruita ad ogni lettura facendo `replay` di tutte le `ReviewLine` in ordine temporale.
- `displayedR()` ricalcola la retrievability con giorni frazionari (curva FSRS-5: `(1 + 19/81 · t/S)^-0.5`) per evitare che R resti 100% per tutto il giorno del ripasso; in (re)learning schiaccia R a ≤0.40 (grade 1) o ≤0.75 (grade 2).
- Stati UI: `la sai` (R ≥ 0.85), `incerto` (≥ 0.60), `debole` (< 0.60), `mai visto` (null).
- `misconception = ultimo errore con fiducia ≥ 70`.
- `proposeGrade()`: dontKnow/sbagliato → 1; parziale → 2; giusto con fiducia <50 → 2; altrimenti 3. Il grade 4 (Easy) non viene mai proposto automaticamente.
- Le sorgenti di `ReviewLine` sono: Ripasso (`via` assente/`'review'`), Pratica (`via: 'practice'`, scritte in `practice/runner.ts` e `practice/exam.ts`).

### 3.2 Ruolo di FSRS nella sessione di apprendimento

**FSRS è solo un input, mai un output della sessione.**

1. **Lettura (una volta, alla creazione)**: `memoryBrief()` produce un blocco testuale come:
   ```
   Stato di memoria dei concetti di questa nota, dai ripassi e dalla Pratica (3 su 12 già visti). R = …; S = …:
   - Teorema di Rolle — la sai · R 93% · S 21 g · ultimo: Bene · 4 ripassi
   - Teorema di Lagrange — debole · R 41% · S 2,3 g · ultimo: Di nuovo (sbagliato con sicurezza: misconcezione) · 2 ripassi · 1 dimenticanza
   - Teorema di Fermat — mai visto
   ```
   Il system prompt istruisce il tutor a usarlo come prior per la fase di misura (pavimento per "la sai", insistenza su "debole"/misconcezioni).
2. **Nessuna scrittura**: non esiste `via: 'session'` nello schema `ReviewLine`; il runner non ha dipendenza da `MemoryStore`. Le risposte `check`/`recall`/`game` con confidenza, che costituiscono evidenza di richiamo ad alta qualità (anche calibrata), vengono scartate dal modello di memoria.
3. **Nessuna pianificazione**: la sessione non crea card per i concetti appena insegnati, non anticipa il primo ripasso, non segnala concetti `due` correlati all'argomento.
4. **Progresso interno ≠ FSRS**: `doneNodeIds` in `reduceSession` è una euristica locale (nodo marcato "fatto" quando c'è stato un `check` a scelta corretto o un gioco ≥70% su quel nodo **e** il tutor passa a un nodo diverso). Vive solo nel log della sessione.
5. L'unico ponte indiretto: "Crea la nota viva" → estrazione → nuovi concetti nel grafo → disponibili (come "mai visto") al Ripasso, che li introduce max 5 nuovi per seduta (`NEW_PER_SESSION`).

---

## 4. UX/UI Flow

### 4.1 Layout ("Layout A", `session.css` righe ~700+)

```
┌──────────────────────────────────────────────────────────────────────┐
│ ← Home │ <Topic> │ FASE │            ★ punti · serie │ Dalla tua nota │  header glass
├──────────────────────────────────────────────────────────────────────┤
│  Il piano:  ○ base1 (già tuo) ─ ● base2 (adesso) ─ ○ … ─ ◎ obiettivo │  PlanMap (timeline orizz.)
├───────────────────────────────────────────┬──────────────────────────┤
│  Lezione (scroll, max 680px)              │  Dock operativo (≥360px, │
│   • messaggi del tutor (markdown+KaTeX)   │  40%, sticky)            │
│   • AnswerCard delle risposte date        │   - QuestionDock         │
│   • card errore + "Riprova"               │   - o input libero       │
│   • "Il tutor sta pensando…"              │   - o azioni fine        │
└───────────────────────────────────────────┴──────────────────────────┘
StudyPacer (angolo): micro-pause 15 s ogni 10 min, limite durata opzionale (off di default)
```

### 4.2 Dock della domanda (`QuestionDock.tsx`)

| Caso | Comportamento |
|---|---|
| `role: 'plan'` | Testo della proposta, textarea "Vuoi cambiare qualcosa?", pulsanti "Chiedi una modifica" / "Approva il piano" (invia `'Approvo il piano.'` via `say`) |
| `role: 'check'` | **Domanda nascosta** finché l'utente non preme "Verifica la tua comprensione"; prima di ciò è presente il campo "Pensieri mentre leggi" |
| `kind: 'choice'` | Opzioni A–F + "Non lo so"; slider Fiducia 0–100 step 10 (**default 50**); textarea "Il tuo ragionamento" (facoltativa) |
| `kind: 'open'` | Textarea unica; **nessuna fiducia raccolta** |
| `kind: 'game'` | `GameDock`: modale scura via portal (`role="dialog" aria-modal`), Esc = salta; giochi Lampo/Coppie/Ricomponi/Trova l'intruso/Tabù |
| Dettatura | `MicButton` su ogni campo (whisper locale, `src/main/voice/dictation.ts`) |

Feedback dopo la risposta: `AnswerCard` nel flusso della lezione; la correzione vera arriva come testo del turno successivo del tutor (il campo `why` per opzione è nello schema ma il feedback è demandato al tutor).

### 4.3 Widget di stato

- **Fase** nell'header (Obiettivo/Misura/Piano/Insegnamento/Consolidamento/Conclusa).
- **Punteggio** (`src/shared/score.ts`): 10 pt per check giusto (+5 se fiducia ≥70), 5 pt per punto nei giochi; serie; **calibrazione** = 100 − media |fiducia − esito|. Probe/predict contano solo per la calibrazione.
- **PlanMap**: ordinamento topologico (DFS sulle dipendenze), stati `già tuo` / `adesso` / `fatto` / `da fare` / `obiettivo`.
- **Typing indicator** durante `awaiting: 'teacher'`; popover stato AI globale (`AIStatusPopover`) fuori dalla vista.
- **Summary finale**: "Hai imparato", "Ancora incerto", "Misconcezioni", riga punteggio.

### 4.4 Come guida l'apprendimento attivo

- Ciclo **predict → spiegazione → check** imposto dal prompt; il check è nascosto per forzare la lettura completa prima del retrieval.
- Raccolta di **metacognizione** (fiducia, ragionamento, pensieri durante la lettura) inviata al tutor in `formatLearnerReply`.
- **Free recall** in consolidamento ("Svuota la testa").
- **Gamification** come variante del retrieval, non decorativa (vincolo di prompt: max 1 gioco ogni 3 turni, solo contenuti visti).

---

## 5. Colli di bottiglia e punti ciechi (analisi critica)

Ordinati per impatto stimato. Per ciascuno: problema, evidenza nel codice, conseguenza.

### 5.1 Ciclo di memoria spezzato: la sessione non alimenta FSRS (impatto: critico)

- **Evidenza**: `ReviewLineSchema.via` ammette solo `'review' | 'practice'`; `createSessionRunner` non riceve `MemoryStore`; nessun `append` a `reviews.jsonl` nel flusso sessione.
- **Conseguenza**: il momento di massima intensità cognitiva (encoding + primo retrieval) non lascia traccia nel modello di memoria. Un concetto appena insegnato e verificato resta "mai visto" per FSRS; il primo ripasso dipende dal caso (`NEW_PER_SESSION`, ordinamento per `depth`) e non dal fatto che sia stato appena studiato. La promessa "il tutor parte dalla tua memoria" è unidirezionale.
- **Prerequisito mancante**: per scrivere evidenza servirebbe sapere *a quale `Concept.id`* si riferisce una domanda → vedi 5.2.

### 5.2 Piano LLM scollegato dal grafo dei concetti (impatto: alto)

- **Evidenza**: `PlanNodeSchema = { id, title, status }` con id liberi; il prompt riceve i concetti solo come testo in `memoryBrief` (nome, senza `id` né catene).
- **Conseguenze**:
  - impossibile attribuire risultati di `check` ai concetti del grafo (blocca 5.1);
  - il piano può contraddire le dipendenze già estratte (`chains`) senza che nessuno lo rilevi;
  - la "ricerca binaria" della fase di misura viene rifatta da zero dall'LLM invece di sfruttare la struttura `depth`/`chains` esistente (che è esattamente un DAG di prerequisiti);
  - i nodi "known" dichiarati dal tutor non vengono confrontati con R reale.

### 5.3 Matching della nota fragile e a nota singola (impatto: alto)

- **Evidenza**: `matchNote` usa solo titolo/alias e conteggio di parole condivise; nessuno stemming (es. "derivata" vs "derivate"), nessun uso del corpo, del grafo o di embedding; soglia rigida.
- **Conseguenze**: falsi negativi (sessione "a vuoto", senza materiale né memoria — `memoryBrief` richiede la nota) e falsi positivi silenziosi (nota sbagliata iniettata per 60k caratteri). L'utente non può scegliere o correggere la nota abbinata dalla UI (vede solo il chip "Dalla tua nota: …" a posteriori). Le note prerequisito collegate non entrano mai nel contesto.

### 5.4 Fasi e protocollo affidati interamente al prompt (impatto: alto)

- **Evidenza**: `TeacherTurnSchema.superRefine` verifica la forma (opzioni, `correct`, `why`, archi validi, `done` ⇒ `summary`), ma non le **transizioni** (es. `plan → teach` senza approvazione, `teach` senza `predict`, `check` senza nodo, più di un gioco ogni tre turni, `done` senza `recall`).
- **Conseguenze**: la qualità didattica dipende dall'aderenza del modello a un system prompt di ~70 righe che cresce nel tempo in una conversazione lunga (deriva delle istruzioni). Nessuna metrica misura l'aderenza. Il `phase` mostrato in UI è autodichiarato dal modello.

### 5.5 Contesto e costo: nota da 60k nel primo turno + conversazione illimitata (impatto: medio-alto)

- **Evidenza**: `NOTE_LIMIT = 60_000`; nessun riassunto/compattazione della conversazione; `--resume` riapre l'intero transcript ogni turno.
- **Conseguenze**: costo e latenza per turno crescono monotonicamente con la lunghezza della sessione; la nota (e il system prompt) si allontanano dal fondo del contesto; per agy il system prompt è concatenato al primo messaggio (nessun canale `system` dedicato). Nessun uso esplicito di prompt caching. `logUsage` registra i token ma nessuno li usa per governare la sessione.

### 5.6 Latenza percepita e accodamento per motore (impatto: medio-alto)

- **Evidenza**: `enqueue(engine)` serializza *tutte* le chiamate per engine; `teach` e `grade` condividono `claude`; se l'utente sposta `teach` su Gemini, condivide la coda con estrazione in background e generazione varianti (timeout fino a 300 s). Ogni turno è una spawn di processo CLI (cold start), output non in streaming (`--output-format json`), e un JSON non valido costa un **secondo round-trip completo**.
- **Conseguenze**: tempi di risposta di decine di secondi o minuti, senza priorità per l'interazione sincrona. L'UI mostra solo "Il tutor sta pensando…" senza progresso né stima. Nessuna cancellazione (`signal` esiste in `SpawnFn` ma non è usato dalla sessione).

### 5.7 Complessità O(n²) su ogni evento e broadcast dello stato completo (impatto: medio)

- **Evidenza**: `append()` → `appendJsonl` → `load()` che rilegge e riduce l'intero file; `onUpdate` invia l'intero `SessionState` (tutti gli `items` con tutti i blocchi markdown) via IPC; `list()` legge e riduce **ogni** file di sessione per costruire l'elenco (usato anche da `suggest` ad ogni richiesta di suggerimenti).
- **Conseguenze**: trascurabile oggi, ma cresce con numero e lunghezza delle sessioni; `list()` diventerà il collo di bottiglia della Home. Un indice/sommario per sessione o uno snapshot incrementale risolverebbe.

### 5.8 Segnale di confidenza distorto e incompleto (impatto: medio)

- **Evidenza**: slider fiducia con **default 50** inviato sempre per le scelte (non distinguibile da "non toccato"); nessuna fiducia per domande `open` e `recall`; per i giochi solo `score/total`.
- **Conseguenze**: anchoring sul 50; la calibrazione (`score.ts`) e la regola "sbagliato e sicuro = misconcezione" ricevono dati rumorosi; le risposte aperte — le più ricche — sono prive del segnale metacognitivo che il prompt dichiara centrale.

### 5.9 Correttezza valutata dall'LLM che ha scritto la domanda (impatto: medio)

- **Evidenza**: `correct` e `why` sono generati nello stesso turno della domanda; nessuna verifica indipendente (diversamente dal Ripasso, che ha un grader separato). Le risposte aperte e la spiegazione del Tabù sono giudicate dallo stesso tutor nel turno dopo, senza rubrica.
- **Conseguenze**: un `correct` errato fa marcare un nodo come "fatto" (o no), altera punti e calibrazione, e diventa un "errore" nel `sessionDigest` usato per la nota viva. Self-grading senza controllo incrociato.

### 5.10 Euristica `doneNodeIds` fragile (impatto: medio)

- **Evidenza** (`reduceSession`): un nodo diventa "fatto" solo se (a) un `check` *a scelta* o un *gioco* su quel nodo è riuscito **e** (b) il turno successivo sposta `nodeId` su un altro nodo.
- **Conseguenze**: i check aperti non contano mai; l'ultimo nodo (tipicamente il `goal`) non viene mai marcato "fatto"; se il tutor omette `nodeId` il progresso si blocca; un nodo rimosso da un piano aggiornato perde lo stato. La timeline può quindi mostrare progresso incoerente rispetto a quanto realmente dimostrato.

### 5.11 Interazione rigida durante una domanda aperta (impatto: medio, UX)

- **Evidenza**: `runner.say` lancia `'prima rispondi alla domanda aperta'` se c'è una domanda pendente non `plan`; in UI l'input libero è mostrato solo quando non c'è domanda.
- **Conseguenze**: lo studente non può chiedere un chiarimento, segnalare un errore del tutor o dire "la domanda è ambigua" senza rispondere (o scegliere "Non lo so", che inquina la serie e i segnali). Non esistono "salta", "torna indietro", "spiegamelo diversamente", né modifica di una risposta inviata per errore (Invio invia immediatamente).

### 5.12 Domanda di check nascosta: costo di interazione (impatto: basso-medio, UX)

- **Evidenza**: `revealed = q.role !== 'check'`; serve un clic in più per ogni check.
- **Valutazione**: pedagogicamente motivato (lettura completa prima del retrieval), ma aggiunge attrito ad ogni ciclo e sposta l'attenzione tra pannelli (lezione a sinistra, invito a destra). Il campo "Pensieri mentre leggi" compare solo per i check, non per le spiegazioni senza check.

### 5.13 Digest per la nota viva troncato in coda (impatto: basso-medio)

- **Evidenza**: `sessionDigest` taglia a 8 000 caratteri `out.slice(0, …)`: si perde la parte finale, che contiene consolidamento e `summary` (le informazioni più sintetiche e utili).
- **Conseguenza**: per sessioni lunghe la nota viva ignora proprio "cosa resta incerto".

### 5.14 Accoppiamenti e debito minore

- `src/shared/score.ts` importa tipi da `src/main/session/events.ts` (shared → main: inversione di layer).
- Il prompt è hardcoded su un singolo utente ("Andrea", corso di laurea, interessi) e in italiano: nessuna parametrizzazione del profilo né variante per lingua.
- `AnyEvent` valida solo `t`: un evento malformato ma con `t` valido passa al riduttore.
- Nessun limite di durata/numero turni lato codice; il `StudyPacer` è opzionale e disattivato di default.
- `games` disattivati comunicati con una frase appesa al primo messaggio: aderenza non verificata (lo schema accetta comunque `kind: 'game'`).
- Nessuna telemetria didattica aggregata (tempo per fase, turni per nodo, tasso di retry JSON, latenza per turno) nonostante `usage.jsonl` registri già token e durata.

---

## 6. Domande aperte per la deep research

1. **Chiusura del loop memoria**: qual è il modo più solido per convertire evidenza da sessione (check a scelta + fiducia, giochi, recall libero valutato) in `ReviewLine` FSRS senza gonfiare la stabilità (effetto "studio massivo nello stesso giorno")? Pesi diversi per `predict` / `check` / `recall`? Short-term scheduling FSRS-6 vs learning steps?
2. **Grounding del piano**: vincolare `PlanNode.id` a `Concept.id` esistenti (con possibilità di proporre nodi nuovi marcati come tali) e passare al tutor il sotto-DAG di prerequisiti (`chains`) con R per nodo. Pattern noti: knowledge tracing (BKT/DKT), adaptive testing (CAT/IRT) per la fase di misura.
3. **Orchestrazione**: un singolo agente con prompt monolitico vs macchina a stati esplicita nel codice con prompt per fase (probe/teach/check generator + grader indipendente). Trade-off latenza/costo/qualità.
4. **Gestione contesto**: retrieval di sezioni della nota per nodo invece dell'iniezione da 60k; compattazione periodica della conversazione; prompt caching.
5. **Latenza**: streaming dell'output strutturato, processi CLI persistenti o SDK diretto, code con priorità (interattivo > background), cancellazione.
6. **Misura della metacognizione**: elicitazione della fiducia senza anchoring (slider senza default, scala discreta, richiesta prima di vedere le opzioni), fiducia anche su risposte aperte.
7. **Valutazione**: come misurare offline la qualità del tutor (aderenza al protocollo, correttezza di `correct`, qualità dei distrattori) usando i log JSONL già esistenti.
