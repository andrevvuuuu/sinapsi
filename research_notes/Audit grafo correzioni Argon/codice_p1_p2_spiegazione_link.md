# Verifica sul codice: P1 corretto (Critica 1), P2 corretto (Critica 3), nuova feature "perché sono collegati"

Metodo: ho letto i sorgenti del branch `feat/ui-fixes-r5` senza modificarli e ho analizzato in sola lettura con Python i dati reali in `~/Library/Application Support/Sinapsi/` (graph/*.jsonl, memory/*.jsonl, ai-usage.jsonl). Le fonti sono percorsi relativi alla root del repo, con i numeri di riga. Legenda: **[F]** = fatto verificato, **[I]** = inferenza mia. Data: 2026-11-18.

Dati reali di contesto [F]: 123 concetti (203 righe in propositions.jsonl), 62 righe in chains.jsonl che dopo il merge diventano 43 catene distinte: 24 con 1 premessa, 14 con 2, 5 con 3. In `memory/` esistono solo `variants.jsonl` (25 varianti su **5 concetti**) e `explain-checked.jsonl`. **Non esiste `reviews.jsonl`**: nessun ripasso è mai stato registrato su disco.

## Q1: P1 e Critica 1 (priming verticale nella cascata)

### Takeaway
Argon ha ragione sul testo. Il report proponeva proprio `onReview([...weak, c.id])`, cioè il goal **in coda** dopo le premesse. Nel Ripasso oggi **ogni item mostrato viene registrato** (`advance()` chiama sempre `record`) e **ogni ReviewLine entra in FSRS** (il replay non ha filtri). Quindi la variante (b) di Argon, la "sintesi non registrata", richiede codice nuovo. La variante (a), il goal a freddo in testa, costa un riordino di una riga. Il motore di sessione applica già la regola giusta, "la prima evidenza a freddo vince": la cascata P1 dovrebbe copiarla.

### Cited Findings
- [F] Il report ha proposto davvero il goal in fondo: «più un secondo bottone "Ripassa le basi deboli (k)" che chiama `onReview([...weak, c.id])`» — `reports/Audit proposte grafo concettuale.md:43`. Il Refinement aggiunge «si ordina per depth **a fasce**» (riga 49). Le note di supporto dicono lo stesso: `research_notes/Audit proposte grafo concettuale/codice_p1_p3.md` (Inferences Q1: `.sort(byDepth)` → `onReview([...weak, c.id])`). Il report aveva anche segnalato il rischio di stima gonfiata a riga 47 («Se si risponde alla definizione A subito prima del teorema B che la cita, il "Good" su B vale meno di un Good a freddo»), ma non lo ha tradotto nel design. Era incoerente con sé stesso.
- [F] `plan({conceptIds})` rispetta l'ordine dato e non fa interleave — `src/main/memory/review.ts:154,207`. L'ordine della coda è quindi tutto nelle mani del chiamante.
- [F] Il voto di un item nel Ripasso nasce in tre modi — `src/renderer/src/review/ReviewView.tsx:151-229`:
  - `explain`: AI tramite `api.review.explain` (task `grade`), righe 156-181.
  - `open`: AI tramite `api.review.grade` (task `grade`, claude/sonnet, `GRADE_TIMEOUT=120_000`), righe 190-204 e `review.ts:210-227`.
  - tutti gli altri tipi (mc, truefalse, order, fill, match, counterexample, estimate, spoterror, graph): correzione **deterministica** nel componente (`state.correct`), con `proposeGrade`, righe 205-221.
  - In tutti i casi il voto è solo **proposto**: lo studente sceglie fra Di nuovo/Difficile/Bene/Facile (righe 15-20, 616-632). `proposeGrade` non propone mai 4 — `src/shared/memory-types.ts:66-70`.
- [F] La registrazione è incondizionata: `advance()` chiama `api.review.record({...})` per ogni item prima di `next()` — `ReviewView.tsx:231-260`. Non c'è un bottone "salta senza registrare" e non c'è un ramo di sola lettura. `record()` appende e ricalcola — `review.ts:254-259`.
- [F] Ogni riga del ledger entra in FSRS: `replay()` rigioca **tutte** le ReviewLine del concetto, e l'unica distinzione è lo scheduler `via==='session'` — `src/main/memory/fsrs.ts:9-14`. Non esiste un campo per una riga "di contesto, non evidenza". `ReviewLineSchema` ha `evidence: 'probe'|'retest'|'recall'`, ma serve solo come metadato e fsrs.ts non lo legge — `memory-types.ts:23`.
- [F] Né `ReviewItem` né `plan()` hanno flag per singolo item (record:false, preview o simili): `ReviewItem = {conceptId,name,notePath,noteTitle,subject,R,exercise,variantId}` — `review.ts:14-23`. Le opzioni di `plan` sono solo `{conceptIds, weakest, misconceptions}` (riga 29).
- [F] Ordine della sessione Tutor: `minimalTree` mette prima le basi e poi ordina per depth — `src/main/session/minimal-tree.ts:100-105`. Il protocollo però ha una fase **probe** (misura) prima di plan/teach: `phase: 'probe'|'plan'|'teach'|'consolidate'|'done'` — `src/shared/teacher-protocol.ts:44`, `src/main/session/prompt.ts:62`. Al massimo 3 probe, poi «misura conclusa: passa al piano» — `src/main/session/events.ts:345-346`. Quali nodi sondare lo decide l'LLM. Il codice **non** impone di sondare il goal per primo.
- [F] Il pre-test esiste, e con la regola anti-priming già scritta. `fsrsEvidence()` scrive **una sola riga FSRS per concetto per sessione** — `events.ts:372-412`, chiamata in `runner.ts:209-225` con `ref = session:<id>:<conceptId>` contro i doppioni. La riga si sceglie così (`events.ts:393-397`):
  - concetto già visto: `es.find(e => e.role === 'probe') ?? es[0]`, cioè la probe a freddo prima dell'insegnamento;
  - concetto nuovo: `es[1] ?? recall ?? es[0]`, con il commento «the first check right after its explanation is not a cold retrieval».
  - Esiste anche la padronanza "a freddo": `cold = prior 'la sai' && S >= solidDays && ev[0]?.correct` — `events.ts:319-321`.
- [F] Resta però un buco nella sessione. Se il goal già visto **non** viene sondato, vale `es[0]`, cioè il primo check, che può arrivare dopo aver insegnato le premesse. È lo stesso priming della Critica 1, mitigato solo se l'LLM sceglie di sondare il goal (`events.ts:394`).
- [F] Cercando `pretest|pre-test|diagnos|a freddo|cold|'probe'` in `src/` non risulta nessun pre-test nel Ripasso. Esistono solo la probe della sessione e `cold` in events.ts.
- [F] Priming per sovrapposizione di indizi nelle varianti: non è misurabile sui dati reali. Le 25 varianti coprono 5 concetti e **nessuno di questi è conclusione di una catena** (0 varianti su conclusioni, analisi su `memory/variants.jsonl`). Il prompt delle varianti passa solo `id | nome | enunciato` dei concetti della nota più il testo della nota, **senza le catene né le premesse** — `src/main/memory/variants.ts:68-96` (riga 86). Con `depth` attivo chiede però di puntare «su catene causa-effetto» (riga 80). `fallbackExercise` è «Senza guardare: che cosa dice «nome»?», con `answer = statement` — `variants.ts:48-50`.

### Inferences
- [I] **P1 corretto, opzione consigliata: "test-first, cascata su errore".**
  1. `onReview([c.id])` va per primo, a freddo, ed è registrato normalmente.
  2. Solo se il voto scelto è 1 o 2 si accodano le premesse deboli (filtro R+S alla `minimalTree`, depth a fasce, con un tetto).
  3. Questo richiede che ReviewView possa **estendere la coda a runtime**. Oggi `items` viene caricato una volta da `plan()` (`ReviewView.tsx:83-105`). Si può fare una seconda chiamata `api.review.plan({conceptIds: weak})` con append. Oppure, più semplice, la Card passa tutta la coda e ReviewView salta le premesse se il goal è andato bene: serve un campo nuovo `cascadeOf?: string` su ReviewItem, oppure un parametro di vista.
- [I] Opzione (a) "pura", cioè `onReview([c.id, ...weak])`: 1 riga, zero main. Toglie il priming **sul goal** ma lo rovescia. Dopo il goal la UI mostra la "Risposta di riferimento" (`ReviewView.tsx:612-615`), cioè l'enunciato del teorema, che spesso nomina le premesse. Le premesse testate subito dopo sono quindi un po' innescate. È un male minore: il voto che conta per la cascata è quello del goal, e le premesse sono "deboli" per definizione.
- [I] L'opzione (b), la sintesi non registrata, è più costosa e più ambigua di quanto Argon la presenti. Richiede (i) un flag `record:false` su ReviewItem (main + tipo condiviso), (ii) un ramo in `advance()` che non chiami `record`, (iii) una UI diversa senza i bottoni di voto. Inoltre "mostrare c.id come sintesi" alla fine significa mostrarlo **dopo** le premesse: è proprio l'esposizione che rende inutile un test successivo di c.id nella stessa giornata. In pratica (b) rimanda il test del goal a un altro giorno, e va bene solo se il goal non è già in scadenza.
- [I] Da non fare: aggiungere a ReviewLine un campo "non contare" filtrato in `replay()`. Sporcherebbe il ledger-evidenza con righe che non sono evidenza. Il ledger nasce come «the only memory evidence» (`memory-types.ts:8`).
- [I] Correzione collaterale per la sessione Tutor, coerente con la Critica 1: forzare almeno una probe sul goal quando il goal è già visto. Basta un vincolo in `checkTurnAgainst`/`stageInstruction`, che hanno già la regola sulle probe a `events.ts:345-346`. Oggi è lasciato alla discrezione dell'LLM.

### Gaps
- Non ci sono dati di ripasso reali (manca `reviews.jsonl`), quindi non si può misurare l'effetto del priming sui voti.
- Non ho verificato in UI che ReviewView regga una coda estesa a runtime senza rompere il riepilogo (`results`, `endedAt`).

## Q2: P2 e Critica 3 (MC con distrattori casuali)

### Takeaway
Argon ha ragione: il report proponeva testualmente MC con distrattori «della stessa regione o depth». Lo stesso prompt del Tutor di Sinapsi vieta questo uso della scelta multipla. Il cloze a recupero libero con autovalutazione **non esiste** come tipo: `fill` è un cloze **a scelta** (riconoscimento) e `open` passa sempre dal grading AI. La UI dei 4 voti con "Risposta di riferimento" è però già una flashcard a metà. Serve un ramo `check()` senza AI e un nuovo tipo (o un flag), più la regola asimmetrica in `advance()`.

### Cited Findings
- [F] La citazione del report: «Una domanda `mc` **deterministica** generata dalla catena: opzioni = premessa vera più 2–3 distrattori della stessa regione o depth» — `reports/Audit proposte grafo concettuale.md:57`. Lo stesso report, a riga 55, ammette che «con distrattori facili si indovina per eliminazione, e l'illusione di competenza è garantita», e poi li propone comunque.
- [F] Contraddizione interna al codice: il prompt del Tutor dice «Usa la scelta multipla solo per distinguere modelli sbagliati, con distrattori legati a misconcezioni» — `src/main/session/prompt.ts:35`. Distrattori casuali per regione o depth violano questa regola.
- [F] Tipi esercizio: `['open','mc','truefalse','order','fill','match','counterexample','estimate','spoterror','graph','explain']` — `src/shared/memory-types.ts:4`. Schemi in `src/shared/exercise-schema.ts:163-185`. Il commento di testa dice «Everything but `open` and `explain` is graded in the app; those two are graded by Claude» (righe 5-10). Mappatura sui componenti — `src/renderer/src/review/ExerciseView.tsx:24-46`:
  - mc e counterexample → `Choice`
  - truefalse → `TrueFalse`
  - order → `Order`
  - spoterror → `SpotError`
  - fill → `Fill`
  - match → `Match`
  - estimate → `Estimate`
  - graph → `GraphExercise`
  - open → `Open` (textarea, anche con dettatura)
  - explain → `Explain`
- [F] `fill` **non** è un cloze a recupero libero. Il testo usa `{{sbagliata|*giusta|sbagliata}}` e ogni lacuna è un menu di opzioni (`blankSpans`, `exercise-schema.ts:15-41,158-169`; `Fill` in `src/renderer/src/review/exercises/Inputs.tsx:10-45` con `options={groups[i].options}`). Riusarlo per «Premessa1 + [???] ⇒ Conclusione» riprodurrebbe il problema dell'MC.
- [F] Non esiste un tipo "flashcard" autovalutato. `open` chiama sempre `api.review.grade` (AI) — `ReviewView.tsx:190-204`. Senza testo non si può nemmeno verificare (`ready` richiede testo non vuoto, `Inputs.tsx:147`). L'unico percorso senza correzione è «Non lo so» (`dontKnow` → voto proposto 1, `ReviewView.tsx:182-189`). Esiste però il fallback «Non sono riuscito a correggere: valuta tu confrontando con la risposta di riferimento», con voto proposto 2 (`review.ts:223-226`): è già, di fatto, un'autovalutazione.
- [F] La mappatura dei voti su FSRS: `RATING = {1: Again, 2: Hard, 3: Good, 4: Easy}` — `src/main/memory/fsrs.ts:6`. Le etichette UI sono Di nuovo/Difficile/Bene/Facile — `ReviewView.tsx:15-20`. Il voto si sceglie dopo il reveal (righe 616-632).
- [F] Cosa contiene un concetto per la visualizzazione: `Concept = {id, name, statement, aliases, birth, notes, sections, depth}` — `src/shared/graph-types.ts:37-48`. **Non c'è un campo `kind`** (definizione/teorema/lemma): il prompt di estrazione chiede solo name, statement e section (`src/main/graph/extract-prompt.ts:20-30`). Lo statement è in LaTeX `$…$` e si rende con `RichText` (es. `GraphView.tsx:676`).
- [F] Strumenti disponibili per lo "sospetto":
  - `WeaknessLineSchema` ha `kind: 'misconception'|'gap'|'execution'|'discrimination'`, `source: 'session'|'practice'|'review'`, `status: 'active'|'resolved'` e `conceptId` opzionale — `memory-types.ts:33`.
  - `Memory.misconception` diventa true se l'ultima risposta è sbagliata con fiducia ≥70 **oppure** se c'è una weakness attiva — `fsrs.ts:32`.
  - Però `review.memory()` chiama `memoryOf(reviews, now())` **senza** passare le weakness attive — `review.ts:261-263` (bug già condiviso da Argon). Un "sospetto" registrato come weakness oggi **non comparirebbe** nella Card del grafo.
- [F] Il dedup delle catene nel grafo tiene l'id della prima riga — `src/main/graph/derive.ts:27-36`. Le catene non vengono ritirate alla ri-estrazione (nessun uso di `extractions` nel calcolo delle catene, righe 27-45).

### Inferences
- [I] **P2 corretto (MVP):** nuovo tipo `chain` (oppure `recall` con `blank`). È un esercizio costruito in modo deterministico dalla catena, nel renderer o in `plan()`.
  - **Prompt:** «Da {Premessa A (nome)} e [???] segue {Conclusione (nome)}. Qual è la premessa mancante? Enunciala.»
  - **Answer:** nome + statement LaTeX della premessa occultata.
  - **Componente:** si riusa `Open` (textarea, opzionale) più il blocco reveal esistente. In `check()` serve un ramo nuovo `type === 'chain'` che **non** chiama l'AI e imposta `verdict = {kind: 'self', proposed: null}`. Zero AI, zero varianti.
- [I] **Regola asimmetrica sugli enum esistenti.** Dopo il reveal, tre bottoni al posto dei quattro voti:
  - «Non la ricordavo» → ReviewLine `grade: 1` sul concetto occultato, `type: 'chain'`, `variantId: 'chain:<id>'`. È un fallimento reale di recupero contestuale. In più, opzionalmente, una WeaknessLine `kind: 'gap'`, `source: 'review'`, `ref: 'chain:<id>'` sulla **conclusione** (sospetto: forse non si sa da cosa segue).
  - «Solo il nome» → **nessuna** ReviewLine. Al massimo la weakness/sospetto, perché è riconoscimento senza contenuto.
  - «Nome ed enunciato, a freddo» → ReviewLine `grade: 3`. Mai 4 dalla catena: il contesto della catena è un indizio, quindi il "Facile" non è difendibile.
  - Questo richiede che `advance()` sappia saltare `record` (stessa modifica di Q1 (b)): conviene farla una volta sola.
- [I] La regola "il successo aggiorna FSRS solo se a freddo" non si può verificare dalla macchina con l'autovalutazione. Si fida della dichiarazione dello studente, come Anki. Se si vuole una verifica, il ramo `open` + `grade` AI esiste già (9–15 s di latenza, task `grade` su claude). Per un MVP zero-AI va accettata l'autodichiarazione.
- [I] Un nuovo valore in `EXERCISE_TYPES` è retro-compatibile in lettura per le righe vecchie (`type` è opzionale, `memory-types.ts:17`). Le build vecchie però scarterebbero le righe nuove se la lettura del JSONL valida rigidamente: va controllato `readJsonl`.
- [I] Da escludere dal quiz:
  - le catene intra-SCC;
  - le catene di note estratte più volte, finché `deriveGraph` non filtra per ultima estrazione ok (Critica 2), altrimenti si interroga su nessi già corretti dallo studente;
  - le premesse "mai viste" (R null): il quiz sarebbe prima esposizione, non recupero.
- [I] Copertura reale: 19 catene su 43 hanno ≥2 premesse (14+5). Il formato «A + [???] ⇒ C» si applica a queste. Per le 24 a premessa singola diventa «[???] ⇒ C» («da cosa segue C?»), un richiamo puro più difficile ma ancora valido.

### Gaps
- Non ho letto `readJsonl` per verificare come reagisce a un enum sconosciuto (riga scartata o file rifiutato).
- La distinzione definizione/teorema non esiste nei dati: non si può tarare il quiz per tipo di concetto senza estendere l'estrazione.

## Q3: Nuova proposta, "clicca un collegamento e ti spiego perché"

### Takeaway
Il "collegamento" logico è una **catena** (premesse ⇒ conclusione) e la catena **non contiene alcun testo di giustificazione**: solo id, premesse, conclusione, nota e timestamp. Le frecce **non sono cliccabili** (manca un hit-test punto-segmento). I wikilink sono legami **fra note**, non fra concetti, e non hanno contenuto logico. Ordine consigliato:
1. Zero-AI: enunciati più l'estratto della sezione della nota.
2. AI on-demand con cache e badge "non verificata".
3. Il "why" all'estrazione solo se (2) si rivela usato.

### Cited Findings
- [F] Cosa è un link nella UI:
  - `Arrow = {from, to, chain, head}`. Catene con >1 premessa: frecce premessa→giunzione (`head:false`) più giunzione→conclusione (`head:true`). Catene a premessa singola: freccia diretta — `src/renderer/src/graph/model.ts:19,95-113`.
  - I link del layout portano `chain` e `head` — `src/renderer/src/graph/layout.ts:24-27,120-121`. **Ogni segmento conosce già l'id della sua catena.**
  - I wikilink sono coppie `[notePath, notePath]` dai link Obsidian risolti — `model.ts:126-145`. Sono disegnati tratteggiati e curvi fra centroidi di regione o nodi nota, e svaniscono quando compaiono gli enunciati (`tProp < 0.95`) — `src/renderer/src/graph/draw.ts:171-191`.
- [F] Le catene non hanno testo di giustificazione:
  - `ChainLineSchema = {id, premises, conclusion, notePath, at}` — `src/shared/graph-types.ts:15`.
  - `Chain = {id, premises, conclusion, notes}` — riga 49.
  - Lo schema dell'estrazione è `ChainItem = {premises, conclusion}` — `src/main/graph/extract.ts:7`.
  - Il formato del prompt è `"chains": [ { "premises": [...], "conclusion": "p2" } ]` — `extract-prompt.ts:30`.
  - Le chiavi reali in chains.jsonl sono esattamente `{premises, id, conclusion, notePath, at}` (verificato sui dati).
  - Il prompt dice solo che «Solo l'implicazione giustifica una catena» (riga 17), ma non chiede di scrivere la giustificazione.
- [F] Testo sorgente disponibile senza AI:
  - statement di premesse e conclusione (`Concept.statement`);
  - le note di provenienza della catena (`Chain.notes`, `derive.ts:34-35`);
  - la sezione di ogni concetto per nota (`Concept.sections[notePath]`, `derive.ts:19,23`).
  - Sui dati reali: in **61 catene su 62** tutti i membri hanno una sezione nella nota della catena, e in **34 su 62** stanno tutti nella **stessa** sezione.
  - Esiste già un estrattore di sezioni per titolo (`sectionText(note, titles)`), ma è privato in main — `src/main/session/runner.ts:87-104`. È usato per il contesto del Tutor (righe 412-421) e per il riferimento di `validateChoices` (righe 186-189).
  - Il renderer **non** ha un IPC per leggere il testo di una nota: il preload espone `vault.index`/`onChange` (`src/preload/index.ts:16-18`) e l'apertura della nota.
- [F] Hit-test: `pick()` controlla le etichette di regione e poi solo i nodi `concept`/`note` con distanza euclidea dal centro — `src/renderer/src/graph/GraphView.tsx:384-402`. Non esiste una distanza punto-segmento: in `src/renderer/src/graph/` `hypot` si usa solo per i nodi e per la lunghezza della freccia (`draw.ts:211`, `GraphView.tsx:395,457`). `Sel = {kind: 'concept'|'region'|'note'; id}` — `draw.ts:10`. Non c'è un kind `chain`/`junction`.
- [F] Dove mostrarla: la `Card` (`GraphView.tsx:628-...`) ha rami per concept, region e note. La Card concetto elenca "Segue da"/"Porta a" **appiattiti**, senza dire quale catena (righe 693-704, da `model.parents/kids`). È il posto naturale per un ramo `sel.kind === 'chain'`, e le righe "Segue da" potrebbero diventare cliccabili per catena.
- [F] Verifica di testi generati da AI nel codice:
  - `explain-checked.jsonl` **non è una verifica**. È un marcatore «Concepts the model already judged for a "Spiegalo tu", with or without one: never asked again» — `src/main/memory/variants.ts:102-116`. Viene scritto dopo la generazione delle varianti quando i tipi includono `explain` (`review.ts:118`) e serve solo a non richiedere più il controllo (`review.ts:83,97`). Non è riusabile per controllare spiegazioni.
  - Il pattern di verifica vero è `validateChoices` — `src/main/session/grade.ts:42-63`. Fa una chiamata `task: 'grade'` con `GRADING_RIGOR`: «Controlla … che ogni risposta indicata come corretta sia implicata dal riferimento», `cache: false`, `priority: 'background'`, su **l'altro motore** (`otherEngine`, `runner.ts:193-200`, `src/main/ipc.ts:193`). Il riferimento è `statement + sezione della nota` (`runner.ts:186-189`). Gli esiti vanno nel log `validated` (righe 202-203).
- [F] Cache del bridge: `ask({cache: true})` salva la risposta su disco con chiave `sha256(engine|model|prompt|schema)` e la rilegge se valida lo schema — `src/main/ai/bridge.ts:218-256`. Una spiegazione on-demand ricliccata con lo stesso prompt è istantanea. Cambia chiave se cambiano gli enunciati o il testo della sezione.
- [F] Latenze reali (`ai-usage.jsonl`, solo chiamate ok):
  - `teach` claude/sonnet: n=55, mediana 9,3 s, p90 ≈15 s;
  - `extract` agy flash-high: n=8, mediana 273 s;
  - `extract` agy flash-medium: n=2, ≈135 s;
  - `variants` agy flash-high: n=2, ≈130 s;
  - `note`: ≈380–394 s;
  - token di output dell'estrazione: ~14k–40k per chiamata (righe ok con token >0);
  - `costUsd` vale sempre 0 (CLI in abbonamento): il costo vero è la quota, molto limitata su agy.
- [F] Coda AI: un job alla volta per motore, con priorità interactive > background — `src/main/ai/bridge.ts:82-110`. Lo streaming parziale c'è solo per claude (riga 115).

### Inferences
- [I] **Hit-test sulle frecce (prerequisito per tutte le opzioni).**
  - Aggiungere a `pick()`, **dopo** i nodi (i nodi vincono), un ciclo su `layout.links` con `!l.wikilink`. Calcolare la distanza punto-segmento in coordinate schermo (`n.x*k+tx`) e accettare se < ~5 px. Restituire `{kind: 'chain', id: l.chain}`.
  - Va estesa la union `Sel` in draw.ts e serve un highlight della catena: il percorso `path`/`F` esiste già e si possono riusare `onPath([...premises, conclusion])`.
  - Costo: O(archi) per pointermove, trascurabile con 43 catene. Con 1.500–2.000 concetti (Critica 4) resta ok, perché il ciclo è lineare e già lo è per i nodi.
  - Rischio UX: le frecce sono sottili (`lineWidth = 1.15`, draw.ts:195) e passano vicino ai nodi, quindi i click accidentali sono probabili. Alternativa robusta: rendere cliccabile la **giunzione** (un nodo, raggio fisso) e le righe "Segue da" della Card concetto, raggruppate per catena. Per le catene a premessa singola resta solo il segmento.
- [I] **Opzione (a), zero-AI (MVP consigliato).** Card `chain` con:
  - «Da: [premesse con enunciato LaTeX] ⇒ [conclusione con enunciato]»;
  - le note di provenienza con la sezione;
  - un **estratto della sezione** della nota (o delle sezioni, se diverse) e il bottone «Apri la nota».
  - Serve un IPC nuovo (es. `graph.chainSource(chainId)`) che in main legga la nota (c'è già `deps.readNote`) ed esporti `sectionText`.
  - Non spiega il *perché* in prosa, ma mostra **le parole di Andrea** dove il nesso è argomentato. Copre 61/62 catene. Zero allucinazioni, zero quota.
  - Limite: i titoli di sezione sono scritti dal modello («§2 Enunciato») e `sectionText` richiede il match esatto del titolo dell'header. Quando fallisce va mostrato il fallback "apri la nota".
- [I] **Opzione (c), AI on-demand con cache (secondo passo).**
  - Bottone «Spiegami il nesso» nella Card catena, `bridge.ask({task: 'teach' o nuovo task 'why', cache: true, priority: 'interactive'})`.
  - Prompt: enunciati delle premesse e della conclusione, estratto di sezione, «spiega in 2–4 frasi perché le premesse insieme implicano la conclusione, usando solo il testo; se il testo non lo argomenta, dillo».
  - Costo atteso: ~9–15 s al primo click su claude (stima dalla mediana `teach`, il prompt sarà più corto del primo turno di sessione), istantaneo dopo, grazie alla cache.
  - Contesa: condivide la coda claude con grade e teach, ma è interactive.
- [I] **Opzione (b), "why" salvato all'estrazione (sconsigliata adesso).**
  - Interventi: `ChainItem` + `why?: string` (extract.ts:7), `ChainLineSchema` + `why` opzionale (graph-types.ts:15), `mergeExtraction` lo copia, `deriveGraph` deve scegliere il why **dell'ultima** riga, non della prima (oggi tiene la prima, derive.ts:34). Il prompt va esteso.
  - Costo in token: con ~8 catene per estrazione (62 righe / ~8 estrazioni ok) e ~50–70 token per frase, sono ~400–600 token di output, cioè ~1–3% dei 14k–40k attuali. Trascurabile.
  - Costo vero: per riempire il grafo esistente serve **ri-estrarre tutte le note**, ~135–275 s ciascuna su agy, con la quota limitata (cfr. memoria utente). Le ri-estrazioni aggiungono anche righe di catene che oggi non vengono ritirate (Critica 2).
  - Il why scritto in batch da flash-medium/high non è verificato. Il modello di estrazione è il più economico della pipeline.
  - Ha senso solo **dopo** il fix «ultima estrazione ok» e solo se (c) mostra un uso reale.
- [I] **Verifica delle spiegazioni.** Il pattern da riusare è `validateChoices` (grade.ts:42-63): «la spiegazione è implicata dal riferimento (enunciati + sezione)?», su `otherEngine`, in background, e se `ok:false` si mostra un badge «non verificata dal secondo modello».
  - Costo: un'altra chiamata. Se l'altro motore è agy, la latenza non è misurata per prompt piccoli, ma le chiamate agy osservate stanno fra 130 e 390 s su prompt grandi. Quindi la verifica dev'essere **asincrona**: la spiegazione appare subito con il badge "in verifica".
  - Va detto chiaramente: la verifica controlla la coerenza con la nota, non la correttezza matematica. Se la nota sbaglia, la verifica conferma l'errore.
- [I] **Rischio di allucinazione in matematica: concreto.**
  - L'estrattore può aver creato una catena dove la nota non argomenta davvero, perché il nesso è narrativo, nonostante la regola a extract-prompt.ts:17. Un "why" generato a posteriori **razionalizza** un nesso che potrebbe essere falso.
  - Il prompt di (c) deve permettere la risposta «la nota non giustifica questo nesso». Quell'esito è informazione utile: è un candidato per la coda di qualità dei dati.
  - Non va mai trasformato in FSRS: leggere una spiegazione non è evidenza di memoria (criterio trasversale del report, riga 132).
- [I] **Wikilink.** Non va generato alcun "why": sono link fra note scritti a mano, senza relazione logica estratta. Se cliccati, la Card deve dire «Collegamento che hai scritto in Obsidian tra le note X e Y: non è un nesso logico estratto». Può elencare i concetti condivisi fra le due note (la Card regione già calcola `shared`, `GraphView.tsx:724-728`) e le eventuali catene che attraversano le due regioni. Va anche notato che i wikilink spariscono a zoom alto (draw.ts:172): cliccarli avrebbe senso solo a zoom basso, dove le frecce delle catene sono quasi invisibili, quindi le due interazioni non collidono.

### Gaps
- La latenza di un prompt "why" corto non è misurata: le stime vengono da `teach` (prompt diverso).
- Non ho verificato su quante catene `sectionText` trova davvero l'header (match esatto del titolo modello ↔ header markdown). Ho verificato solo che le sezioni ci sono (61/62).
- Non so quante catene reali siano "narrative" invece che implicative: servirebbe una revisione manuale delle 43 catene.
