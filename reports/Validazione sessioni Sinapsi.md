# Sessioni di apprendimento Sinapsi: interventi validati, corretti e scartati

## 1. Bug e incoerenze da correggere subito

### 1.1 Allineare `displayedR` alla curva FSRS-6 dello scheduler
- **Proposta / Intervento:** in `src/main/memory/fsrs.ts:39-58` va eliminata la curva scritta a mano (`DECAY = -0.5`, `FACTOR = 19/81`). R va calcolata con la stessa funzione e gli stessi pesi dello scheduler: `get_retrievability` di ts-fsrs 5.4.2, oppure `R = (1 + factor·t/S)^(−w20)` con `w20 = 0.1542` e `factor = 0.9^(−1/w20) − 1`. Il cap (≤0.40 dopo "Di nuovo", ≤0.75 dopo "Difficile") resta, ma va applicato sopra la R corretta. Il commento "FSRS-5 forgetting curve" va aggiornato. Serve un test che confronti `displayedR` con la R interna dello scheduler su t = 0.5S, S, 3S.
- **Validazione (Fonte vs. Sinapsi):** ts-fsrs 5.4.2 dichiara `"v5.4.2 using FSRS-6.0"` e `FSRS6_DEFAULT_DECAY = 0.1542` (`node_modules/ts-fsrs/dist/index.mjs:514,519`). Il decay fisso −0.5 vale per FSRS-4.5/5 (awesome-fsrs wiki). Le due curve coincidono solo a t = S. A t = 3S FSRS-6 dà R ≈ 0.81 e la curva in uso dà ≈ 0.77 (calcolo nelle note di ricerca). Questa R alimenta le soglie `la sai` ≥ 0.85 e `incerto` ≥ 0.6 (`memory-types.ts:46`), il brief del tutor (`memory-brief.ts:24-35`) e quindi anche il pruning dell'albero minimo (§3.1). Il report Gemini non segnala il problema e nemmeno `session_analysis.md` lo fa.
- **Priorità / Impatto:** Alto. Bastano poche righe e nessuna chiamata LLM. È un prerequisito per tutte le soglie su R.

### 1.2 Dare davvero la memoria al tutor della Pratica
- **Proposta / Intervento:** in `src/main/practice/material.ts:50-93` (collegato in `ipc.ts:407-418`) va aggiunto un blocco `STATO DI MEMORIA` con le righe `id | nome | stato | R | S | misconcezione`. Si riusa la logica di `memoryBrief` aggiungendo gli id, e poi le debolezze attive di §5.1. Se il blocco non si aggiunge, va tolta dal prompt la frase che afferma il contrario.
- **Validazione (Fonte vs. Sinapsi):** `practice/prompt.ts:30` dice "Bersaglio: prima il più debole (la memoria è nel materiale)", ma `buildMaterialContext` invia solo concetti, catene, note, fonti e testo libero. Mancano R, stato e misconcezioni. Il prompt promette al modello dati che non riceve, e il modello sceglie il bersaglio alla cieca. È la stessa idea di "profile routing" per ruolo di DeepTutor (arXiv 2604.26962 §2.1.2), ottenuta con una semplice concatenazione di stringhe.
- **Priorità / Impatto:** Alto. Zero chiamate aggiuntive e sforzo minimo.

### 1.3 Contare i check aperti e chiudere l'ultimo nodo
- **Proposta / Intervento:** soluzione ponte in `src/main/session/events.ts:47-51,70-74`, in attesa della regola di padronanza (§2.2). Primo, un check `open` con verdetto `correct` del grader (§3.2) conta come `correctChecks`. Secondo, alla fase `consolidate`/`done` vanno marcati come fatti anche il nodo corrente e il `goal`, se hanno un check corretto. Terzo, un turno `teach`/`check` senza `nodeId` va rifiutato in `TeacherTurnSchema.superRefine` (`teacher-protocol.ts:52-77`): oggi blocca il progresso senza segnalarlo.
- **Validazione (Fonte vs. Sinapsi):** oggi avanzano solo i check a scelta con `answer.choice === q.correct` e i giochi con punteggio ≥70%. Il nodo viene marcato solo quando il focus si sposta, quindi l'ultimo nodo non viene mai chiuso. I dati di apprendimento più forti sono proprio quelli scartati: il recall aperto produce effetti maggiori del riconoscimento (Rowland 2014).
- **Priorità / Impatto:** Alto. È una correzione locale al riduttore.

### 1.4 Pulizia minore
- **Proposta / Intervento:** (a) Rimuovere la regola CSS obsoleta `grid-template-columns: 1fr 280px` (`session.css:78`), che oggi è coperta dalla riga 728. (b) Tipizzare `AnyEvent` con una discriminated union zod (`runner.ts:27`): oggi controlla solo che `t` sia una stringa. (c) Smettere di rileggere e ridurre l'intero file a ogni `append` (`runner.ts:64-67`) e in `list()` (`runner.ts:164-173`): basta un fold incrementale in memoria più l'indice di §5.3.
- **Validazione (Fonte vs. Sinapsi):** sono difetti strutturali documentati nell'audit. Non cambiano la pedagogia, ma rendono fragili le modifiche di §2 e §3, che aggiungono eventi.
- **Priorità / Impatto:** Basso. Sforzo minimo.

## 2. Flusso di Sessione & Logica FSRS

### 2.1 Chiudere il loop: le sessioni scrivono in `reviews.jsonl`, una review per concetto per sessione
- **Proposta / Intervento:**
  - Aggiungere `'session'` a `ReviewLineSchema.via` (`memory-types.ts:8-26`) e i campi `source: 'session-llm' | 'session-choice'`, `sessionId`, `evidence: 'probe' | 'retest' | 'recall'`.
  - Iniettare `MemoryStore` nelle dipendenze del runner (`runner.ts:35-46`).
  - Alla fase `done`, o all'abbandono dopo almeno un check, scrivere **al massimo una ReviewLine per `Concept.id` per sessione**. La chiave è la sessione e non il giorno, così una sessione a cavallo della mezzanotte non produce doppie review.
  - Quale evidenza usare: per un concetto con storia FSRS precedente, l'esito del probe iniziale, che è la vera review a distanza. Per un concetto nuovo, il primo retrieval "freddo", cioè non immediatamente successivo alla sua spiegazione (retest intra-sessione o recall di consolidamento).
  - Tutti gli altri tentativi restano nel log di sessione come telemetria per la regola di padronanza (§2.2) e non entrano in FSRS.
  - Requisito: id di piano ancorati ai concetti (§3.1).
  - Da verificare prima del rilascio: con `enable_short_term = true` e learning steps `1m,10m`, un singolo Good su card nuova può lasciarla in stato Learning con scadenza dopo pochi minuti. Bisogna capire come appare nel Ripasso e, se serve, trattare le review `via:'session'` come già graduate.
- **Validazione (Fonte vs. Sinapsi):**
  - Oggi il loop è aperto. La sessione legge un brief al momento della creazione (`ipc.ts:171-176`) e non scrive mai. Un concetto appena studiato resta "mai visto" per FSRS, che quindi non può fissare la prima review a distanza di circa un giorno. Cepeda 2008 mostra che il gap ottimale per la prima ripetizione è il 20-40% dell'intervallo di ritenzione per un target di una settimana.
  - Il closed loop è il nucleo valido dell'Algoritmo 1 di DeepTutor (arXiv 2604.26962).
  - Il limite di una review per sessione corregge il report Gemini. Il manuale di Anki afferma che ripetere una card più volte nello stesso giorno "does not significantly contribute to long-term memory". In una simulazione su ts-fsrs 5.4.2 installato, sei Easy nello stesso giorno portano S da 8.30 a 60.38 giorni.
  - `replay()` (`fsrs.ts:4-13`) rigioca ogni volta l'intero log, quindi una raffica di review scritta per errore distorce FSRS in modo permanente.
- **Priorità / Impatto:** Alto. È l'intervento con il valore più alto per riga di codice, a zero chiamate LLM.

### 2.2 Regola di padronanza deterministica per `Concept.id` al posto di `doneNodeIds` e di BKT
- **Proposta / Intervento:**
  - Nel riduttore va introdotto uno stato per concetto: `unseen → explained → probed → mastered`, più `repairing` dopo un errore.
  - `mastered` richiede una di queste condizioni: K = 2 risposte aperte consecutive giudicate `correct` dal grader; K = 3 check a scelta consecutivi corretti, perché la probabilità di indovinare è alta; oppure 1 retrieval freddo corretto se il concetto era già `la sai` (R corretta ≥ 0.85 secondo §1.1) con S ≥ 14 giorni.
  - Qualunque `incorrect`/`partial` azzera il contatore e porta lo stato a `repairing`.
  - K e la soglia di S vanno resi configurabili in `settings-schema.ts`.
  - `PlanMap` (`SessionView.tsx:118`) mostra questi stati calcolati dal codice, non dichiarati dal modello.
- **Validazione (Fonte vs. Sinapsi):** `doneNodeIds` è un'euristica legata al cambio di focus, che ignora i check aperti (`events.ts:70-74`). Il BKT proposto da Gemini, con P(L0) presa da R, P(T) "da chiarezza del tutor" e soglia 0.85, è fatto di costanti scelte a mano. pyBKT stima quei parametri con EM su log di molti studenti (arXiv 2105.00385). Con 1-4 osservazioni per concetto la posteriore dipende quasi solo dai prior e si riduce a "N corrette di fila", senza però la trasparenza di quella regola. DeepTutor, citato come modello, evita esplicitamente i "coarse latent mastery scores" (arXiv 2604.26962). La granularità a step con feedback per step è quella con supporto empirico (VanLehn 2011: ITS d = 0.76).
- **Priorità / Impatto:** Alto. È codice puro e testabile, senza latenza aggiuntiva.

### 2.3 Mappatura dei voti: correttezza nel voto, fiducia fuori dal voto, Easy mai automatico
- **Proposta / Intervento:**
  - Per la ReviewLine di sessione: verdetto `incorrect` o `partial` → **Again (1)**, qualunque sia la fiducia. `correct` ma con hint, aiuti o risposta incompleta (`hintsUsed > 0` o rilievo del grader) → **Hard (2)**. `correct` senza aiuti → **Good (3)**. **Easy (4) non si assegna mai in automatico.**
  - Scelta multipla: corretta → Good, sbagliata → Again. Va però preferita, quando esiste, l'evidenza aperta dello stesso concetto.
  - La fiducia alimenta solo `misconception` (errore con fiducia alta), il digest e la calibrazione.
  - Nel Ripasso `proposeGrade` (`memory-types.ts:52-56`) può restare com'è, perché l'utente conferma il voto. Nelle sessioni l'esitazione deve risultare dal grader, non dall'autovalutazione.
- **Validazione (Fonte vs. Sinapsi):** gli input di FSRS sono solo voto e timestamp. Nelle equazioni FSRS-6/7 non compare alcun termine per la fiducia (awesome-fsrs wiki). Hard conta come successo, e il manuale Anki avverte che usarlo per un fallimento rende "all intervals unreasonably high". Assegnare Easy da fiducia > 80% premia la sovraconfidenza e attiva il bonus w16. Sulle ripetizioni nello stesso giorno, inoltre, Easy converge solo dopo migliaia di giorni, mentre Good si ferma intorno a 2.1 giorni (simulazione locale). La tabella di Gemini lascia buchi (corretto con fiducia < 60) e sovrapposizioni (fiducia = 80 ricade sia in Good sia in Easy).
- **Priorità / Impatto:** Alto. È una tabella di mappatura, senza costi.

### 2.4 Correzione degli errori: spiegare, correggere, poi ritestare (niente risposta trattenuta)
- **Proposta / Intervento:** per ogni check sbagliato il protocollo, imposto dalla macchina a stati di §3.3, diventa:
  1. Lo studente si impegna su una risposta e una fiducia prima del verdetto.
  2. Facoltativo, al massimo un turno: "spiega il ragionamento che ti ha portato lì", da usare solo se l'errore è aperto o ambiguo.
  3. Correzione esplicita: risposta giusta, perché l'errore era allettante, modello mentale corretto. `AnswerCard` mostra già subito il `why` di ogni opzione (`AnswerCard.tsx:17-34`), e va mantenuto.
  4. Retest dello stesso `Concept.id` in forma diversa dopo almeno un turno su un altro concetto.
  5. Gli errori con fiducia alta finiscono in `weaknesses.jsonl` (§5.1) e vengono ritestati presto anche nella sessione successiva.
- **Validazione (Fonte vs. Sinapsi):**
  - Gli errori dati con fiducia alta sono quelli che si correggono meglio, ma solo dopo feedback correttivo (Butterfield & Metcalfe 2001). Metcalfe 2017 conferma: "Corrective feedback, including analysis of the reasoning leading up to the mistake, is crucial".
  - Anche le risposte corrette date con fiducia bassa raddoppiano la ritenzione se ricevono feedback (Butler et al. 2008).
  - In Shaw & Nave 2026 l'unica manipolazione che ha ridotto la "cognitive surrender" (dal 73% al 58%) è stata il feedback immediato per item.
  - "VibeCheck" non esiste in letteratura (nessun risultato in OpenAlex). Trattenere la risposta in un ciclo di hint non ha base empirica e aggiunge carico estraneo.
  - Oggi il prompt chiede "diagnosi, riparazione, rinforzo" (`prompt.ts:33-37`), ma nessun codice impone il retest.
- **Priorità / Impatto:** Alto. Costa al massimo un turno in più per errore, solo dove serve.

### 2.5 Granularità adattiva: check per blocco, non per passo atomico
- **Proposta / Intervento:**
  - Il tutor riceve dal codice un `chunkSize` per il concetto corrente: 1 micro-passo dopo un errore, con stato `repairing` o con una misconcezione attiva; 2-3 micro-passi se gli ultimi check erano corretti con fiducia alta o se il concetto ha R alta.
  - Il `predict` è richiesto solo per i passi `derivata` con una mossa non ovvia, mai per le `base` (§3.1).
  - Il fading segue lo stesso schema: concetti nuovi o con R bassa partono da una spiegazione con esempio svolto; concetti con R alta partono direttamente dal retrieval.
- **Validazione (Fonte vs. Sinapsi):** la nota benchmark prescrive un passo atomico per turno con un check dopo ogni passo. A p50 9.5 s e p90 15.1 s per turno (n = 56, `ai-usage.jsonl`), un albero di 10 passi costerebbe 20-30 turni. VanLehn 2011 trova la granularità "step-based" efficace quanto quelle più fini. L'expertise reversal (Kalyuga et al. 2003) e il fading degli esempi svolti (Renkl et al. 2004) giustificano blocchi più grandi dove lo studente è solido. Oggi la dimensione del passo dipende solo dal modello ("Un passo, un fatto", `prompt.ts:35`).
- **Priorità / Impatto:** Medio. Riduce il numero di turni e quindi la latenza totale.

### 2.6 Probe limitato e guidato dal grafo
- **Proposta / Intervento:** nella fase `probe`, al massimo 3 turni. I bersagli sono scelti dal codice tra i nodi dell'albero minimo (§3.1) con stato `incerto`/`debole`/`mai visto`, partendo dai prerequisiti più profondi. I concetti `la sai` con S di settimane si saltano, oppure ricevono al massimo una domanda di conferma (regola già in `prompt.ts:50`, oggi limitata ai concetti della nota). Superati i 3 turni, la macchina a stati passa a `plan`.
- **Validazione (Fonte vs. Sinapsi):** nell'unica sessione locale completata, 1 turno goal più 5 probe hanno preceduto il piano, su 17 turni totali. La "misura" della nota (pavimento e soffitto) è corretta, ma la ricerca binaria lasciata al modello non ha alcun limite. La conferma breve suggerita dalla nota ("non rispiegare nulla di noto") è più economica di un pruning sbagliato.
- **Priorità / Impatto:** Medio. Fa risparmiare 2-3 turni a sessione.

### 2.7 Check aperti e meccanicistici come forma di default
- **Proposta / Intervento:** nel prompt della fase `teach`/`consolidate`, le domande di `check` e `recall` sono di default `kind: 'open'` e chiedono una catena causale ("spiega passo passo come X porta a Y"), non un elenco di motivi. La scelta multipla resta per la discriminazione tra modelli sbagliati, con distrattori legati a misconcezioni.
- **Validazione (Fonte vs. Sinapsi):** il testing effect vale g ≈ 0.50 in classe (Yang et al. 2021), con vantaggio del recall sul riconoscimento (Rowland 2014). La spiegazione meccanicistica riduce l'illusione di profondità esplicativa, mentre elencare motivi non la riduce (Fernbach et al. 2013; Rozenblit & Keil 2002). Oggi progresso e fiducia sono legati alla scelta multipla (`events.ts:47-51`, `QuestionDock.tsx:137-152`). Questo spinge il modello verso il formato meno efficace. Richiede il grader di §3.2.
- **Priorità / Impatto:** Medio. Sposta latenza sul grader, quindi va attivato insieme a §3.2.

### 2.8 Condizione di fine oggettiva e consolidamento sui "generatori"
- **Proposta / Intervento:** `done` lo decide il codice, quando il concetto `goal` è `mastered` (§2.2) e il recall libero è concluso. Nel consolidamento si aggiunge una domanda "Da quali 2-3 basi segue tutto ciò che hai visto oggi?", oppure un gioco `order`/`match` che collega le derivate alle basi. Un tap facoltativo "ti sembra ovvio adesso?" viene registrato per la calibrazione, ma non decide nulla.
- **Validazione (Fonte vs. Sinapsi):** l'"autoevidenza" come condizione terminale (nota §1) è soggettiva e soggetta all'illusione di fluenza. Le previsioni sulla propria ritenzione non correlano con la ritenzione reale (Karpicke & Roediger 2008). Il "click" verso pochi generatori è già nel prompt (`prompt.ts:24`), ma non viene mai verificato. Oggi `done` lo dichiara il modello (`teacher-protocol.ts:76`).
- **Priorità / Impatto:** Medio. Nessuna chiamata in più.

### 2.9 Restare su ts-fsrs 5.4.2 / FSRS-6, con un percorso di upgrade esplicito
- **Proposta / Intervento:** per ora nessun cambio di libreria. Se in futuro si passa a ts-fsrs 6.x: `DefaultScheduler({ version: 'FSRS-6' })` (API `review`/`preview`/`nextInterval`), dopo aver verificato che l'Electron in uso includa Node ≥ 24. FSRS-7 è una decisione separata: richiede pesi FSRS-7 e il replay completo di `reviews.jsonl`, che Sinapsi conserva già.
- **Validazione (Fonte vs. Sinapsi):** ts-fsrs 6.0.0 (28-10-2026) rende FSRS-7 il default e marca come deprecati `fsrs()`/`FSRS`, che restano su FSRS-6. Le note di rilascio dicono: "Upgrading the package and upgrading the model are separate operations". Il report Gemini presenta FSRS-6 come "stato dell'arte", ed è un'informazione superata.
- **Priorità / Impatto:** Basso. Va pianificato, non è urgente.

## 3. Architettura AI Tutor

### 3.1 Albero minimo delle dipendenze calcolato dal codice e piano ancorato ai `Concept.id`
- **Proposta / Intervento:**
  - In un nuovo modulo `src/main/session/minimal-tree.ts`:
    1. Risolvere i concetti `goal`: match esplicito argomento → concetto, con fallback sui concetti di profondità massima della nota abbinata.
    2. `T = ancestors(goal) ∪ goal`, riusando `derive.ts:101-115`, che oggi usa solo `GraphView.tsx`.
    3. Togliere i nodi `la sai` con S ≥ 14 giorni.
    4. Etichettare ogni nodo come `base` se nessuna premessa sta in T, altrimenti `derivata`. L'etichetta è relativa allo studente, non è la `depth` assoluta.
    5. Emettere righe `id | nome | enunciato | base/derivata | R | S | debolezze` più le catene interne a T.
  - Questo blocco sostituisce il brief piatto (`memory-brief.ts:24-35`: niente id, niente catene, massimo 40 righe).
  - In `teacher-protocol.ts:14-17,72-75` si impone `PlanNode.id ∈ T ∪ {new:*}` e si toglie "Id brevi in minuscolo con trattini" da `prompt.ts:69`.
  - I nodi `new:*` proposti dal tutor vengono registrati come candidati per l'estrazione.
  - L'albero è un prior che il tutor può emendare, non un vincolo rigido.
- **Validazione (Fonte vs. Sinapsi):** il "Minimal Dependency Tree" della nota (§3) è valido, ed è l'unico punto della dottrina che oggi non ha alcun ancoraggio. Il piano viene inventato con id liberi e nessun modulo lo confronta con il grafo (verificato con grep). Il DAG esiste già: catene premessa ⇒ conclusione e `depth` calcolata con Tarjan SCC (`derive.ts:48-99`). La Pratica passa già le catene (`practice/material.ts:64-65`). Senza id reali non si possono attribuire esiti a FSRS (§2.1), né costruire la padronanza (§2.2) o le debolezze (§5.1). Limite: le catene estratte da LLM possono essere scarse o rumorose, e la loro densità per nota non è stata misurata.
- **Priorità / Impatto:** Alto. Il calcolo richiede millisecondi e nessuna chiamata. Sblocca §2.1, §2.2 e §5.1.

### 3.2 Grader separato e guidato da riferimento per le risposte aperte e il Tabù
- **Proposta / Intervento:**
  - Per ogni risposta `open` o Tabù in sessione: una chiamata `ask` stateless con `task: 'grade'`, che riusa l'infrastruttura del Ripasso (`memory/grade-prompt.ts:5-20`).
  - Input: `GRADING_RIGOR` (`ai/rigor.ts:5-11`, oggi assente da `session/prompt.ts`), domanda, risposta dello studente, **riferimento** (`Concept.statement` più la sezione di nota del concetto, §4.4) e rubrica. Il grader non vede né la conversazione né la fiducia dichiarata.
  - Output: `{verdict: 'correct'|'partial'|'incorrect', hintsUsed: number, reason: string}`.
  - Il verdetto viene mostrato subito, con un pulsante "contesta" che annulla l'evidenza prima della scrittura FSRS. Poi entra nel messaggio per il tutor.
  - Opzione cross-family: grader sull'altro motore rispetto a `teach`, sfruttando il selettore Claude/Gemini del commit `28c2e34`. Così il grader gira anche su una coda diversa.
- **Validazione (Fonte vs. Sinapsi):**
  - Il "self-preference bias" citato da Gemini è applicato male. Riguarda un LLM che valuta **testo generato da sé stesso** (Panickssery et al. 2024), mentre qui si valuta il testo dello studente.
  - I rischi reali sono indulgenza e piaggeria in conversazione (Sharma et al. 2023) e valutazione senza riferimento. In MT-Bench, sulla matematica, il giudice dichiarava corrette risposte sbagliate in 14/20 casi con il prompt di default e in 3/20 con il riferimento (Zheng et al. 2023).
  - La valutazione di risposte brevi con un LLM arriva a κ = 0.70 contro 0.75 umano (Henkel et al. 2024).
  - Shaw & Nave 2026 mostrano che gli utenti contestano raramente un'AI sicura ma sbagliata. Un verdetto errato verrebbe accettato, per questo servono riferimento e possibilità di contestare.
  - Oggi le risposte aperte sono giudicate dal tutor stesso nel turno successivo, senza rubrica (`prompt.ts:62`, `teacher-protocol.ts:105-122`).
- **Priorità / Impatto:** Alto. Aggiunge una chiamata sequenziale, ma solo sulle risposte aperte. Si attenua con il grader su un altro motore e mostrando il verdetto prima del turno del tutor.

### 3.3 Fasi controllate dal codice: un riduttore tipizzato, non il modello
- **Proposta / Intervento:**
  - In `events.ts` una discriminated union `SessionPhase = goal | probe | plan | teach | check | repair | consolidate | done`, con transizioni decise dal codice: limite dei probe (§2.6), check dopo ogni blocco (§2.5), retest dopo un errore (§2.4), done su padronanza del goal (§2.8). La riga `s.phase = t.phase` (`events.ts:61`) diventa una validazione: un turno con fase incoerente provoca il retry esistente (`bridge.ts:144-150`).
  - L'istruzione specifica di fase e lo stato compatto (concetto corrente, `chunkSize`, padronanza) viaggiano **nel messaggio learner** di ogni turno, non nel system prompt.
  - Niente XState: per circa 8 stati senza parallelismo basta un riduttore puro.
- **Validazione (Fonte vs. Sinapsi):** oggi l'ordine delle fasi dipende solo dalla buona volontà del modello. Lo schema valida la forma, non le transizioni (`teacher-protocol.ts:52-77`). Su conversazioni multi-turno gli LLM perdono in media il 39% rispetto al single-turn, soprattutto per inaffidabilità (Laban et al. 2025, arXiv 2505.06120). Questo giustifica lo spostamento delle decisioni strutturali nel codice. La dottrina della nota è già quasi parola per parola in `prompt.ts:23-40`: aggiungere altro testo ha un valore marginale basso. Ciò che manca è l'enforcement.
- **Priorità / Impatto:** Alto. Lo sforzo è medio, non aggiunge chiamate e preserva la cache (§4.3).

### 3.4 Validare il `correct` delle domande a scelta senza toccare il percorso critico
- **Proposta / Intervento:** (a) Nel prompt di fase, il tutor deve derivare `correct` e `why` dal riferimento fornito (enunciato più sezione), non da memoria. (b) Una chiamata di validazione in background, sull'altro motore, dopo la fine della sessione e prima della scrittura FSRS. Se il validatore contraddice `correct`, l'evidenza di quel check viene sospesa e la domanda segnalata nel digest. (c) Pulsante "segnala risposta errata" sull'`AnswerCard`.
- **Validazione (Fonte vs. Sinapsi):** `correct` e `why` nascono nello stesso turno della domanda (`teacher-protocol.ts:35-36,58-59`). Un `correct` sbagliato si propaga a `doneNodeIds`, al punteggio, alla calibrazione e alla riga "errore" del digest. Con §2.1 attivo finirebbe anche in FSRS. DeepTutor usa un validatore indipendente "because the validator shares no reasoning chain with the generator" (arXiv 2604.26962 §2.3). Nel turno interattivo però costerebbe più di 9.5 s, quindi va fuori dal percorso critico.
- **Priorità / Impatto:** Medio. Chiamata in background, latenza percepita nulla.

### 3.5 Snellire il prompt monolitico
- **Proposta / Intervento:** da `TEACHER_SYSTEM_PROMPT` (`prompt.ts:11-72`, 62 righe) vanno tolte le parti che il codice ora impone: sequenza delle fasi, limite dei probe, regola dei giochi "uno ogni tre turni" (va spostata nel riduttore). Va aggiunta una riga sola: "Niente meta-narrazione: non annunciare cosa farai, fallo". Il testo deve restare byte-identico per tutta la sessione.
- **Validazione (Fonte vs. Sinapsi):** la regola della nota §4 contro il rumore meta-narrativo è valida e manca nel prompt, che vieta solo entusiasmo e prediche (`prompt.ts:16-20`). Un prompt più corto riduce le istruzioni sepolte a metà contesto (Liu et al. 2023, "Lost in the Middle"). La stabilità del testo serve alla cache (§4.3).
- **Priorità / Impatto:** Basso. Si fa insieme a §3.3.

## 4. Gestione Contesto & Latenza

### 4.1 Coda con priorità: i task interattivi passano davanti a quelli in background
- **Proposta / Intervento:** in `src/main/ai/bridge.ts:74,81-86` la coda unica per motore va sostituita con due livelli: `interactive` (teach, grade in sessione o Pratica) e `background` (extract, note, variants, validazioni di §3.4). Un job interattivo parte appena finisce quello in corso, oppure, se il motore lo permette, in un processo parallelo. Nessun job background parte mentre c'è un job interattivo in attesa.
- **Validazione (Fonte vs. Sinapsi):** oggi un turno del tutor aspetta qualunque chiamata sullo stesso motore. Sui log locali: extract su agy p50 294 s, note p50 394 s, variants 86-174 s. Se `teach` gira su agy, un turno può bloccarsi per minuti. È la causa di latenza peggiore, molto più del presunto "O(n²)".
- **Priorità / Impatto:** Alto. Sforzo contenuto, elimina attese di minuti.

### 4.2 Streaming dell'output verso la UI
- **Proposta / Intervento:** in `engines.ts:21,32-36` passare a `--output-format stream-json --verbose --include-partial-messages` per `claude` e a `-o stream-json` per Gemini CLI. Poi collegare `onOutput` in `callOnce` (`bridge.ts:95-106`) e mostrare la lezione man mano che arriva. Da verificare prima: (a) come si comporta lo streaming parziale con `--json-schema`, perché l'output strutturato potrebbe arrivare solo nel messaggio finale `result` e richiedere un parser JSON incrementale sul campo della lezione; (b) quali flag di streaming supporta `agy` (non testato).
- **Validazione (Fonte vs. Sinapsi):** la documentazione headless di Claude Code descrive `stream-json` con messaggi parziali. Gemini CLI 0.66.0 elenca `stream-json`. L'affermazione di Gemini "JSON bloccante" come limite della CLI è falsa: è una scelta di Sinapsi. Oggi la UI mostra solo "Il tutor sta pensando…" per 9.5-15 s (`SessionView.tsx:202-211`).
- **Priorità / Impatto:** Alto per la latenza percepita. Sforzo medio, con un rischio tecnico sull'interazione con lo schema.

### 4.3 Tenere `--resume` per il dialogo, chiamate stateless per grader e planner, e misurare la cache
- **Proposta / Intervento:**
  - Il tutor resta su `--resume` (`runner.ts:75-89`) con system prompt byte-stabile. Grader (§3.2), validatore (§3.4) e calcoli di piano restano stateless, ciascuno con un proprio system prompt fisso.
  - In `engines.ts:46-47` registrare in `ai-usage.jsonl` anche `cache_read_input_tokens`, `cache_creation_input_tokens`, `total_cost_usd` e un flag `retry` per la seconda chiamata dopo JSON non valido (`bridge.ts:144-150`).
  - Solo se i dati mostrano una crescita reale dei token non in cache: oltre una soglia, aprire una nuova conversazione con un digest compatto (albero, stato di padronanza, debolezze, ultimi 3 turni) invece di riprendere quella vecchia.
- **Validazione (Fonte vs. Sinapsi):** il "costo O(n²)" del report è sovrastimato. Claude Code rimanda tutto il contesto, ma serve dalla cache il prefisso invariato. Con l'abbonamento il TTL della cache è di un'ora anche per le esecuzioni `-p`. Una nota da 60k caratteri sono circa 15k token, in cache dopo il primo turno. Ogni riassunto stateless ha un prefisso nuovo e quindi perde la cache. Oggi né i token di cache né il tasso di retry vengono registrati, quindi qualunque riprogettazione sarebbe al buio.
- **Priorità / Impatto:** Medio. La telemetria costa pochissimo. La compattazione è condizionata ai dati.

### 4.4 Contesto per sezioni, indicizzato dal grafo, invece della nota intera da 60k
- **Proposta / Intervento:** in `prompt.ts:75-83` e `runner.ts:100-116`, al posto di `capNote(note)` (`NOTE_LIMIT = 60_000`, `prompt.ts:1-9`) mandare nel primo messaggio le sezioni (`Concept.sections`, `derive.ts:19,23`) dei concetti dell'albero minimo, più le note di nascita (`Concept.birth`) dei prerequisiti che stanno in altre note. A ogni cambio di concetto corrente, accodare la sezione del nuovo concetto al messaggio learner, che è anche il riferimento del grader. La nota intera resta disponibile solo come fallback quando l'albero è vuoto.
- **Validazione (Fonte vs. Sinapsi):** il motivo è la **focalizzazione** e la precisione del grader, non la capacità di contesto. Le prestazioni degradano quando l'informazione rilevante sta a metà di un contesto lungo (Liu et al. 2023). Oggi la nota entra una sola volta, all'inizio, e poi resta sepolta nella storia della conversazione. I prerequisiti che stanno in altre note non entrano mai. RAG con embedding, LightRAG e RRF (nota §5) aggiungono un indice, un modello di embedding ed errori di retrieval su un corpus personale già strutturato per heading. Anche il README di DeepTutor offre un motore non vettoriale ("PageIndex").
- **Priorità / Impatto:** Medio. Lo sforzo è medio e il risultato dipende dalla qualità di `sections`.

### 4.5 Annullamento del turno
- **Proposta / Intervento:** collegare `AbortSignal` dal renderer al runner (oggi il runner non usa mai `signal`), con un pulsante "Annulla" durante l'attesa che uccide il process group (già implementato in `engines.ts:81-137`) e riporta lo stato su `awaiting: 'learner'`.
- **Validazione (Fonte vs. Sinapsi):** con un timeout di 180 s (`bridge.ts:63`) e un outlier locale di 3588 s, l'utente non ha modo di uscire da un turno bloccato.
- **Priorità / Impatto:** Medio. Sforzo basso.

### 4.6 `--bare` solo con una API key
- **Proposta / Intervento:** opzione nelle impostazioni "Avvio rapido (richiede ANTHROPIC_API_KEY)" che aggiunge `--bare` alle chiamate `claude`.
- **Validazione (Fonte vs. Sinapsi):** `--bare` salta hook, skill, MCP e CLAUDE.md, accorciando l'avvio. Però non legge le credenziali OAuth, quindi non funziona con il login in abbonamento. Il TTL della cache, inoltre, scende a 5 minuti con API key.
- **Priorità / Impatto:** Basso. Ha senso solo se il cold start misurato risulta dominante.

## 5. Memoria del Discente

### 5.1 Inventario delle debolezze persistente (`weaknesses.jsonl`)
- **Proposta / Intervento:**
  - File append-only `dataDir()/memory/weaknesses.jsonl`, accanto a `reviews.jsonl` (`memory/store.ts:7-11`). Righe: `{id, conceptId?, text, kind: 'misconception'|'gap'|'execution'|'discrimination', source: 'session'|'practice'|'review', ref, at, status: 'active'|'resolved'}`.
  - Chi scrive, sempre in modo deterministico e senza nuove chiamate:
    - le `summary.misconceptions` di sessione (`teacher-protocol.ts:40`), legate al `conceptId` tramite l'albero di §3.1;
    - i check sbagliati con fiducia alta;
    - i verdetti `incorrect` del grader;
    - il `miss` della Pratica quando vale `structural` o `discrimination` (`practice-protocol.ts:30`). Va copiato anche come campo opzionale in ReviewLine, perché oggi `practice/runner.ts:79-80` lo scarta.
  - Risoluzione basata sull'evidenza: una risposta corretta con fiducia alta sullo stesso concetto, in un'altra sessione o in un'altra forma.
  - Il boolean `Memory.misconception` (`memory-types.ts:38-39`), che viene sovrascritto dalla risposta successiva, diventa una vista derivata da questo file.
- **Validazione (Fonte vs. Sinapsi):** il weakness inventory (D_w) è l'idea di DeepTutor che vale di più. Nell'ablazione, togliere la memoria personale fa calare soprattutto Personalization e Fitness. La risoluzione è "evidence-gated rather than governed by numeric confidence thresholds" (arXiv 2604.26962 §2.1.2, §5.4). Oggi le misconcezioni stanno in tre punti scollegati (FSRS, summary di sessione, digest), e quelle emerse in sessione non tornano mai indietro. Il file sta nella cartella dati e non nel vault perché è scritto dalla macchina, cambia spesso e deve restare coerente con `reviews.jsonl`.
- **Priorità / Impatto:** Alto. Zero chiamate, sforzo medio. Funziona bene solo dopo §3.1.

### 5.2 Instradare il profilo a ogni generatore
- **Proposta / Intervento:** passare per concatenazione di stringhe le debolezze attive dei concetti di T al primo messaggio di sessione; quelle dei bersagli al materiale della Pratica (§1.2); quelle del concetto più il tipo di `miss` al prompt delle varianti (`memory/variants.ts:67-94`), con la richiesta di almeno un esercizio per debolezza attiva che distingua il modello sbagliato da quello giusto.
- **Validazione (Fonte vs. Sinapsi):** è il "role-specific profile routing" di DeepTutor senza i suoi agenti. Lo stadio 1 della generazione personalizzata (idee guidate da D_w) confluisce nella chiamata già esistente. Oggi le varianti vedono solo il testo della nota, e il flag `depth` arriva dal tipo PACER della lezione, non dagli errori (`review.ts:110`).
- **Priorità / Impatto:** Medio. Zero chiamate.

### 5.3 Indice compatto delle sessioni
- **Proposta / Intervento:** alla fase `done`, o all'abbandono, appendere a `dataDir()/sessions/index.jsonl` una riga `{id, topic, notePath, goalConceptIds, masteredIds, misconceptions, shakyIds, turns, durationMs, endedAt}`. La leggono `list()`, i suggerimenti (`suggest/suggest.ts:104-107`) e il brief della sessione successiva sullo stesso argomento, che riceve "ultima volta: padroneggiati X, instabili Y".
- **Validazione (Fonte vs. Sinapsi):** dei tre livelli del Trace Forest resta utile solo il livello 1, il riassunto per sessione, e senza embedding. Oggi `list()` riduce ogni file (`runner.ts:164-173`), e la sessione successiva non sa nulla di quella precedente se non tramite FSRS.
- **Priorità / Impatto:** Medio. Sforzo basso.

### 5.4 Profilo "Come imparo" modificabile al posto delle biografie hardcoded
- **Proposta / Intervento:** un campo testo nelle Impostazioni (`settings-schema.ts`) che sostituisce i blocchi fissi in `session/prompt.ts:13-14`, `practice/prompt.ts:5` e `graph/extract-prompt.ts:8`. Il `done` summary può contenere un campo facoltativo `reflection` ("cosa ha funzionato"), proposto all'utente come modifica al profilo, mai applicato in automatico.
- **Validazione (Fonte vs. Sinapsi):** D_r (riflessioni pedagogiche) ha valore. Per un utente singolo che può dichiarare le proprie preferenze, però, un agente dedicato è sproporzionato. Il profilo cambia solo all'avvio della sessione, quindi non invalida la cache durante la sessione.
- **Priorità / Impatto:** Basso. Sforzo minimo.

## 6. UI/UX & Interazione Vault

### 6.1 Fiducia discreta obbligatoria, per tutte le risposte, prima del verdetto
- **Proposta / Intervento:** in `QuestionDock.tsx:22,171,198-214` lo slider 0-100 con default 50 va sostituito da 4 pulsanti senza preselezione: "Tiro a indovinare / Incerto / Abbastanza sicuro / Certo". Sono obbligatori per inviare e valgono per `choice` e `open` (oggi `send()` la allega solo alle scelte, `:137-152`). Si salvano come 12/37/63/88 per non cambiare `score.ts` e lo schema `confidence: int 0-100` (`teacher-protocol.ts:95`). "Certo" e "Abbastanza sicuro" su una risposta sbagliata attivano la misconcezione.
- **Validazione (Fonte vs. Sinapsi):** su slider a 101 punti, un valore predefinito di 25, 50, 75 o 100 fa scegliere a molti più rispondenti esattamente quel valore. Su scale a 7 e 21 punti l'effetto sparisce (Liu & Conrad 2018). Il meccanismo è l'accettazione del default, che il report chiama impropriamente "ancoraggio". Oggi un 50 non toccato è indistinguibile da un 50 scelto, il che rende rumorose la calibrazione e la regola "sbagliato e sicuro" (`fsrs.ts:31`). L'AI gonfia la fiducia di 11.7 punti (Shaw & Nave 2026), quindi va raccolta prima del feedback.
- **Priorità / Impatto:** Alto. Sforzo basso. Alimenta §2.4 e §5.1.

### 6.2 Lezione nascosta durante il retrieval: mantenere il layout 60/40
- **Proposta / Intervento:** mentre è aperta una domanda `check`, `recall` o `probe`, il pannello lezione (`SessionView.tsx`, `<main className="body split">`) viene compresso o sfocato con il pulsante "mostra la lezione". Se lo studente riapre la lezione prima di rispondere, l'evento `peeked: true` viene registrato e la risposta non conta come retrieval freddo (§2.1, §2.2). Lo split `minmax(0,1fr) minmax(360px,40%)` (`session.css:728`) resta com'è.
- **Validazione (Fonte vs. Sinapsi):** la diagnosi di "split attention" del report è sbagliata. L'effetto riguarda fonti che si riferiscono l'una all'altra e non si capiscono da sole, e la soluzione è avvicinarle (Ginns 2006). Lezione e domanda affiancate sono contiguità spaziale. Il rischio vero è che la "rievocazione" diventi una consultazione, mentre l'effetto viene dallo sforzo di recall (Rowland 2014).
- **Priorità / Impatto:** Medio. Sforzo basso.

### 6.3 Nota abbinata visibile e modificabile prima del primo turno
- **Proposta / Intervento:** dopo `create`, prima di `start`, mostrare la nota trovata da `matchNote` e i concetti `goal` risolti (§3.1). Si possono cambiare scegliendo tra le prime 3 candidate o con una ricerca nel vault. Il `firstMessage` si costruisce solo dopo la conferma.
- **Validazione (Fonte vs. Sinapsi):** `matchNote` (`note-match.ts:3-33`) confronta solo titolo, alias e parole condivise, senza stemming e senza leggere il corpo. Una nota sbagliata manda fuori strada l'intera sessione e non si può più correggere. È esattamente il costo logistico che, secondo la nota (§3), il sistema dovrebbe assorbire.
- **Priorità / Impatto:** Medio. Sforzo basso.

### 6.4 Piano collegato al vault
- **Proposta / Intervento:** i nodi di `PlanMap` mostrano lo stato di padronanza calcolato dal codice (§2.2) e l'etichetta `base`/`derivata`. Al clic aprono la sezione di nota del concetto in Obsidian (URI `obsidian://open` con heading).
- **Validazione (Fonte vs. Sinapsi):** la doppia risoluzione della nota (mappa macro e micro-passi) c'è già (`events.ts:70-74`). Manca il legame tra mappa, grafo e vault, che diventa possibile solo con gli id reali.
- **Priorità / Impatto:** Basso.

### 6.5 Calibrazione mostrata allo studente
- **Proposta / Intervento:** nel riepilogo di fine sessione e nel Ripasso, una riga per livello di fiducia: "Quando dici 'Certo' hai ragione nel X% dei casi (n = N)", calcolata su `reviews.jsonl` e sui log di sessione.
- **Validazione (Fonte vs. Sinapsi):** i giudizi sul proprio apprendimento sono poco affidabili senza un riscontro (Karpicke & Roediger 2008), e la calibrazione esiste già solo come numero aggregato (`score.ts:5-43`). L'efficacia di questo specifico display non ha una citazione diretta nelle note: è un'ipotesi plausibile da trattare come esperimento.
- **Priorità / Impatto:** Basso.

## 7. Valutazione dell'efficacia

### 7.1 Misurare l'apprendimento fuori dalla sessione, non nella sessione
- **Proposta / Intervento:** (a) Metrica primaria: tasso di Again alla prima review FSRS dei concetti `mastered` in sessione, a confronto con quelli studiati solo nel Ripasso, calcolato da `reviews.jsonl` filtrando `via`. (b) Solo in sviluppo, offline: rigiocare i JSONL di sessione con un giudice LLM di un'altra famiglia su 3-4 dimensioni reali di TutorBench (Personalization, Logical Depth, Answer Quality, Fitness), più eventualmente uno studente simulato costruito dal D_w reale. Mai a runtime.
- **Validazione (Fonte vs. Sinapsi):** in Bastani et al. 2025, GPT senza guardrail migliorava la pratica del 48%, ma all'esame senza assistenza gli studenti andavano peggio del 17%. Le prestazioni in sessione ingannano. Gli effetti degli ITS si riducono sui test standardizzati (Kulik & Fletcher 2016). Il +10.8% di DeepTutor viene da studenti simulati valutati da LLM, senza esiti di apprendimento umani. Oggi Sinapsi non ha alcuna telemetria pedagogica.
- **Priorità / Impatto:** Medio. Il punto (a) è una query su dati che esisteranno dopo §2.1.

## 8. Spunti scartati o corretti

- **Proposta / Intervento:** scartare "VibeCheck / Metacognitive Friction Insertion" come risposta trattenuta. **Validazione:** non esiste in letteratura, e l'ipercorrezione richiede feedback correttivo (Metcalfe 2017). Si sostituisce con §2.4. **Priorità / Impatto:** n/a.
- **Proposta / Intervento:** scartare la diagnosi di "split attention" sul layout 60/40. **Validazione:** il concetto è applicato male (Ginns 2006). Il rischio reale è la consultazione, si veda §6.2. **Priorità / Impatto:** n/a.
- **Proposta / Intervento:** correggere il carico cognitivo come "somma vettoriale di tre carichi". **Validazione:** il germane load non è più un carico additivo indipendente (Sweller et al. 2019). **Priorità / Impatto:** n/a.
- **Proposta / Intervento:** scartare "60k caratteri = carico estraneo per lo studente". **Validazione:** confonde la finestra di contesto dell'LLM con la memoria di lavoro umana. La nota non viene mostrata allo studente. **Priorità / Impatto:** n/a.
- **Proposta / Intervento:** scartare BKT a 4 parametri con P(L0) presa da R. **Validazione:** parametri non stimabili per un singolo utente, che collassano in "N corrette di fila". R e P(L0) sono grandezze diverse. Si sostituisce con §2.2. **Priorità / Impatto:** n/a.
- **Proposta / Intervento:** scartare la soglia di padronanza 0.85. **Validazione:** non ha fonte. La convenzione ITS è circa 0.95, e comunque si usa una soglia configurabile a conteggio (§2.2). **Priorità / Impatto:** n/a.
- **Proposta / Intervento:** scartare "registrare ogni tentativo validato e usare w17-w19 per costruire stabilità". **Validazione:** sei Easy nello stesso giorno portano S da 8.30 a 60.38 giorni, e Anki dice che le ripetizioni nello stesso giorno contano poco. Si sostituisce con §2.1. **Priorità / Impatto:** n/a.
- **Proposta / Intervento:** scartare Easy da fiducia > 80% e la fiducia come input del voto. **Validazione:** FSRS usa solo voto e timestamp, ed Easy gonfiato attiva w16. Si sostituisce con §2.3. **Priorità / Impatto:** n/a.
- **Proposta / Intervento:** correggere la tabella dei parametri FSRS. **Validazione:** la caduta di stabilità dopo un lapse dipende da w11-w14, non da w6 (che governa la difficoltà). L'aggiornamento su Good è moltiplicativo, non "logaritmico". La mean reversion di D si applica a ogni review. **Priorità / Impatto:** n/a.
- **Proposta / Intervento:** correggere "`nextInterval()` e `review()`". **Validazione:** non esistono sull'oggetto `fsrs()` di ts-fsrs 5.4.2, dove si usano `next()` e `repeat()`. Esistono solo nel `DefaultScheduler` di v6, e `nextInterval` non registra review. **Priorità / Impatto:** n/a.
- **Proposta / Intervento:** correggere "FSRS-6 stato dell'arte". **Validazione:** FSRS-7 è il default di ts-fsrs 6.0.0 dal 28-10-2026 (§2.9). **Priorità / Impatto:** n/a.
- **Proposta / Intervento:** correggere il "self-preference bias" come motivo per separare il grader. **Validazione:** il grader valuta il testo dello studente. I rischi sono indulgenza e piaggeria, e il rimedio è il riferimento (§3.2). **Priorità / Impatto:** n/a.
- **Proposta / Intervento:** scartare la "latenza O(n²)" come collo di bottiglia. **Validazione:** il prompt caching serve il prefisso invariato (TTL di un'ora in abbonamento). Dominano coda e generazione (§4.1, §4.3). **Priorità / Impatto:** n/a.
- **Proposta / Intervento:** scartare "JSON bloccante come limite delle CLI". **Validazione:** entrambe le CLI hanno `stream-json` (§4.2). **Priorità / Impatto:** n/a.
- **Proposta / Intervento:** scartare RAG con embedding, LightRAG e RRF. **Validazione:** infrastruttura e dipendenze sproporzionate per le note di un singolo utente già strutturate per heading. Si sostituisce con §4.4. **Priorità / Impatto:** n/a.
- **Proposta / Intervento:** correggere il Trace Forest come template a tre livelli "riassunto / mappa BKT / ultimi 3 turni". **Validazione:** è un archivio di tracce tra sessioni, indicizzato con embedding e interrogato tramite tool, e senza BKT. Si tiene solo D_w (§5.1) e l'indice delle sessioni (§5.3). **Priorità / Impatto:** n/a.
- **Proposta / Intervento:** scartare le pipeline multi-stadio di DeepTutor nel turno interattivo (Investigate → Solve ReAct → Write, critic per domanda, 3 agenti di memoria). **Validazione:** a p50 9.5 s per chiamata, 3 chiamate in sequenza fanno circa 28 s per turno (circa 45 s al p90) prima della contesa sulla coda. Inoltre lo "step-by-step" di DeepTutor è il ragionamento interno dell'agente, non micro-passi dello studente con check. **Priorità / Impatto:** n/a.
- **Proposta / Intervento:** scartare il runtime TutorBot (message bus, canali, heartbeat). **Validazione:** è irrilevante per un'app desktop e non è validato su TutorBench. Se ne tiene solo la compattazione condizionata (§4.3). **Priorità / Impatto:** n/a.
- **Proposta / Intervento:** scartare la retorica su LTP, NMDA/AMPA e "emivita delle proteine di plasticità" come motivazione progettuale. **Validazione:** registrare un evento in un log cambia lo scheduling, non la sinapsi. La motivazione corretta è comportamentale (Cepeda 2008). **Priorità / Impatto:** n/a.
- **Proposta / Intervento:** scartare "modulazione dopaminergica" e "LTP che si traduce nella New Theory of Disuse". **Validazione:** il report non dà fonti, e la teoria di Bjork è puramente comportamentale. Anche S di FSRS non equivale alla storage strength: S scende dopo un lapse. **Priorità / Impatto:** n/a.
- **Proposta / Intervento:** correggere l'uso di Shaw & Nave come prova su "tutor AI e studenti". **Validazione:** è un preprint su adulti che risolvono puzzle CRT con un assistente, non un tutor e senza misure di apprendimento. Per i guardrail la prova solida è Bastani et al. 2025, e il dato utile di Shaw & Nave è l'effetto del feedback. **Priorità / Impatto:** n/a.
- **Proposta / Intervento:** scartare l'"autoevidenza" come condizione terminale. **Validazione:** soggettiva e soggetta all'illusione di fluenza. Si sostituisce con §2.8. **Priorità / Impatto:** n/a.
- **Proposta / Intervento:** correggere "un passo atomico per turno con check dopo ogni passo". **Validazione:** moltiplica i turni a circa 10 s l'uno. Si sostituisce con §2.5. **Priorità / Impatto:** n/a.
- **Proposta / Intervento:** correggere "non rispiegare mai nulla di noto". **Validazione:** presuppone un probe accurato. Si tiene una domanda di conferma (`prompt.ts:50`). **Priorità / Impatto:** n/a.
- **Proposta / Intervento:** correggere "la copertura è il nemico". **Validazione:** vale per la singola sessione, non per la preparazione all'esame, che `planner/readiness.ts` modella giustamente. **Priorità / Impatto:** n/a.
- **Proposta / Intervento:** scartare il productive failure come regola di correzione degli errori. **Validazione:** vale per introdurre concetti nuovi, con il tentativo prima dell'istruzione (Sinha & Kapur 2021, g = 0.36), non per riparare errori. **Priorità / Impatto:** n/a.
- **Proposta / Intervento:** scartare XState. **Validazione:** per circa 8 stati senza parallelismo basta un riduttore tipizzato (§3.3). **Priorità / Impatto:** n/a.
- **Proposta / Intervento:** scartare l'aggiunta di altra dottrina nel prompt. **Validazione:** la dottrina della nota è già in `prompt.ts:23-40`, e il collo di bottiglia è l'enforcement. **Priorità / Impatto:** n/a.
- **Proposta / Intervento:** scartare le metriche TutorBench della nota (P1 Guidance … G2 Gap Alignment) e la "riduzione delle allucinazioni". **Validazione:** nomi assenti dal paper, che usa 10 dimensioni diverse (Source Faithfulness, Personalization, …). Il paper non ha una metrica di allucinazione, e la Source Faithfulness risulta solo "competitive". **Priorità / Impatto:** n/a.

## Fonti

- Codice Sinapsi: branch `feat/ui-fixes-r5` @ `b389b16`, riferimenti `file:riga` come indicati. Latenze da `~/Library/Application Support/Sinapsi/ai-usage.jsonl` (teach/claude/sonnet n = 56: p50 9.5 s, p90 15.1 s).
- DeepTutor: [arXiv 2604.26962v3](https://arxiv.org/html/2604.26962v3), [github.com/HKUDS/DeepTutor](https://github.com/HKUDS/DeepTutor)
- FSRS: [awesome-fsrs wiki, The Algorithm](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm), [ts-fsrs v6.0.0 release](https://github.com/open-spaced-repetition/ts-fsrs/releases/tag/v6.0.0), [Anki manual, deck-options](https://github.com/ankitects/anki-manual/blob/main/src/deck-options.md)
- Claude Code: [Prompt caching](https://code.claude.com/docs/en/prompt-caching.md), [Headless](https://code.claude.com/docs/en/headless.md). Gemini CLI: [headless.md](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/headless.md)
- LLM-as-judge: Zheng et al. 2023 [arXiv 2306.05685](https://arxiv.org/abs/2306.05685); Panickssery et al. 2024 [arXiv 2404.13076](https://arxiv.org/abs/2404.13076); Sharma et al. 2023 [arXiv 2310.13548](https://arxiv.org/abs/2310.13548); Henkel et al. 2024 [arXiv 2405.02985](https://arxiv.org/abs/2405.02985)
- Contesto e multi-turno: Laban et al. 2025 [arXiv 2505.06120](https://arxiv.org/abs/2505.06120); Liu et al. 2023 [arXiv 2307.03172](https://arxiv.org/abs/2307.03172)
- BKT: Badrinath et al. 2021 [arXiv 2105.00385](https://arxiv.org/abs/2105.00385)
- Scienza cognitiva: Shaw & Nave 2026 [doi 10.31234/osf.io/yk25n_v1](https://doi.org/10.31234/osf.io/yk25n_v1); Bastani et al. 2025 [PNAS](https://doi.org/10.1073/pnas.2422633122); Butterfield & Metcalfe 2001 [doi](https://doi.org/10.1037/0278-7393.27.6.1491); Metcalfe 2017 [doi](https://doi.org/10.1146/annurev-psych-010416-044022); Butler et al. 2008 [doi](https://doi.org/10.1037/0278-7393.34.4.918); Kornell et al. 2009 [doi](https://doi.org/10.1037/a0015729); Yang et al. 2021 [doi](https://doi.org/10.1037/bul0000309); Rowland 2014 [doi](https://doi.org/10.1037/a0037559); Karpicke & Roediger 2008 [doi](https://doi.org/10.1126/science.1152408); Cepeda et al. 2008 [doi](https://doi.org/10.1111/j.1467-9280.2008.02209.x); Ginns 2006 [doi](https://doi.org/10.1016/j.learninstruc.2006.10.001); Sweller et al. 2019 [doi](https://doi.org/10.1007/s10648-019-09465-5); Kalyuga et al. 2003 [doi](https://doi.org/10.1207/s15326985ep3801_4); Renkl et al. 2004 [doi](https://doi.org/10.1023/b:truc.0000021815.74806.f6); Liu & Conrad 2018 [doi](https://doi.org/10.1177/0894439318755336); Rozenblit & Keil 2002 [doi](https://doi.org/10.1207/s15516709cog2605_1); Fernbach et al. 2013 [doi](https://doi.org/10.1177/0956797612464058); Sinha & Kapur 2021 [doi](https://doi.org/10.3102/00346543211019105); VanLehn 2011 [doi](https://doi.org/10.1080/00461520.2011.611369); Kulik & Fletcher 2016 [doi](https://doi.org/10.3102/0034654315581420)
