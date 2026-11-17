# Audit del codice: sessioni di apprendimento in Sinapsi (verifica delle affermazioni del report Gemini)

Scope: ispezione del codice in sola lettura, branch `feat/ui-fixes-r5` (HEAD `b389b16`), repo `/Users/andreaantonelli/Progetti/Sinapsi`. Le "fonti" sono percorsi `file:riga` del repo, tutti relativi alla root del repo. App, CLI e test non sono stati eseguiti.

## Affermazione 1: pedagogia guidata da un unico system prompt monolitico (~70 righe), fasi measure/plan/teach/consolidate

### Takeaway
VERO, con una precisazione sui numeri. `TEACHER_SYSTEM_PROMPT` è un unico template literal di 62 righe. Il prompt descrive 6 fasi, lo schema JSON ne codifica 5, e il codice non controlla mai l'ordine in cui il modello le attraversa.

### Cited Findings
- `TEACHER_SYSTEM_PROMPT` va da `src/main/session/prompt.ts:11` a `:72` (62 righe), tutto in italiano. Ha queste sezioni: Chi è Andrea, Voce, Metodo (due principi), Fasi della sessione, Leggere la fiducia, Materiale di Andrea, Memoria di Andrea, Giochi, Protocollo (obbligatorio) — [prompt.ts:11-72](src/main/session/prompt.ts)
- Le fasi del prompt sono 1 Obiettivo (domanda "goal"), 2 Misura (pavimento e soffitto per ogni filone trovati con ricerca binaria, domande "probe"), 3 Piano (domanda "plan", senza insegnare nello stesso turno), 4 Insegnamento (ciclo predict → spiegazione → check), 5 Consolidamento (recall libero: "Svuota la testa"), 6 Fine ("done" con "summary") — [prompt.ts:29-40](src/main/session/prompt.ts)
- L'enum `phase` dello schema vale `'probe' | 'plan' | 'teach' | 'consolidate' | 'done'`. "Obiettivo" non è una fase: è il ruolo di domanda `goal` — [teacher-protocol.ts:44](src/shared/teacher-protocol.ts); ruoli: [teacher-protocol.ts:3](src/shared/teacher-protocol.ts)
- La validazione della forma sta in `TeacherTurnSchema.superRefine`: una domanda a scelta ha 2–6 opzioni; per i ruoli diversi da goal/plan servono `correct` e `why` (una spiegazione per opzione); i giochi devono essere coerenti; gli archi del piano devono puntare a nodi esistenti; `done` richiede `summary` e nessuna domanda. Nessuna regola riguarda le transizioni di fase — [teacher-protocol.ts:52-77](src/shared/teacher-protocol.ts)
- Il riduttore si limita a copiare `s.phase = t.phase`. La fase è dichiarata dal modello stesso, senza macchina a stati — [events.ts:61](src/main/session/events.ts)
- Il prompt è scritto per un solo utente ("Andrea", il suo corso di laurea, il bodybuilding) — [prompt.ts:13-14](src/main/session/prompt.ts)
- Il system prompt viene passato solo alla prima chiamata. Per `claude` usa `--system-prompt` solo se `!conv?.resume`; per `agy` viene concatenato in testa al primo messaggio — [engines.ts:28, 33](src/main/ai/engines.ts)

### Inferences
- "~70 righe" è un'approssimazione accettabile del valore reale (62). "measure/plan/teach/consolidate" coincide con 4 delle 5 fasi dello schema; manca `done`.
- Dato che con `--resume` il system prompt non viene rimandato, la sua aderenza nelle sessioni lunghe dipende da come la CLI conserva il system prompt della sessione. Non è verificabile dal codice dell'app.

### Gaps
- Nessuna metrica o test misura se il modello rispetta il protocollo di fase. Ho trovato solo lo script `fake-teacher.ts` per i test e2e.

## Affermazione 2: un'intera nota Obsidian (fino a ~60.000 caratteri) iniettata nel primo turno

### Takeaway
VERO. `NOTE_LIMIT = 60_000`. Una nota più lunga viene tagliata a 59.800 caratteri più il marcatore `[…nota troncata]`. Il testo finisce dentro il primo messaggio "learner", non nel system prompt.

### Cited Findings
- `export const NOTE_LIMIT = 60_000`; `capNote` taglia con `text.slice(0, NOTE_LIMIT - 200) + '\n[…nota troncata]'` e antepone un avviso quando la nota contiene `%% verifica-inizio %%`, cioè errori segnalati da `correctness_check.py` — [prompt.ts:1-9](src/main/session/prompt.ts)
- `firstMessage(topic, note, memory)` costruisce `Voglio studiare: …` seguito da `Materiale di Andrea dalla sua nota Obsidian «title»:` con il testo tagliato, e poi accoda il brief di memoria — [prompt.ts:75-83](src/main/session/prompt.ts)
- Viene abbinata una sola nota, con `matchNote`: prima titolo o alias esatto, altrimenti il numero di parole condivise (parole ≥3 lettere, stoplist italiana). Soglia: `max(2, ceil(n/2))` parole se l'argomento ha ≥2 parole. Il corpo della nota non viene usato e non c'è stemming — [note-match.ts:3-33](src/main/session/note-match.ts)
- Il runner legge la nota, il brief di memoria e l'impostazione dei giochi una sola volta, in `createNow`, e li scrive come primo evento `learner`. Se i giochi sono disattivati accoda `(Giochi disattivati: non proporre giochi.)` — [runner.ts:100-116](src/main/session/runner.ts)
- `capNote` viene riusato anche dal generatore della "nota viva" — [notes/prompt.ts:2](src/main/notes/prompt.ts)

### Inferences
- Non c'è retrieval per sezione né per nodo: il contenuto della nota entra una volta sola, all'inizio della conversazione, e poi resta solo nella storia della conversazione.

### Gaps
- Nessuna.

## Affermazione 3: continuità con `--resume`, coda `enqueue`, niente streaming, cold start della CLI a ogni chiamata

### Takeaway
VERO su tutti i punti per `claude`. Per Gemini (`agy`) la continuità passa da `--conversation <id>` e non da `--resume`. La coda è unica per motore e condivisa da tutte le funzioni dell'app. L'output è `--output-format json` bloccante. Ogni turno avvia un nuovo processo.

### Cited Findings
- La coda è per motore: `queues: Record<Engine, Promise>` con `agy` e `claude`, e il commento dice "One call at a time per engine". `converse` e `ask` passano entrambi da `enqueue(engine, …)` — [bridge.ts:74, 81-86, 140, 177](src/main/ai/bridge.ts)
- C'è una seconda serializzazione per singola sessione nel runner (`serial(id, job)`), così gli eventi non si intrecciano — [runner.ts:52-57](src/main/session/runner.ts)
- Argomenti per Claude: `claude -p <prompt> --output-format json [--model m] [--session-id id | --resume id] [--system-prompt …] [--json-schema <schema>]`. Dentro una conversazione si aggiunge il blocco senza strumenti `--tools '' --disallowedTools 'Bash Edit Write Read Glob Grep WebFetch WebSearch Task NotebookEdit' --strict-mcp-config --setting-sources ''` — [engines.ts:21, 32-36](src/main/ai/engines.ts)
- Argomenti per Gemini/agy: `agy -p <text> --output-format json --print-timeout <max(30, timeout_s-10)>s --disable-slash-commands [--model m] [--conversation id] [--json-schema …]` — [engines.ts:27-31](src/main/ai/engines.ts)
- Il primo turno usa `resume: s.hasTeacherTurn` (false), quindi `--session-id <uuid>`; i turni successivi usano `--resume <conversationId>` — [runner.ts:75, 80-89](src/main/session/runner.ts)
- Ogni chiamata passa da `nodeSpawn` → `child_process.spawn(cmd, args, { detached: true, stdio: ['ignore','pipe','pipe'] })`, con kill dell'intero process group al timeout (SIGTERM e poi SIGKILL dopo 2 s) e scadenza forzata a timeout+3 s — [engines.ts:81-137](src/main/ai/engines.ts)
- Non c'è streaming verso la UI. `SpawnFn` accetta `onOutput`, ma `callOnce` non lo passa. L'output viene analizzato dopo l'uscita del processo (`parseOutput` su tutto lo stdout). Per Claude legge `structured_output` o `result`, per agy `response` — [bridge.ts:95-106](src/main/ai/bridge.ts); [engines.ts:39-55](src/main/ai/engines.ts)
- `DEFAULT_TIMEOUT = 180_000` ms — [bridge.ts:63](src/main/ai/bridge.ts)
- Se lo schema fallisce, la stessa conversazione viene ripresa una volta con il messaggio `La risposta precedente non era valida: … Rispondi di nuovo, solo con JSON valido secondo lo schema.`, quindi un secondo round trip completo — [bridge.ts:144-150](src/main/ai/bridge.ts)
- Motori di default: `teach: claude/sonnet`, `grade: claude/sonnet`, `extract` e `note: agy/gemini-3.8-flash-medium`, `variants: agy/gemini-3.8-flash-high`. L'utente li può cambiare per singolo task nelle impostazioni — [settings-schema.ts:4, 11-21, 35-43](src/shared/settings-schema.ts)
- Ogni chiamata viene registrata in `usageFile`: ts, task, engine, model, `input_tokens`, `output_tokens`, ms, ok — [bridge.ts:104, 129-135](src/main/ai/bridge.ts)

### Inferences
- "Trascrizione completa reidratata a ogni turno" è un'inferenza plausibile su come funziona `claude --resume`: la CLI ricarica la sessione salvata e rimanda la storia all'API. Dal codice dell'app si vede solo che manda il nuovo messaggio più `--resume`.
- La coda è condivisa: un turno del tutor su `claude` aspetta la fine di un eventuale `grade` del Ripasso e di qualunque altra chiamata Claude. Se `teach` viene spostato su agy, aspetta l'estrazione in background e la generazione di varianti (`VARIANTS_TIMEOUT = 300_000`, [review.ts:40](src/main/memory/review.ts)). Non esiste un meccanismo di priorità.
- La UI mostra solo "Il tutor sta pensando…" e nessuna cancellazione è collegata alla sessione: il runner non usa mai `signal` — [SessionView.tsx:202-211](src/renderer/src/session/SessionView.tsx)

### Gaps
- Latenze reali per turno non misurate. Esistono i dati in `usage.jsonl` sotto la cartella dati dell'app, ma non li ho letti: la cartella è fuori dal repo e il compito era limitato all'ispezione del codice.

## Affermazione 4: il piano LLM usa ID testuali inventati, non collegati ai `Concept.id` del grafo

### Takeaway
VERO. Gli id dei nodi del piano sono stringhe libere ("Id brevi in minuscolo con trattini"). Il tutor non vede mai gli id dei concetti (`n_…`), ma solo i loro nomi nel brief di memoria. Nessun codice mette in relazione `PlanNode.id` e `Concept.id`.

### Cited Findings
- `PlanNodeSchema = { id: string.min(1), title, status: 'known'|'todo'|'goal' }` ed edges `[da, a]`. L'unico vincolo è la coerenza interna degli archi — [teacher-protocol.ts:14-17, 72-75](src/shared/teacher-protocol.ts)
- Istruzione del prompt: `Id brevi in minuscolo con trattini` — [prompt.ts:69](src/main/session/prompt.ts)
- `memoryBrief` produce righe del tipo `- ${name} — …`, cioè solo il nome, filtrando i concetti con `c.notes.includes(notePath)` e ordinandoli per `depth` crescente, con al massimo `LIMIT = 40` — [memory-brief.ts:5, 10-35](src/main/session/memory-brief.ts)
- I concetti del grafo hanno id `n_…` (il prompt di estrazione chiede `{ "ref": "n_…" }` per i concetti esistenti; gli id locali nuovi sono "p1", "p2") — [extract-prompt.ts:15, 25](src/main/graph/extract-prompt.ts)
- In tutto il codice `plan.nodes` e `nodeId` compaiono solo in `events.ts`, `teacher-protocol.ts`, `PlanMap.tsx` e `fake-teacher.ts`. Nessun modulo li confronta con il grafo (verificato con grep).

### Inferences
- Senza questo collegamento non si possono attribuire gli esiti dei check ai concetti FSRS. È il prerequisito che manca anche per l'affermazione 7.

### Gaps
- Nessuna.

## Affermazione 5: `doneNodeIds` avanza in modo euristico quando il tutor sposta il focus

### Takeaway
PARZIALE, cioè vero ma incompleto. Il nodo corrente viene marcato come fatto solo al cambio di `question.nodeId` e solo se prima c'è stato un check corretto sullo stesso nodo: un check a scelta con risposta uguale a `correct`, oppure un gioco-check con punteggio ≥70%. Il solo spostamento del focus non basta.

### Cited Findings
- `correctChecks` cresce quando `q.role === 'check'` con `answer.choice === q.correct`, oppure con un gioco-check in cui `score/total >= 0.7` — [events.ts:47-51](src/main/session/events.ts)
- All'arrivo di un turno del tutor: se `t.question.nodeId` è diverso da `currentNodeId` e il nodo corrente è in `correctChecks`, viene aggiunto a `doneNodeIds`; poi `currentNodeId = next` — [events.ts:70-74](src/main/session/events.ts)
- Un nodo eliminato da un piano aggiornato non può più essere "adesso" — [events.ts:66-67](src/main/session/events.ts)
- `PlanMap` riceve `current` e `done` per disegnare la timeline — [SessionView.tsx:118](src/renderer/src/session/SessionView.tsx)

### Inferences
- I check aperti (`kind: 'open'`) non fanno mai avanzare il progresso. L'ultimo nodo (di solito il `goal`) non viene mai marcato perché nessun turno sposta il focus dopo di lui. Se il tutor omette `nodeId`, il progresso si ferma. I nodi fatti non tornano mai indietro.

### Gaps
- Nessuna.

## Affermazione 6: lo stesso LLM genera la domanda, valuta le risposte aperte e scrive il "perché" (nessun grader indipendente)

### Takeaway
VERO per le sessioni. Per le domande a scelta il codice confronta in modo deterministico la scelta con il `correct` indicato dal tutor stesso. Le risposte aperte e il Tabù le giudica il tutor nel turno successivo della stessa conversazione, senza rubrica e senza `GRADING_RIGOR`. Un grader separato esiste invece nel Ripasso, nella Pratica e negli esami.

### Cited Findings
- `correct` e `why` (uno per opzione) arrivano nello stesso turno in cui il tutor genera la domanda — [teacher-protocol.ts:29-39, 57-60](src/shared/teacher-protocol.ts); [prompt.ts:70](src/main/session/prompt.ts)
- `formatLearnerReply` scrive `— corretta` oppure `— sbagliata (giusta: X)` confrontando la scelta con il `q.correct` del tutor. Per le risposte aperte manda solo `«testo»` — [teacher-protocol.ts:105-122](src/shared/teacher-protocol.ts)
- `AnswerCard` mostra subito il `why` di ogni opzione per le domande a scelta valutate — [AnswerCard.tsx:17-34](src/renderer/src/session/AnswerCard.tsx)
- Per il Tabù il prompt dice "nel turno dopo giudica la spiegazione" — [prompt.ts:62](src/main/session/prompt.ts)
- `GRADING_RIGOR` è usato in `memory/grade-prompt.ts:17`, `memory/explain.ts:49`, `practice/prompt.ts:57` e `practice/exam.ts:59`, ma non in `session/prompt.ts` — [rigor.ts:5-11](src/main/ai/rigor.ts)
- Grader del Ripasso: una chiamata `ask` separata con `task: 'grade'` (di default Claude Sonnet), con risposta di riferimento e schema `{verdict: ok|partial|wrong, feedback}` — [grade-prompt.ts:5-20](src/main/memory/grade-prompt.ts); [review.ts:41](src/main/memory/review.ts) (`GRADE_TIMEOUT = 120_000`)

### Inferences
- Il grader del Ripasso è una chiamata indipendente ma usa la stessa famiglia di modello (sonnet). Non è un controllo incrociato tra modelli diversi.
- Un `correct` sbagliato del tutor finisce a cascata in `doneNodeIds`, punteggio, calibrazione e nella riga "errore" del `sessionDigest`.

### Gaps
- Nessuna.

## Affermazione 7: FSRS è in sola lettura per le sessioni; ts-fsrs, versione, FSRS-6, short-term

### Takeaway
VERO. La sessione legge un riassunto della memoria una volta, alla creazione, e non scrive mai in `reviews.jsonl`. Il file viene scritto dal Ripasso (via IPC `review:record`), dalla Pratica e dagli esami. È installato `ts-fsrs` 5.4.2, che implementa FSRS-6. Viene usato con `generatorParameters({ enable_fuzz: false })`, quindi con gli altri parametri di default: `enable_short_term = true`, learning steps `1m, 10m`, relearning `10m`, retention 0.9. C'è un'incoerenza: la R mostrata usa la curva FSRS-5 (decay −0.5), mentre la stabilità arriva dallo scheduler FSRS-6.

### Cited Findings
- Dipendenza `"ts-fsrs": "5.4.2"` — [package.json:39](package.json); nel bundle: `const FSRSVersion = \`v${version} using FSRS-6.0\``, `FSRS6_DEFAULT_DECAY = 0.1542` — [node_modules/ts-fsrs/dist/index.mjs:514, 519](node_modules/ts-fsrs/dist/index.mjs)
- Default della libreria: `default_request_retention = 0.9`, `default_maximum_interval = 36500`, `default_enable_fuzz = false`, `default_enable_short_term = true`, `default_learning_steps = ["1m","10m"]`, `default_relearning_steps = ["10m"]` — [index.mjs:502-512](node_modules/ts-fsrs/dist/index.mjs)
- Scheduler dell'app: `fsrs(generatorParameters({ enable_fuzz: false }))`, quindi short-term attivo e pesi di default, senza ottimizzazione per l'utente. Le card non vengono salvate: si ricostruiscono rigiocando tutte le ReviewLine — [fsrs.ts:4-13](src/main/memory/fsrs.ts)
- La R mostrata usa la curva FSRS-5 scritta a mano: `DECAY = -0.5`, `FACTOR = 19/81`, con giorni frazionari. In (re)learning viene limitata a ≤0.40 dopo "Di nuovo" e a ≤0.75 dopo "Difficile" — [fsrs.ts:39-58](src/main/memory/fsrs.ts)
- Stati: `la sai` con R ≥ 0.85, `incerto` con ≥ 0.6, `debole` sotto, `mai visto` con null. `misconception = last.correct === false && confidence >= 70` — [memory-types.ts:46](src/shared/memory-types.ts); [fsrs.ts:31](src/main/memory/fsrs.ts)
- Store: `reviews.jsonl`, append-only — [memory/store.ts:7-11](src/main/memory/store.ts)
- Chi scrive: `ReviewService.record` (`deps.memory.append(r)`, [review.ts:250-251](src/main/memory/review.ts)), chiamato dalla UI del Ripasso tramite `api.review.record` ([ReviewView.tsx:237](src/renderer/src/review/ReviewView.tsx); IPC [ipc.ts:382](src/main/ipc.ts), [ipc-handlers.ts:429](src/main/ipc-handlers.ts)); la Pratica (`via: 'practice'`, ref `train:…`, [practice/runner.ts:80](src/main/practice/runner.ts)); gli esami (`via: 'practice'`, [practice/exam.ts:125](src/main/practice/exam.ts))
- `ReviewLineSchema.via` vale `'review' | 'practice'`; non esiste un valore `'session'` — [memory-types.ts:8-26](src/shared/memory-types.ts)
- Il runner delle sessioni non riceve `MemoryStore`: le sue dipendenze sono bridge, dir, vault, readNote, onUpdate, uuid, games, memory (una funzione che restituisce una stringa) — [runner.ts:35-46](src/main/session/runner.ts). La lettura è collegata in [ipc.ts:171-176](src/main/ipc.ts) come `memoryBrief(graph, memoryOf(reviews.jsonl), notePath)`
- Voto della Pratica: `solved` vale 3; `solved_hints` vale 1 se il rung ≥3, altrimenti 2; il resto vale 1 — [practice/runner.ts:41-45](src/main/practice/runner.ts). `proposeGrade` del Ripasso: sbagliato o non lo so vale 1, parziale 2, giusto con fiducia <50 vale 2, altrimenti 3; il 4 non viene mai proposto — [memory-types.ts:52-56](src/shared/memory-types.ts)

### Inferences
- Lo short-term è attivo e le ripetizioni nello stesso giorno sono gestite dai learning steps. Se le evidenze di sessione venissero scritte senza accorgimenti, più check sullo stesso concetto nella stessa giornata verrebbero rigiocati come ripetizioni a breve termine.
- Il mix di stabilità FSRS-6 e curva FSRS-5 (decay fisso 0.5 contro w20 di default 0.1542) fa sì che la R mostrata e nel brief non corrisponda alla R interna dello scheduler. Il commento nel codice parla ancora di "FSRS-5 forgetting curve".

### Gaps
- Non ho verificato se in ts-fsrs 5.4.2 `forgetting_curve` usi w[20]. L'ho dedotto dalla costante `FSRS6_DEFAULT_DECAY` e dalla stringa di versione.

## Affermazione 8: il grafo usa Tarjan SCC e catene inferenziali per la profondità dei concetti

### Takeaway
VERO. `depth` è il cammino più lungo tra le premesse, calcolato su catene `premises → conclusion`, con i cicli compressi tramite Tarjan SCC.

### Cited Findings
- Commento: "Longest premise path to each node (Learn Harness inference depth). Cycles are collapsed with Tarjan's SCC first" — [derive.ts:48-52](src/main/graph/derive.ts); i componenti vengono visitati in ordine topologico inverso — [derive.ts:87](src/main/graph/derive.ts); assegnazione `c.depth` — [derive.ts:39-40](src/main/graph/derive.ts)
- Schema delle catene: `{ id, premises[], conclusion, notePath, at }`; Concept ha `depth: number` — [graph-types.ts:15, 47-49](src/shared/graph-types.ts)
- Nelle sessioni il grafo serve solo a ordinare il brief per `depth` (basi prima). Le catene non vengono passate al tutor — [memory-brief.ts:26](src/main/session/memory-brief.ts)

### Inferences
- Il DAG dei prerequisiti esiste già, ma il piano del tutor ne viene ricavato da zero.

### Gaps
- Nessuna.

## Affermazione 9: layout di SessionView 60/40, lezione a sinistra e dock della domanda a destra, giochi in modale

### Takeaway
VERO. La griglia è `minmax(0, 1fr) minmax(360px, 40%)`, quindi circa 60/40 con un minimo di 360 px per il dock. I giochi si aprono in una modale via portal. Sopra lo split c'è una timeline orizzontale del piano.

### Cited Findings
- `.sess :is(.body, .split) { … grid-template-columns: minmax(0, 1fr) minmax(360px, 40%); gap: 24px; … }` — [session.css:728](src/renderer/src/session/session.css). Una regola più vecchia `grid-template-columns: 1fr 280px` si trova a [session.css:78](src/renderer/src/session/session.css); la cascata fa prevalere quella della riga 728
- Struttura: header (fase, punteggio, chip della nota) → `<PlanMap>` → `<main className="body split">` con la lezione scorrevole e `<aside className="dockwrap ops">` che contiene `QuestionDock`, l'input libero oppure le azioni finali — [SessionView.tsx:98-290](src/renderer/src/session/SessionView.tsx)
- Giochi: `GameDock` usa `createPortal` con `<section role="dialog" aria-modal="true">` — [GameDock.tsx:2, 34-36](src/renderer/src/session/games/GameDock.tsx). Tipi: Speed, Match, Order, Spot, Taboo (`src/renderer/src/session/games/`)
- Commit: `5224dc8` (2026-11-16) "Sessione: layout A con piano orizzontale, split 60/40 e giochi in modale"; `b389b16` "pannello domanda completo senza scroll, slider fiducia allineato" (git log)

### Inferences
- Nessuna.

### Gaps
- Nessuna.

## Affermazione 10: slider della fiducia con default 50 (0–100), fiducia raccolta solo per la scelta multipla

### Takeaway
VERO. `useState(50)`, intervallo 0–100, `step={10}`. La fiducia si invia solo se `kind === 'choice'`, la domanda non è `goal` e non è stato scelto "Non lo so". Il valore parte sempre da 50 anche se l'utente non tocca lo slider. Le domande aperte e i giochi non raccolgono fiducia.

### Cited Findings
- `const [confidence, setConfidence] = useState(50)` — [QuestionDock.tsx:22](src/renderer/src/session/QuestionDock.tsx)
- Slider `min={0} max={100} step={10}`, mostrato solo per `isChoice && !isGoal && pick !== 'idk'` — [QuestionDock.tsx:171, 198-214](src/renderer/src/session/QuestionDock.tsx)
- `send()`: `a.confidence = confidence` solo per le scelte non-goal; per `open` si invia solo `a.text = text.trim()` — [QuestionDock.tsx:137-152](src/renderer/src/session/QuestionDock.tsx)
- Lo schema accetta `confidence: int 0–100 optional` — [teacher-protocol.ts:95](src/shared/teacher-protocol.ts)
- La domanda di `check` resta nascosta finché non si preme "Verifica la tua comprensione"; prima compare il campo "Pensieri mentre leggi" (`revealed = q.role !== 'check'`) — [QuestionDock.tsx:19, 92-132](src/renderer/src/session/QuestionDock.tsx)
- I giochi seguono un percorso separato (`if (q.kind === 'game') return <GameDock …/>`) e inviano solo `{score,total,detail}` — [QuestionDock.tsx:44](src/renderer/src/session/QuestionDock.tsx); [teacher-protocol.ts:98](src/shared/teacher-protocol.ts)
- Uso della fiducia: punteggio con +5 se la fiducia è ≥70 su un check giusto; calibrazione = `100 − media|fiducia − esito|` (probe e predict entrano solo nella calibrazione) — [score.ts:5-43](src/shared/score.ts). Il prompt ("Leggere la fiducia") parla di "Ogni risposta a scelta ha una fiducia 0–100%" — [prompt.ts:42-43](src/main/session/prompt.ts)

### Inferences
- Il valore 50 non toccato non si distingue da un 50 scelto. È un rischio di ancoraggio e rende rumorose la calibrazione e la regola "sbagliato e sicuro".

### Gaps
- Nessuna.

## Mappa di ciò che esiste (oltre le 10 affermazioni)

### Takeaway
Non c'è una macchina a stati esplicita. Lo stato della sessione è un fold puro di un event log JSONL per sessione. Attorno alla sessione ci sono moduli per Ripasso (FSRS più grader), Pratica ed esami (scrivono FSRS), note vive (consumano il digest della sessione) e suggerimenti (leggono l'elenco delle sessioni). Le misconcezioni vengono tracciate in tre punti non collegati tra loro.

### Cited Findings
- **Stato ed eventi.** Gli eventi sono `created | learner | teacher | error`. `reduceSession` è puro. `awaiting` vale `'teacher' | 'learner' | 'retry'`; un messaggio "learner" rimasto senza risposta diventa `retry` se nessuna chiamata è in corso. Il file è `<dataDir>/sessions/<id>.jsonl` — [events.ts:3-86](src/main/session/events.ts); [runner.ts:48, 58-67](src/main/session/runner.ts); [ipc.ts:164](src/main/ipc.ts). `AnyEvent` controlla solo che `t` sia una stringa — [runner.ts:27](src/main/session/runner.ts). Ogni `append` rilegge e riduce tutto il file e trasmette l'intero `SessionState` — [runner.ts:64-67](src/main/session/runner.ts)
- **API del runner.** `create/start/answer/say/retry/get/list`. `answer` richiede che `questionId` corrisponda alla domanda pendente. `say` (testo libero) è permesso solo se non c'è domanda pendente o se la domanda è `plan` ("prima rispondi alla domanda aperta"). Doppio clic deduplicato per 2 s. Dopo un errore il prompt viene rimandato con il prefisso "(Ripeto il mio ultimo messaggio…)" — [runner.ts:15-24, 77-78, 118-162](src/main/session/runner.ts). Validazione IPC con zod — [ipc-handlers.ts:324-334](src/main/ipc-handlers.ts)
- **Come vengono registrate le risposte.** Evento `learner` con `text = formatLearnerReply(q, a)` (riga in italiano con la lettera, corretta o sbagliata, `fiducia N%`, ragionamento e pensieri), più `answer` e `question` grezzi — [runner.ts:147](src/main/session/runner.ts); [teacher-protocol.ts:105-122](src/shared/teacher-protocol.ts)
- **Tipi di domanda e gioco.** Ruoli: goal/probe/plan/predict/check/recall. Tipi: choice (2–6 opzioni) / open / game. Giochi: `speed` "Lampo" (3–10 V/F), `match` "Coppie" (2–8), `order` "Ricomponi" (3–8), `spot` "Trova l'intruso" (2–10 righe), `taboo` "Tabù" (2–8 parole proibite) — [teacher-protocol.ts:3, 19-27, 29-39](src/shared/teacher-protocol.ts). Regola del prompt: al massimo un gioco ogni tre turni, solo su contenuti già visti — [prompt.ts:56-63](src/main/session/prompt.ts). Impostazione `gamesInSessions` (default true) — [settings-schema.ts:48](src/shared/settings-schema.ts)
- **Esercizi del Ripasso** (diversi dai giochi di sessione): `EXERCISE_TYPES = open, mc, truefalse, order, fill, match, counterexample, estimate, spoterror, graph, explain` — [memory-types.ts:3](src/shared/memory-types.ts). `NEW_PER_SESSION = 5`, `EXPLAIN_SHARE = 4`, interleaving tra note — [review.ts:38-53](src/main/memory/review.ts). Dimensione della seduta `reviewSessionSize` di default 12 — [settings-schema.ts:45](src/shared/settings-schema.ts)
- **Pratica.** Un runner conversazionale separato con la stessa architettura (`converse`, `task: 'teach'`, `PRACTICE_SYSTEM_PROMPT` con `GRADING_RIGOR`, modi recall/discrimination/composition, banda di successo intorno all'85%). Scrive ReviewLine quando un problema si conclude — [practice/prompt.ts:4-57](src/main/practice/prompt.ts); [practice/runner.ts:47-108](src/main/practice/runner.ts)
- **Note vive.** Dopo la fase `done`, "Crea la nota viva" usa `sessionDigest`: previsioni, errori sicuri (scelta sbagliata con fiducia ≥70), "parole", summary. `DIGEST_LIMIT = 8000` caratteri, tagliati in coda — [notes/prompt.ts:6, 13-35](src/main/notes/prompt.ts); [notes/generator.ts:54-111](src/main/notes/generator.ts); [SessionView.tsx:258-275](src/renderer/src/session/SessionView.tsx)
- **Suggerimenti.** Leggono `SessionSummary`: una sessione `done` con nota fa contare la nota come "studiata"; la sessione non finita più recente diventa "sessione da finire" — [suggest.ts:5-6, 49, 104-107](src/main/suggest/suggest.ts)
- **Tutor delle lezioni** (`tutor/sinapsi-tutor.ts`): legge il calendario e il tutor Obsidian `.antigravity/tutor` in sola lettura; la padronanza è la R FSRS ricostruita da Ripasso e Pratica. Non riguarda le sessioni — [sinapsi-tutor.ts:17-25](src/main/tutor/sinapsi-tutor.ts)
- **Altri moduli.** `lessons/` (registro delle lezioni con eventi `session-launched`, [ipc-handlers.ts:313](src/main/ipc-handlers.ts)), `planner/` (plan.ts, readiness.ts), `exams/`, `voice/dictation.ts` (dettatura whisper su ogni campo, `MicButton`), `StudyPacer` (micro-pause di `MICRO_PAUSE_SECONDS = 15` ogni `MICRO_PAUSE_EVERY = 10` minuti, opzionali e spente di default; limite di sessione opzionale di 50 minuti) — [settings-schema.ts:22-27, 51-55](src/shared/settings-schema.ts)
- **Tracciamento di misconcezioni e debolezze.** (a) FSRS: `Memory.misconception` (ultimo errore con fiducia ≥70) più il campo opzionale `misconception` in ReviewLine; `ReviewService.plan({weakest, misconceptions})` — [fsrs.ts:31](src/main/memory/fsrs.ts); [review.ts:29](src/main/memory/review.ts). (b) Sessione: `summary.misconceptions[]` dichiarato dal modello alla fine — [teacher-protocol.ts:40](src/shared/teacher-protocol.ts). (c) Digest: righe "errore". Le misconcezioni emerse in sessione non tornano mai in FSRS.
- **Prompt caching e cache.** Il codice dell'app non usa esplicitamente il prompt caching. `ask()` ha una cache di risposte su file (sha256 di engine|model|prompt|schema) attiva solo con `cache: true`; `converse()` (sessioni e pratica) non ha nessuna cache — [bridge.ts:161-204](src/main/ai/bridge.ts). Il log dei consumi registra solo `input_tokens` e `output_tokens`, non i token di cache — [engines.ts:46-47](src/main/ai/engines.ts)
- **Recenti modifiche legate alle sessioni** (git log): `b389b16` (pannello domanda, slider), `5224dc8` 2026-11-16 (layout A 60/40, giochi in modale), `cff8d39` 2026-11-12 (tutor nativo, ritmo di studio), `14a5ec3` 2026-11-05, `c8fca5e` 2026-11-02 ("il tutor parte dalla memoria dei concetti": introduce il memory brief), `05d3949` (la verifica di correttezza delle note non viene insegnata), `87704b6` (rigore della correzione in Ripasso, Pratica ed esame, non nelle sessioni)

### Inferences
- "Session state machine" non esiste nel codice: esistono solo il riduttore di eventi e la fase dichiarata dal modello.

### Gaps
- Se e come la CLI `claude` applichi automaticamente il prompt caching dell'API alle sessioni riprese non si vede dal codice dell'app.

## Confronto con session_analysis.md (analisi interna)

### Takeaway
L'analisi interna (`session_analysis.md`, 286 righe) concorda con il codice su quasi tutti i punti. Ho trovato una discrepanza (il feedback `why`) e due omissioni: il disallineamento FSRS-6/FSRS-5 e i parametri short-term di default.

### Cited Findings
- Concorda su: prompt monolitico (~70 righe), nota da 60k, piano scollegato, `doneNodeIds` (descritto bene, comprese le condizioni del check corretto e del cambio di nodo), nessuna scrittura FSRS, grader non indipendente, split 60/40 con dock ≥360 px, slider a 50 senza fiducia sulle domande aperte, coda per motore, nessuno streaming, cold start, timeout di 180 s, motori di default, digest a 8000 caratteri troncato in coda, `AnyEvent` debole, `say` bloccato durante le domande — [session_analysis.md:8-16, 78-79, 113-143, 169-170, 197-262](session_analysis.md)
- DISCREPANZA: l'analisi dice "il campo `why` per opzione è nello schema ma il feedback è demandato al tutor" ([session_analysis.md:174](session_analysis.md)). In realtà `AnswerCard` mostra subito il `why` di ogni opzione, evidenziando quella giusta — [AnswerCard.tsx:29-34](src/renderer/src/session/AnswerCard.tsx)
- OMISSIONE: l'analisi descrive correttamente la curva FSRS-5 in `displayedR` ([session_analysis.md:119](session_analysis.md)) ma non segnala che ts-fsrs 5.4.2 è FSRS-6 (decay di default 0.1542). Non riporta neppure `enable_short_term = true` e i learning steps `1m/10m` attivi per default; li cita solo come domanda aperta ([session_analysis.md:280](session_analysis.md))
- Precisazione: il "~70 righe" dell'analisi ([session_analysis.md:220](session_analysis.md)) corrisponde a 62 righe effettive

### Inferences
- `session_analysis.md` è una base affidabile. Su quasi tutti i punti il report Gemini sembra ricalcarla.

### Gaps
- Non ho verificato la data o l'autore di `session_analysis.md`: il file non è tracciato da git.
