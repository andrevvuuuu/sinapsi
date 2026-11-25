# Verifica delle Critiche 2 e 4 di Argon: MOC, proposizioni zombie, scala del grafo

Metodo: ho letto il codice del branch `feat/ui-fixes-r5` e i ledger reali in `~/Library/Application Support/Sinapsi/graph/` (203 righe prop, 62 chain, 15 extraction, 4 move, positions.json con 789 chiavi). Gli script di analisi e benchmark, tutti in sola lettura, stanno nello scratchpad (`/private/tmp/claude-501/-Users-andreaantonelli--claude-spares-spare-HBkzBK/dd5584b6-4208-4e12-bbd6-723ecfc7a5c2/scratchpad/{an.ts,an2.mts,bench.mts,bench2.mts}`). Importano via `tsx` le funzioni pure vere (`deriveGraph`, `liveOnly`, `buildModel`, `fragileBases`, `createLayout`, `draw`). Non ho modificato nessun file del repo e non ho avviato né l'app né le CLI AI.
Legenda: [F] fatto verificato su codice o dati; [I] inferenza.

## Critica 2a: nascita dei concetti nei MOC ed esclusione dei MOC dall'estrazione

### Takeaway
**PARZIALE.** Il meccanismo descritto da Argon è vero nel codice: `birth` è la prima riga prop in ordine di file. Lo "svuotamento delle regioni dei capitoli" però sui dati reali quasi non succede: solo 2 concetti su 68 sono stati sottratti a una nota capitolo. Inoltre la mappa visibile ri-assegna già la nascita fuori dai MOC tramite `liveOnly`. Il danno vero è un altro: 66 concetti esistono solo nei MOC e `birth` è usato da molti consumatori lato main (ripasso, pratica, suggerimenti, sessione). Quindi la correzione giusta va fatta in `deriveGraph`, cioè in fase di derivazione, non riscrivendo il ledger. La guardia `isMoc` serve, ma va messa in due punti, non in uno solo.

### Cited Findings
- [F] La nascita di un concetto è il campo `birth` = `p.notePath` della **prima** PropLine con quell'id, nell'ordine di lettura del file (non ordinato per `at`). Le righe successive aggiungono solo `notes` — [derive.ts:16-25](src/main/graph/derive.ts). Il tipo documenta "The note the concept was born in", con `notes` "birth first" — [graph-types.ts:42-45](src/shared/graph-types.ts).
- [F] `buildModel` crea una Regione per ogni `c.birth` distinto e imposta `region: c.birth` — [model.ts:76-88](src/renderer/src/graph/model.ts). Quindi Argon descrive correttamente il funzionamento di regione e nascita.
- [F] Dati reali: le "133 proposizioni" sono **righe**, non concetti. Algebra Lineare MOC ha 35 righe (0 ref). Analisi 1 MOC ha 49 righe alla prima estrazione (16 ref, 33 nuove) più altre 49 alla ri-estrazione (tutte ref, 0 nuove). Totale 35+49+49 = 133 righe (`an.ts` sui ledger, [propositions.jsonl]).
- [F] Dopo `deriveGraph` i concetti sono 123: **68 nascono in un MOC** (35 in AL MOC, 33 in A1 MOC). Di questi, **66 compaiono solo nei MOC**. Solo **2** sono condivisi con una nota capitolo ("Leggi di De Morgan per insiemi" e "Corrispondenza tra partizioni ed equivalenze", nate in AL MOC e citate da "Insiemi e Appartenenza"). Sono gli unici due casi reali di "furto" (`an.ts`).
- [F] L'inverso è più frequente: **13** concetti nati in note capitolo (Fermat, Rolle, Lagrange, Weierstrass…) sono ri-citati via `{ref}` dal MOC di Analisi 1. Hanno mantenuto la nascita nel capitolo perché quei capitoli erano stati estratti **prima** del MOC (Fermat/Rolle/Lagrange il 27/10 alle 11:14-11:17, i MOC alle 18:34 e 19:29) — [extractions.jsonl]; `an.ts`.
- [F] Le estrazioni dei MOC hanno `reason: "background"` e sono del 27/10/2026. Il filtro `eligible` (solo note con nota viva) è stato introdotto il giorno dopo, nel commit d6b49a0 del 2026-10-28 ("extraction only for notes with a nota viva") — `git log -S eligible`; [jobs.ts:47-48,147-148](src/main/graph/jobs.ts); [ipc.ts:342](src/main/ipc.ts). Da allora il tick in background estrae solo note con nota viva pronta (`readySources`, [notes/store.ts:61](src/main/notes/store.ts)).
- [F] Nessun percorso di estrazione esclude i MOC: in `jobs.ts`, `extract.ts`, `ipc.ts` e `notes/` non c'è alcun `isMoc`. I soli utilizzatori sono `linked.ts`, `model.ts` e `suggest.ts` (grep). Restano aperti 4 ingressi: `request(path,'manual')` da [LessonLogView.tsx:61](src/renderer/src/lessons/LessonLogView.tsx), da [NotePicker.tsx:127](src/renderer/src/nota/NotePicker.tsx) e da GraphView; `'study'` alla nota viva pronta ([ipc.ts:301](src/main/ipc.ts)); `'linked'` da linkedSync ([ipc.ts:359](src/main/ipc.ts)); `'background'` ([jobs.ts:129-153](src/main/graph/jobs.ts)).
- [F] I MOC reali sono riconosciuti da entrambe le regole: il frontmatter ha `Type:\n  - MOC` e `scan.ts` prende il primo elemento di `data.Type ?? data.type` — [scan.ts:74-79](src/main/vault/scan.ts). Vale sia `n.type?.toUpperCase()==='MOC'` ([linked.ts:7](src/main/vault/linked.ts)) sia `shared/moc.ts`.
- [F] I MOC non hanno nota viva: le note vive `ready` sono solo 2, "Teorema di Lagrange del Valor Medio" (con il **vecchio** path `Matematica/…`) e "Numeri Razionali" (`notes/*.json`). La mappa passa sempre `livePaths` = sourcePath delle note pronte — [AppShell.tsx:160-165](src/renderer/src/shell/AppShell.tsx), [Home.tsx:346](src/renderer/src/home/Home.tsx). `liveOnly` tiene solo i concetti con almeno una nota viva e **ri-assegna `birth`** alla prima nota viva quando la nascita non è viva — [model.ts:256-264](src/renderer/src/graph/model.ts).
- [F] Con i dati reali, `liveOnly(g, _, readyPaths)` restituisce **0 concetti e 0 catene** (`an2.mts`). Il sourcePath della nota viva di Lagrange non segue il move registrato in [moves.jsonl] e i concetti puntano al nuovo path. Numeri Razionali non ha mai avuto un'estrazione ok. Nessun codice in `src/main/notes/` gestisce i move (grep).
- [F] `birth` è usato lato main da: [review.ts:100-101,142,195-200,233](src/main/memory/review.ts) (preparazione delle domande e testo di riferimento per "Spiegalo tu" letti dalla nota di nascita), [practice/material.ts:17-25,73](src/main/practice/material.ts), [suggest.ts:175](src/main/suggest/suggest.ts), [ipc.ts:446](src/main/ipc.ts) (materia del concetto), [extract.ts:105](src/main/graph/extract.ts) (`subjectOf(c.birth)` per i candidati), [runner.ts:424](src/main/session/runner.ts) (gli enunciati "esterni" sono quelli con `birth !== notePath`), [minimal-tree.ts:95](src/main/session/minimal-tree.ts).
- [F] Il ledger non ha né tombstone né record di ritiro: gli schemi sono solo `PropLine`, `ChainLine`, `ExtractionLine`, `MoveLine` — [graph-types.ts:7-35](src/shared/graph-types.ts). Lo store espone solo `append`/`read` — [store.ts:5-29](src/main/graph/store.ts).
- [F] Oggi `deriveGraph` usa il ledger `extractions` **solo** per la mappa `extracted` (hash e at dell'ultima estrazione ok, compresi i `skipped`) — [derive.ts:42-43](src/main/graph/derive.ts). Non lo usa per filtrare né i concetti né le catene.

### Inferences
- [I] Su "svuota le regioni dei capitoli e falsa R medio", Argon sbaglia nei fatti. Nella mappa (l'unica vista con regioni) i MOC non sono vivi, quindi i loro concetti esclusivi spariscono e quelli condivisi vengono riportati sulla nota viva da `liveOnly` (model.ts:263). Oggi la mappa è addirittura vuota, per il bug del sourcePath dopo il move, che nessuno dei due revisori ha visto. L'effetto reale del "MOC come nascita" si vede invece **lato main**. Il ripasso prepara domande raggruppate per `c.birth` e legge il testo del MOC (review.ts:100,142). "Spiegalo tu" corregge contro il testo del MOC (review.ts:233). La pratica sceglie materiale per nota di nascita. `pickCandidates` ricava la materia dal MOC.
- [I] La "pulizia del ledger" proposta da Argon non va fatta riscrivendo il JSONL: violerebbe il principio "append-only, tutto il resto derivato" ([graph-types.ts:3-6](src/shared/graph-types.ts), store.ts:15). La correzione corretta è in fase di derivazione e richiede solo una piccola modifica a `deriveGraph`:
  1. **Esclusione in derivazione delle note MOC**: `deriveGraph` riceve un predicato opzionale `excluded(notePath)`. Il main lo costruisce dall'indice del vault con `shared/isMoc`, perché il ledger non sa cosa sia un MOC. Le righe prop e chain di una nota esclusa non generano appartenenza (`notes`) né nascita. I 66 concetti esistenti solo nei MOC spariscono, i 2 condivisi nascono in "Insiemi e Appartenenza". Le 16 catene composte solo da concetti MOC spariscono (`an.ts`: 16 catene hanno tutte le note in un MOC).
  2. **Nascita = prima nota attiva non esclusa, ordinata per `at`**, non per ordine di file. Nome ed enunciato vanno comunque presi dalla prima riga "nuova" (`name !== ''`), anche se appartiene a una nota esclusa o non più attiva: le righe ref hanno `name:''` ([extract.ts:51](src/main/graph/extract.ts)) e senza questa regola il concetto resterebbe senza nome.
  3. È reversibile: togliere il tag MOC ripristina i concetti. Non serve alcun record nuovo.
- [I] Dove mettere la guardia `isMoc`: **in due punti**, non solo nella coda.
  - In `backgroundTick`, nel filtro `candidates` ([jobs.ts:148](src/main/graph/jobs.ts)): `&& !isMoc(n)`. È indispensabile. Se la guardia stesse solo in `run()` e uscisse senza scrivere una riga extraction, il MOC resterebbe `stale` e verrebbe ri-scelto a ogni tick come `candidates[0]`, bloccando l'estrazione in background a tempo indeterminato.
  - In `run()` (choke point unico per manual, study, linked e background, [jobs.ts:64-78](src/main/graph/jobs.ts)), prima di `bridge.ask`: se `isMoc(index.notes.find(path))`, si lancia un errore amichevole ("Le mappe di corso non si estraggono"). In alternativa la guardia va in `request()` ([jobs.ts:125-128](src/main/graph/jobs.ts)), che ha già l'indice tramite `available()`. Meglio `request()`, che fallisce subito senza entrare nella coda e senza scrivere `ok:false`.
  - L'esclusione in derivazione (punto 1) resta comunque necessaria: le guardie non toccano le righe già scritte.

### Gaps
- Non ho verificato se la UI permetta di creare una nota viva da un MOC (NotePicker non filtra per `moc`, ma non ho tracciato tutto il flusso `notes.create`).
- "R medio per regione": non ho trovato dove sia calcolato. Argon lo cita, ma non l'ho verificato.
- Le note "Teorema di Fermat…", "Teorema di Rolle", "Insiemi e Appartenenza" e "Massimi e Minimi…" non esistono più su disco (ricerca `find` nel vault, 497 .md) e non c'è un move registrato. 48 concetti hanno quindi una nascita su path inesistenti. Non so se le note siano state cancellate o fuse in altre. È un terzo caso di "zombie" (note sparite) che Argon non menziona.

## Critica 2b: concetti zombie dopo una ri-estrazione

### Takeaway
**CONFERMATA nel principio, ma l'esempio sui dati reali è nullo per i concetti (0 zombie) e piccolo per le catene (3).** Ritirare solo le catene lascerebbe davvero concetti isolati fittizi. L'algoritmo corretto si può fare tutto in fase di derivazione, perché ogni esecuzione scrive tutte le sue righe con un unico `at`. Non serve nessun id di estrazione nel ledger.

### Cited Findings
- [F] Ri-estrazione: `run()` scrive una PropLine per ogni proposizione della risposta, sia nuova (id coniato) sia `{ref}` (id esistente, `name:''`), poi le ChainLine, poi la riga extraction `ok:true`. Non scrive nulla per ciò che è sparito — [jobs.ts:87-96](src/main/graph/jobs.ts); [extract.ts:36-78](src/main/graph/extract.ts).
- [F] Tutte le righe di un'esecuzione condividono lo stesso `at = ctx.now` ([extract.ts:43,51,60,76](src/main/graph/extract.ts)). La riga extraction ha un `now()` successivo di pochi ms. Dati reali: prop alle `…351618` e extraction alle `…351626`; prop alle `…383706` e extraction alle `…383716` (`an.ts`). PropLine e ChainLine **non** hanno un id di estrazione — [graph-types.ts:7-15](src/shared/graph-types.ts).
- [F] I ref-only sono registrati come PropLine `{id: ref, name:'', statement:''}` ([extract.ts:51](src/main/graph/extract.ts)). L'appartenenza per nota di un concetto citato è quindi ricostruibile.
- [F] `c.notes` è l'unione di **tutte** le righe storiche, con dedup per path dopo i move — [derive.ts:16-25](src/main/graph/derive.ts). `chain.notes` funziona allo stesso modo — [derive.ts:27-36](src/main/graph/derive.ts).
- [F] Dati reali per Analisi 1 MOC: la seconda esecuzione cita con ref tutti i 49 id della prima (0 nuovi, 0 id della prima mancanti), quindi **0 concetti zombie**. Per le catene, prima esecuzione 16 e seconda 14: **3 chiavi della prima esecuzione sono assenti nella seconda e restano nel grafo** (`an2.mts`).
- [F] `pickCandidates` mette per primi i concetti "propri" della nota (`own`), il che spinge il modello a riusare gli id via ref — [extract.ts:99,109](src/main/graph/extract.ts). Questo spiega i 49/49 ref.
- [F] I move sono applicati sia a prop e chain sia alle extraction con la stessa funzione `where(path, at)` — [derive.ts:7-14](src/main/graph/derive.ts). Righe e estrazioni della stessa nota restano quindi allineate anche dopo un rinomina.
- [F] Le review sono `reviews.jsonl`, una riga per risposta, con chiave `conceptId` — [memory/store.ts:7-9](src/main/memory/store.ts); `review.memory()` = `memoryOf(tutte le review)` — [review.ts:260-262](src/main/memory/review.ts). Sul disco reale `memory/` contiene solo `explain-checked.jsonl` e `variants.jsonl`: **reviews.jsonl non esiste** (`ls`).
- [F] `positions.json` ha 789 chiavi, di cui 123 sono concetti attuali (`an.ts`). Il layout applica le posizioni salvate solo agli id presenti (`byId.get(id)`, altrimenti `continue`) — [layout.ts:108-114](src/renderer/src/graph/layout.ts). `positions()` salva solo i nodi correnti — [layout.ts:251-257](src/renderer/src/graph/layout.ts).
- [F] Nel grafo completo i concetti isolati (né premessa né conclusione) sono 46 su 123 (`an2.mts`), come nel 37% del report precedente.

### Inferences
- [I] Argon ha ragione sulla logica: se si filtrano per ultima estrazione solo le catene, un concetto rimosso da una nota resta in `c.notes` e perde le sue catene, quindi compare come orfano fittizio. Ha anche ragione che il criterio va applicato a `c.notes`. Sbaglia la regola "`notes.length===0` ⇒ ritirato" se presa da sola: va combinata con l'esclusione MOC e con la nascita ricalcolata, altrimenti un concetto ritirato dalla nota di nascita ma ancora citato altrove resta con `birth` sulla nota vecchia.
- [I] **Algoritmo esatto in fase di derivazione** (dentro `deriveGraph`, dopo il mapping `where`):
  1. `lastOk[N]` = la riga extraction con `at` massimo tra quelle `ok && !skipped` per la nota N (gli `skipped` non riscrivono il contenuto, [jobs.ts:73-76](src/main/graph/jobs.ts)).
  2. `batchAt[N]` = max `at` tra le righe prop e chain di N con `at <= lastOk[N].at`. Questo scarta le righe "orfane" di un'esecuzione interrotta a metà append (scritte dopo l'ultima ok e prive della loro riga extraction). Se `lastOk[N].nodes === 0` o `batchAt` non esiste, N non ha righe attive. Se `lastOk[N]` non esiste ma ci sono righe (ledger anteriore alle extraction, test), si ripiega su `batchAt[N]` = max `at` delle righe di N.
  3. Righe attive = righe di N con `at === batchAt[N]`, con N non escluso (MOC).
  4. `c.notes` = note con almeno una PropLine attiva su `c.id`, ordinate per `at` della riga attiva. `birth = notes[0]`. Nome ed enunciato restano presi dalla prima riga nuova storica (anche inattiva). `aliases` e `sections` vengono solo dalle righe attive.
  5. Concetti con `notes.length === 0` sono **ritirati**: esclusi da `concepts` e restituiti in un nuovo campo `retired: string[]` di `GraphData`, per diagnostica e per l'UI di ripasso.
  6. Catene: solo righe chain attive. Il controllo esistente `byId.has(...)` ([derive.ts:30](src/main/graph/derive.ts)) scarta automaticamente quelle che puntano a concetti ritirati. `chain.notes` è costruito dalle sole righe attive.
  7. `extracted` resta invariato.
- [I] Interazione con FSRS: `memoryOf` continuerà a produrre stati per id ritirati. Le lenti iterano su `model.concepts` (model.ts:240-250) e quindi li ignorano. Vanno però controllati `review.plan` e la coda "da ripassare" lato main, perché potrebbero proporre id che non sono più nel grafo: non ho letto tutto `review.plan`, vedi Gaps. Il rischio vero è un altro: se una ri-estrazione **conia un id nuovo** per la stessa idea invece del ref, oggi nasce un duplicato. Con il ritiro, invece, la storia FSRS sull'id vecchio diventa orfana. Mitigazione minima: non ritirare un concetto che ha review e mostrarlo come "dormiente", oppure passare in `pickCandidates` anche i concetti con review della nota come `own`, così il modello li ri-cita. Oggi l'impatto è zero perché `reviews.jsonl` non esiste.
- [I] `positions.json`: nessun intervento. Le chiavi dei ritirati vengono ignorate al caricamento e sparisono al salvataggio successivo.
- [I] Rinomine (`moves.ts`): l'algoritmo regge, perché righe ed extraction passano dalla stessa `where`. Dopo un rinomina seguito da una ri-estrazione al nuovo path, il batch vecchio (mappato sul nuovo path) e quello nuovo cadono sulla stessa chiave N e vince l'`at` maggiore. Restano due problemi fuori dal ledger: (a) note **cancellate** senza move (4 note reali, 48 concetti): il ledger non può saperlo, quindi serve un filtro con l'indice del vault, lo stesso predicato `excluded` esteso a "non presente nel vault", da applicare con prudenza durante una scansione parziale; (b) il **sourcePath delle note vive non segue i move**, e per questo la mappa oggi è vuota.
- [I] Lo step 0c del report precedente ("ritiro delle catene") è quindi incompleto, come dice Argon. Va riscritto come "0c: insieme attivo per nota (prop + chain) e concetti ritirati", nello stesso cambiamento di `deriveGraph`, con test in `tests/unit/graph-derive.test.ts`.

### Gaps
- Non ho letto per intero `review.plan`/`prepare` per vedere se partono da `g.concepts` (sicuro) o dalle chiavi di `memoryOf` (proporrebbero ritirati).
- La politica "dormiente vs ritirato" per concetti con storia FSRS è una scelta di prodotto, non un fatto.

## Critica 4: costo della pipeline del grafo a 150 note e 1.500-2.000 concetti

### Takeaway
**PARZIALE.** La preoccupazione di scala è giusta, ma Argon indica il collo di bottiglia sbagliato. A 2.000 concetti, derive, buildModel, modelKey e pick costano 0,3-1,5 ms. La lente fragile costa meno di 1 ms su grafi realistici e 30-80 ms solo in un DAG profondo con un terzo o tutti i concetti deboli. Il costo dominante è il **warm-up sincrono di d3-force: 400 tick ≈ 1,7 s a 1.500 concetti e ≈ 3 s a 2.000**, sul thread del renderer. Ogni tick successivo costa 4-11 ms. Precalcolare le lenti è una correzione economica e indipendente, non un prerequisito di altro lavoro su draw.ts. "Per modelKey" è anche sbagliato: la lente dipende pure dalla memoria.

### Cited Findings
- [F] La lente fragile è calcolata dentro `draw()` a ogni frame sporco: `fragileBases(model, s.memory)` — [draw.ts:265](src/renderer/src/graph/draw.ts). `fragileBases` chiama `descendants()` (DFS) solo per i concetti `incerto`/`debole`, grazie al cortocircuito `&&` — [model.ts:228-238](src/renderer/src/graph/model.ts). Inoltre `lensCounts` → `fragileBases` gira a **ogni render React** di GraphView, con qualsiasi lente e senza memo — [GraphView.tsx:190](src/renderer/src/graph/GraphView.tsx); [model.ts:240-250](src/renderer/src/graph/model.ts).
- [F] Il loop rAF disegna solo se `dirty` ([GraphView.tsx:313-348](src/renderer/src/graph/GraphView.tsx)), e `dirty` diventa true a ogni tick della simulazione, zoom o hover ([GraphView.tsx:212,300-303](src/renderer/src/graph/GraphView.tsx)).
- [F] Warm-up: `l.tick(l.warmup)` è sincrono nello `useEffect` del modello ([GraphView.tsx:207-211](src/renderer/src/graph/GraphView.tsx)), con `warmup = 400`, o 60 se almeno l'80% delle posizioni è riusato ([layout.ts:233-242](src/renderer/src/graph/layout.ts)). Forze: link, manyBody con `distanceMax(500)`, clusterPull O(n), depthForce O(n), forceX/Y, radial, collide — [layout.ts:172-218](src/renderer/src/graph/layout.ts).
- [F] Benchmark sintetico (node 26, funzioni reali via tsx, 150 note, ~30% ref, vault sintetico di 500 note; `bench.mts`), tempi medi:

  | scenario | derive | liveOnly | modelKey | buildModel | fragileBases (30% deboli) | lensCounts | 400 tick | 1 tick | draw() solo JS k=1 / k=0,4 | pick |
  |---|---|---|---|---|---|---|---|---|---|---|
  | 123 concetti (oggi) | 0,12 | 0,04 | 0,03 | 0,09 | 0,02 | 0,03 | 64 | 0,16 | 0,28 / 0,31 | 0,01 |
  | 1.500 concetti, 554 catene, 1.719 nodi | 1,39 | 0,38 | 0,22 | 0,79 | 0,18 | 0,26 | **1.685** | 4,2 | 2,3 / 4,3 | 0,02 |
  | 2.000 concetti, 865 catene, 2.340 nodi | 1,47 | 0,33 | 0,31 | 0,72 | 0,19 | 0,26 | **3.051** | 6,8 | 3,3 / 6,2 | 0,03 |
  | 4.000 concetti (stress) | 2,90 | 0,63 | 0,62 | 1,23 | 0,38 | 0,71 | 6.246 | 15,8 | 8,3 / 14,4 | 0,07 |

  (ms. "draw solo JS" usa un contesto canvas no-op, quindi esclude la rasterizzazione e il `filter: blur` del layer regioni, [draw.ts:118-136](src/renderer/src/graph/draw.ts), che in un browser vero costa di più.)
- [F] Caso peggiore della lente fragile (`bench2.mts`, DAG profondo con premesse i−1 e i/2): **47,8 ms** a 1.500 e **82,2 ms** a 2.000 con tutti i concetti deboli; **15,8 / 29,1 ms** con un terzo deboli. In questo scenario supera il budget di 16 ms per frame.
- [F] Scomposizione del tick a 2.000 concetti (`bench2.mts`): 10,6 ms con tutte le forze. Senza `charge` si scende a 2,5 ms, senza `collide` a 8,4 ms. `cluster`, `depth` e `link` pesano meno di 0,5 ms l'una. Quindi manyBody (Barnes–Hut) fa circa il 75% del costo.
- [F] Con i `livePaths`, `liveOnly` riduce anche l'indice del vault alle sole note vive ([model.ts:269](src/renderer/src/graph/model.ts)). I nodi visibili crescono quindi con il numero di note vive, non con le 497 note del vault.

### Inferences
- [I] Il "falso senso di sicurezza" è una critica giusta verso il report precedente: 1.500-2.000 concetti a fine primo anno sono plausibili. Il dato a supporto è che oggi 10 estrazioni riuscite hanno prodotto 123 concetti, e il vault ha 51 note solo in Analisi 1. Ma la priorità è un'altra:
  1. **Layout**: warm-up di 1,7-3 s che blocca la UI a ogni nuovo modello senza posizioni riusate (prima apertura, cambio di filtro). Con riuso, 60 tick ≈ 0,4-0,6 s, a ogni `graph:changed`. Rimedi: warm-up a fette di tempo (es. 8 ms per frame) o in un Worker; `theta` più alto o `distanceMax` minore per manyBody; collide solo sui concetti visibili.
  2. **Lenti**: memo di `fragileBases` e `lensCounts` con chiave **(modelKey, memoria)**, non solo modelKey. La memoria cambia dopo ogni review ([GraphView.tsx:179-189](src/renderer/src/graph/GraphView.tsx)) e la lente fragile dipende da `memory[c.id].state`. In alternativa si precalcola per modelKey la mappa `descendantsCount` (indipendente dalla memoria) e si filtra per stato al volo, con costo O(n) e senza DFS. È la soluzione migliore: un'unica DFS (o un conteggio su DAG di SCC) per modello.
  3. **draw()**: 3-6 ms in solo JS a 2.000 concetti, più il blur. Accettabile ma da tenere d'occhio. `focusSet` per una regione è O(n·notes) per frame ([draw.ts:52-54](src/renderer/src/graph/draw.ts)); conviene metterlo in cache per id.
  4. **pick()**: lineare ma trascurabile (0,03 ms a 2.340 nodi). Il quadtree non serve prima di 10⁴ nodi.
- [I] "0d prerequisito prima di toccare altro in draw.ts": **sbagliato come dipendenza**. Il precalcolo delle lenti non ha accoppiamenti con le altre modifiche di draw.ts: sono 5-10 righe in GraphView e model e si possono fare in qualsiasi ordine. Va fatto presto perché costa poco e perché ogni nuova lente (P4, orfani) deve nascere precalcolata. Non sblocca nient'altro. Se serve uno "0d" di scala, deve essere il warm-up asincrono del layout.

### Gaps
- Il benchmark esclude la rasterizzazione Canvas e il `ctx.filter = blur(...)` (non misurabili in node). Serve un profilo in Electron con dati sintetici.
- La topologia reale a 2.000 concetti è ignota. La profondità delle catene determina il costo della lente fragile: i grafi reali di oggi sono poco profondi (46/123 isolati).

## Affermazione laterale di Argon: resolveGoals e le parole sotto le 4 lettere

### Takeaway
**L'esempio è ERRATO, la regola esiste.** `resolveGoals` scarta i token con meno di 4 caratteri, ma "Limite" ne ha 6 e viene tenuto. Le vittime vere sono sigle e token corti ("SVD", "PCA", "Rn", "lim", "ODE").

### Cited Findings
- [F] `words()` fa NFD, toglie i diacritici, mette in minuscolo, estrae `[\p{L}\p{N}]+` e filtra `w.length >= 4` — [minimal-tree.ts:24-33](src/main/session/minimal-tree.ts). `resolveGoals` ordina i concetti per numero di parole in comune con il topic, a parità per depth decrescente, e tiene i primi 3. Il ripiego è sui concetti più profondi della nota — [minimal-tree.ts:34-51](src/main/session/minimal-tree.ts). La chiama `runner.ts:392`.
- [F] Lo stesso limite di 4 lettere (`\p{L}{4,}`, più stopword) vale per `pickCandidates` — [extract.ts:81-82](src/main/graph/extract.ts).

### Inferences
- [I] I difetti reali di `resolveGoals` sono altri: nessun peso IDF, per cui "teorema" e "funzione" fanno match ovunque; il pareggio premia la profondità; le sigle vengono perse. Resta valida la raccomandazione di passare `goalIds` espliciti dalla Card, ma il motivo non è "Limite".

### Gaps
- Nessuno.
