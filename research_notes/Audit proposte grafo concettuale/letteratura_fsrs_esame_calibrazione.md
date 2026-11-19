# FSRS, prontezza all'esame e metacognizione: matematica e letteratura per valutare la proposta P4 ("Tenuta all'esame")

Contesto verificato nel codice (non è una fonte esterna, serve per leggere le note):
- `node_modules/ts-fsrs` installato = **v5.4.2** (FSRS-6, 21 parametri). `forgetting_curve`, `computeDecayFactor`, `get_retrievability` sono in `node_modules/ts-fsrs/dist/index.mjs` (righe ~680-723 e ~1659).
- `src/shared/memory-types.ts`: `stateOf(R)` = `>=0.85` "la sai", `>=0.6` "incerto", altrimenti "debole"; `Memory.stability` esiste già; `misconception` = ultima risposta sbagliata con fiducia >= 70; `proposeGrade`: sbagliato o "Non lo so" -> 1 (Again) qualunque sia la fiducia; corretto con fiducia < 50 -> 2 (Hard); corretto con fiducia >= 50 -> 3 (Good). `sessionGrade`: anche "partial" -> 1.
- Tutti i numeri sotto sono calcolati con i parametri di default di ts-fsrs 5.4.2 (`default_w`, w20 = 0.1542). Con parametri ottimizzati sull'utente i valori cambiano.

---

## 1. Matematica FSRS-6: S, R(t,S), w20, R proiettata all'esame. "S < giorni all'esame" equivale a "R_esame < 0.9"?

### Takeaway
Non esattamente. In FSRS-6 vale R(t,S) = (1 + factor·t/S)^(−w20), con factor = 0.9^(−1/w20) − 1, quindi R = 0.9 esattamente quando t = S. Ma t è il tempo **dall'ultimo ripasso**, non da oggi: il criterio corretto è "t_trascorso + d_esame > S" (equivalente a R_esame < 0.9), e "S < d_esame" è un'approssimazione indulgente che ignora i giorni già trascorsi. Inoltre la soglia 0.9 è molto severa: con la curva FSRS-6 (piatta dopo S) il nodo d'esempio dell'audit (S = 2 giorni, ripassato ieri, esame tra 10 giorni) arriva all'esame con R ≈ 0.75, cioè "incerto" e non "crollato". Conviene quindi proiettare R_esame e mostrarlo direttamente, invece di confrontare S con i giorni.

### Cited Findings
- Definizione FSRS-6 (wiki ufficiale, ora spostata nel wiki di awesome-fsrs): "The forgetting curve's decay is trainable: R(t,S) = (1 + factor · t/S)^(−w20), where factor = 0.9^(−1/w20) − 1 to ensure R(S,S) = 90%." Parametri di default FSRS-6: `[0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542]` — [FSRS wiki, The Algorithm](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm) (la vecchia pagina [fsrs4anki/wiki/The-Algorithm](https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm) rimanda lì con "Page moved").
- Versioni precedenti: FSRS v4 DECAY = −1, FACTOR = 1/9; FSRS-4.5 DECAY = −0.5, FACTOR = 19/81; "The new forgetting curve drops sharply before S and flatly after S". Intervallo: I(r,S) = S/FACTOR · (r^(1/DECAY) − 1), con I(0.9,S) = S — [FSRS wiki, The Algorithm](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm).
- Implementazione ts-fsrs 5.x (sorgente installato): `computeDecayFactor` restituisce `decay = -w[20]`, `factor = exp(log(0.9)/decay) - 1`; `forgetting_curve(w, t, S) = (1 + factor*t/S)^decay`; `next_interval`: I = (r^(1/decay) − 1)/factor · S; `get_retrievability(card, now)` usa t = giorni (frazionari) da `card.last_review` a `now`, e restituisce 0 per le carte New — [ts-fsrs repo](https://github.com/open-spaced-repetition/ts-fsrs) (file `dist/index.mjs`, v5.4.2). Con i default: decay = −0.1542, factor = 0.98034649.
- FSRS-6 cambia anche la stabilità dopo un ripasso nello stesso giorno: S' = S · e^(w17·(G − 3 + w18)) · S^(−w19) — [FSRS wiki, The Algorithm](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm).
- La "stabilità" va intesa come stima rumorosa: Expertium riporta un errore percentuale assoluto medio (MAPE) di circa 33% nel predire S sulla sua collezione (12% quando S è in funzione del valore precedente) — [Expertium, "A technical explanation of FSRS"](https://expertium.github.io/Algorithm.html).
- **Esempi calcolati** (ts-fsrs 5.4.2, `forgetting_curve(default_w, t, S)`; "dall'ultimo" = giorni trascorsi dall'ultimo ripasso; esame tra d = 10 giorni):

  | S (giorni) | dall'ultimo | R oggi | R all'esame (senza ripassi) |
  |---|---|---|---|
  | 2 | 1 | 0.940 ("la sai") | **0.751** |
  | 2 | 0 | 1.000 | 0.761 |
  | 5 | 1 | 0.973 | 0.838 |
  | 10 | 0 | 1.000 | 0.900 (limite esatto) |
  | 10 | 3 | 0.961 | 0.881 (S = d ma R_esame < 0.9) |
  | 30 | 0 | 1.000 | 0.957 |

  Per confronto, con la curva FSRS-4.5/5 (decay 0.5) lo stesso nodo S = 2, t = 11 darebbe 0.661: la "piattezza" FSRS-6 conta molto. Forma della curva FSRS-6 di default: R(S) = 0.90, R(2S) = 0.846, R(5S) = 0.761, R(10S) = 0.693, R(20S) = 0.627 (calcolo con ts-fsrs).
- **Stabilità minima per arrivare all'esame sopra una soglia** (inversione della formula, t_tot = t_trascorso + d): S_min(r) = t_tot · factor / (r^(1/decay) − 1). Per t_tot = 11 giorni e w20 di default: r = 0.90 -> S ≥ 11.0; r = 0.85 -> S ≥ 5.8; r = 0.80 -> S ≥ 3.3; r = 0.70 -> S ≥ 1.2 (calcolo con ts-fsrs).
- **FSRS-7 esiste** (stato a nov. 2026): due stabilità (S_long, S_short) più D, 34 parametri, 11 dei quali per la curva di oblio; R è una media pesata di R_short e R_long, con pesi che dipendono da S_short, S_long e D; progettato per intervalli frazionari (modella i ripassi nello stesso giorno); gli intervalli si calcolano iterativamente, non più in forma chiusa; "S90" (tempo perché R scenda al 90%) non è più usato internamente ma si può ancora calcolare per la visualizzazione — [FSRS wiki, The Algorithm (sezione FSRS-7)](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm); [Expertium, Algorithm FSRS-7](https://expertium.github.io/Algorithm_FSRS-7.html).
- **ts-fsrs v6.0.0** (rilasciato il 2026-10-28) introduce FSRS-7 come modello predefinito di `DefaultScheduler`. Breaking change: rimossi gli export root `forgetting_curve` e `computeDecayFactor` e i metodi `get_retrievability`/`next_interval` della facade legacy; si usano invece `forgettingCurve`, `retrievability`, `nextInterval` sui moduli `ts-fsrs/models/fsrs-6` / `fsrs-7`; `FSRS`/`fsrs()` restano ma sono deprecati e usano FSRS-6 — [ts-fsrs release v6.0.0](https://github.com/open-spaced-repetition/ts-fsrs/releases/tag/v6.0.0).
- srs-benchmark (log loss, più basso è meglio): FSRS-7 recency 0.3370, FSRS-7 0.3401, FSRS-rs (FSRS-6) 0.3443, FSRS-6 0.3460; RMSE(bins): FSRS-7 0.0634 vs FSRS-6 0.0653. Il README osserva che FSRS-6 ha reso "ottimizzabile" la piattezza della curva, così che "the shape of the curve is different for different users" — [srs-benchmark README](https://github.com/open-spaced-repetition/srs-benchmark).

### Inferences
- In FSRS-6 "S < d_esame" non equivale a "R_esame < 0.9". L'equivalenza esatta è **t_trascorso + d_esame > S ⇔ R_esame < 0.9**. Se l'ultimo ripasso è vecchio, "S < d" sottostima il rischio (nell'esempio S = 10, ripassato 3 giorni fa, esame tra 10: per "S < d" il nodo è salvo, ma R_esame = 0.88).
- La soglia implicita 0.9 è più severa della soglia "la sai" che l'app già usa (0.85). Per coerenza conviene **colorare il valore proiettato R_esame con le stesse soglie** di `stateOf` (0.85/0.6), oppure con una soglia per l'esame configurabile. Con 0.85, un nodo S = 2 ripassato ieri all'esame risulta "incerto" (0.75). L'audit dice che "crollerà": è vero per la curva esponenziale FSRS-4, ma con la curva FSRS-6 è un'esagerazione.
- Implementazione minima: `R_esame = forgetting_curve(w, (examAt − last_review)/giorno, S)`, cioè lo stesso calcolo di `get_retrievability(card, examDate)`. È una riga in più rispetto a R ora, e funziona anche con parametri personalizzati (usa w20). Su ts-fsrs v6 / FSRS-7 S non entra più direttamente nella formula di R, quindi **R_esame va calcolato con la funzione di retrievability del modello alla data dell'esame, non con S**. Questo è un motivo in più per non legare la lente a "S vs giorni".
- R_esame "senza ripassi" è una proiezione controfattuale: misura cosa succede se non tocchi più il nodo. Va presentata così ("se non lo ripassi più"), perché lo scheduler lo riproporrà comunque prima dell'esame.

### Gaps
- Non ho un dato empirico sulla piattezza (w20) per proposizioni matematiche (definizioni/teoremi) rispetto alle flashcard Anki generiche: i default derivano da dati Anki eterogenei. Con pochi ripassi per utente, l'ottimizzazione di w20 sarà poco affidabile.
- Non ho verificato i nomi esatti delle API di ts-fsrs v6 oltre a quanto riporta la nota di rilascio (`forgettingCurve`, `retrievability`, `nextInterval`); va controllata la guida di migrazione prima di aggiornare.

---

## 2. Scheduling orientato a una scadenza: approcci esistenti e scelta degli item da ripassare con tempo limitato

### Takeaway
La letteratura sostiene due cose. (a) L'intervallo ottimale tra ripassi dipende dalla distanza del test: per test vicini è una frazione più grande della ritenzione richiesta (Cepeda et al. 2008). (b) Uno scheduling personalizzato basato su un modello di memoria batte quello generico a parità di tempo, su un esame cumulativo reale (Lindsey et al. 2014). Per un esame a data fissa il criterio decisionale giusto non è "S < d" ma il **guadagno atteso di R_esame per minuto di ripasso**, ordinato in modo greedy. Questo criterio si calcola con le stesse funzioni FSRS.

### Cited Findings
- Cepeda, Vul, Rohrer, Wixted & Pashler (2008): più di 1.350 partecipanti, gap fino a 3,5 mesi, test finale fino a 1 anno dopo. "The optimal gap increased as test delay increased. However, when measured as a proportion of test delay, the optimal gap declined from about 20 to 40% of a 1-week test delay to about 5 to 10% of a 1-year test delay." — [Psychological Science 19(11):1095-1102, doi:10.1111/j.1467-9280.2008.02209.x](https://doi.org/10.1111/j.1467-9280.2008.02209.x) ([PubMed 19076480](https://pubmed.ncbi.nlm.nih.gov/19076480/)). Nota: la consegna parlava di "~10-20%". L'abstract dice 20-40% per un test a 1 settimana e 5-10% per un test a 1 anno.
- Lindsey, Shroyer, Pashler & Mozer (2014): ripasso personalizzato (modello statistico delle differenze individuali più teoria della memoria) in un corso semestrale di lingua straniera alle medie. Su un esame cumulativo dopo il semestre, a parità di tempo, +16,5% di ritenzione rispetto allo studio massato e +10,0% rispetto a uno spacing uguale per tutti — [Psychological Science 25(3):639-647, doi:10.1177/0956797613504302](https://doi.org/10.1177/0956797613504302) ([PubMed 24444515](https://pubmed.ncbi.nlm.nih.gov/24444515/)).
- Tabibian et al. (2019), MEMORIZE: lo spaced repetition è formalizzato come controllo ottimo di processi di punto temporali marcati. Per due modelli di memoria noti, se l'obiettivo è massimizzare la probabilità di richiamo con un costo sulla frequenza di ripasso, "the optimal reviewing schedule is given by the recall probability itself" (l'intensità di ripasso è proporzionale a 1 − R). È validato con un esperimento naturale su Duolingo — [PNAS 116(10):3988-3993, doi:10.1073/pnas.1815156116](https://doi.org/10.1073/pnas.1815156116).
- Settles & Meeder (2016), Half-Life Regression: modello trainabile della forma p = 2^(−Δ/h), con emivita h stimata da feature dell'item e dello storico (Duolingo) — [ACL 2016, doi:10.18653/v1/P16-1174](https://doi.org/10.18653/v1/P16-1174). (La forma della formula viene dalla mia conoscenza del paper; i metadati sono verificati via Crossref.)
- FSRS Helper (add-on Anki): "Advance — Decreases the intervals of undue cards based on current and requested R, and interval length to minimize damage to long-term learning. When you want to review your material ahead of time, for example, before a test." Esistono anche Postpone, Load Balancing (perturbazione casuale per uniformare il carico), Easy Days, Disperse Siblings, Flatten, Schedule a Break. L'add-on "will sort your cards and perform the advance/postpone in such a way that the deviation from the original review schedule is minimal" — [fsrs4anki-helper README](https://github.com/open-spaced-repetition/fsrs4anki-helper).
- **Simulazione del guadagno marginale** (ts-fsrs 5.4.2, default, fuzz disattivato; esame tra 10 giorni; D = difficoltà). E[R_esame | ripasso oggi] = R_oggi·R(d, S'_Good) + (1 − R_oggi)·R(d, S'_Again). È una stima pessimistica sul ramo Again, perché ignora il riapprendimento successivo:

  | S | D | dall'ultimo | R oggi | R_esame senza ripasso | S' se Good | E[R_esame] con ripasso oggi | ΔR_esame |
  |---|---|---|---|---|---|---|---|
  | 2 | 5 | 1 | 0.940 | 0.751 | 5.4 | 0.839 | +0.087 |
  | 2 | 5 | 3 | 0.870 | 0.735 | 9.6 | 0.863 | +0.128 |
  | 4 | 8 | 6 | 0.870 | 0.782 | 10.8 | 0.875 | +0.093 |
  | 10 | 5 | 5 | 0.940 | 0.870 | 22.9 | 0.933 | +0.063 |
  | 30 | 5 | 10 | 0.957 | 0.925 | 52.9 | 0.965 | +0.040 |

  (calcolo eseguito con `fsrs().repeat` e `forgetting_curve`).

### Inferences
- **Criterio raccomandato per la lente**: colorare per R_esame proiettata e ordinare la lista "cosa ripassare" per ΔR_esame / costo_minuti (greedy, problema di tipo knapsack). Il costo si stima dalla durata media dei ripassi del nodo o del tipo di esercizio. Massimizzare Σ R_esame equivale a massimizzare il numero atteso di proposizioni ricordate all'esame. Pesi per l'importanza d'esame (es. teoremi centrali, alta centralità nel MOC) si inseriscono come w_i·ΔR_i.
- Dalla simulazione: il guadagno più alto non va ai nodi con S più basso in assoluto, ma a quelli con R_oggi già un po' scesa e S medio-basso, coerente con l'effetto spacing e con il fatto che in FSRS l'aumento di S è maggiore quando R è più bassa. Ripassare un nodo appena visto (S = 2, ieri) rende meno che ripassarlo tra qualche giorno. Il greedy va quindi rieseguito ogni giorno e non solo una volta: è un problema sequenziale, e una politica a un passo è un'euristica, non l'ottimo.
- Cepeda et al. suggerisce che a ~10 giorni dall'esame gli intervalli utili sono dell'ordine di 2-4 giorni (20-40% di una ritenzione di circa una settimana). Questo è coerente con un "Advance" verso la data d'esame invece di lasciare desired retention e intervalli lunghi tarati sul lungo termine.
- Un'alternativa più semplice e già usata nell'ecosistema: per il periodo pre-esame, impostare una desired retention calcolata in modo che il prossimo due cada prima dell'esame (stile FSRS Helper "Advance"). È meno ottimale del greedy ma facile da spiegare.

### Gaps
- Non ho trovato una funzione "deadline/exam date" nativa in Anki/FSRS oltre ad Advance (manuale). Non ho verificato le funzioni di scheduling con deadline di SuperMemo da fonte primaria: le escludo.
- Non ho trovato studi che validino empiricamente il greedy ΔR/minuto su FSRS. È un'inferenza da teoria del controllo ottimo (Tabibian) e dal modello, non un risultato sperimentale.
- Il ramo Again della simulazione ignora il relearning: il guadagno vero per i nodi deboli è probabilmente più alto.

---

## 3. Item correlati e prerequisiti: FSRS li tratta come indipendenti

### Takeaway
FSRS modella ogni carta in modo indipendente, per scelta progettuale dichiarata. Per un grafo di proposizioni con prerequisiti, R_esame per nodo è una stima marginale: la probabilità di saper usare un teorema all'esame dipende anche dai prerequisiti. I modelli che usano informazioni tra carte (RWKV con feature sui fratelli, DBN/knowledge tracing sui grafi di skill) predicono meglio, ma a un costo elevato di dati e complessità.

### Cited Findings
- Expertium, sui limiti di FSRS-7: "It treats all cards as independent, even cards from the same deck and even siblings (sibling dispersion in Anki is not part of the FSRS algorithm, it's a separate thing...)"; non conosce il contenuto della carta; RWKV nel benchmark affronta i primi due limiti — [Expertium, Algorithm FSRS-7](https://expertium.github.io/Algorithm_FSRS-7.html).
- In srs-benchmark RWKV ha come input l'intero storico di tutte le carte, comprese le "sibling card information" e la struttura dei mazzi, ed è il migliore: log loss 0.2773 (RWKV-Instant) contro 0.3370 di FSRS-7 recency. È addestrato su 5.000 utenti e valutato su altri 5.000, non ottimizzato per singolo utente — [srs-benchmark README](https://github.com/open-spaced-repetition/srs-benchmark).
- Käser, Klingler, Schwing & Gross (2014/2017): BKT "makes it impossible to represent the hierarchy and relationships between the different skills"; le reti bayesiane dinamiche (DBN) rappresentano più skill congiuntamente, con un algoritmo di ottimizzazione vincolata per i parametri. Su cinque dataset (matematica, ortografia, fisica) superano le tecniche precedenti in accuratezza predittiva e producono politiche didattiche sensate — [IEEE TLT 2017, doi:10.1109/TLT.2017.2689017](https://doi.org/10.1109/TLT.2017.2689017); versione ITS 2014 "Beyond Knowledge Tracing: Modeling Skill Topologies with Bayesian Networks", [doi:10.1007/978-3-319-07221-0_23](https://doi.org/10.1007/978-3-319-07221-0_23).
- Nakagawa, Iwasawa & Matsuo (2019), Graph-based Knowledge Tracing (GKT): knowledge tracing con graph neural network sul grafo delle skill — [WI 2019, doi:10.1145/3350546.3352513](https://doi.org/10.1145/3350546.3352513).
- Chen et al. (2018), Prerequisite-Driven Deep Knowledge Tracing: usa le relazioni di prerequisito come vincoli nell'addestramento di DKT — [ICDM 2018, doi:10.1109/ICDM.2018.00019](https://doi.org/10.1109/ICDM.2018.00019).

### Inferences
- Pragmatica per Sinapsi: **tenere FSRS per carta** (calibrato, spiegabile, pochi dati) e aggiungere sopra una **proiezione "a catena"** solo per la visualizzazione e la priorità. Per esempio un "R_esame effettivo" di un teorema ≈ R_esame(teorema) · min o prodotto delle R_esame dei prerequisiti diretti a 1 hop. Il prodotto assume indipendenza ed è pessimistico; il min è più conservativo sul legame più debole. È un'euristica non validata: va etichettata come tale e non scritta nello stato FSRS.
- Un DBN/GKT completo richiede molti dati per utente e per struttura. Per un singolo studente con poche centinaia di proposizioni è difficile da stimare, e romperebbe la proprietà attuale di Sinapsi ("FSRS state is rebuilt from these [reviews]"). I costi superano i benefici, almeno finché non c'è un dataset multi-utente.
- Conseguenza per la lente: un nodo verde con un prerequisito rosso andrebbe segnalato ("regge solo se reggono le premesse"). È qui che il grafo dà valore aggiunto rispetto ad Anki.

### Gaps
- Non ho trovato studi che misurino quanto l'indipendenza di FSRS degradi le predizioni su materiale matematico con prerequisiti espliciti: i benchmark usano dati Anki generici.
- Non ho letto i full text di GKT e PDKT: riporto solo l'idea principale da titolo e metadati.

---

## 4. Calibrazione e fiducia: JOL, sovrastima, ipercorrezione, come usare lo slider "fiducia"

### Takeaway
I giudizi di fiducia sono informativi ma sistematicamente sovrastimati, e la sovrastima danneggia l'apprendimento (Dunlosky & Rawson 2012). Gli errori commessi con alta fiducia vengono corretti **meglio** dopo il feedback (ipercorrezione; Butterfield & Metcalfe 2001), ma tendono a riaffiorare a distanza di tempo. In FSRS un errore sicuro e uno insicuro sono identici (entrambi Again). I dati dello slider hanno quindi due usi distinti: (1) misurare e mostrare la **calibrazione** dello studente, (2) programmare un **retest ravvicinato** degli errori sicuri, senza alterare la matematica FSRS.

### Cited Findings
- Butterfield & Metcalfe (2001): "In contrast to the authors' expectations, highly confident errors were the most likely to be corrected in a subsequent retest"; quando al retest erano generate sia la risposta corretta sia quella errata originale, i partecipanti sceglievano quasi sempre quella corretta — [JEP:LMC 27(6):1491-1494, doi:10.1037/0278-7393.27.6.1491](https://doi.org/10.1037/0278-7393.27.6.1491) ([PubMed 11713883](https://pubmed.ncbi.nlm.nih.gov/11713883/)).
- Butler, Fazio & Marsh (2011): titolo "The hypercorrection effect persists over a week, but high-confidence errors return" — [Psychonomic Bulletin & Review 18:1238-1244, doi:10.3758/s13423-011-0173-y](https://doi.org/10.3758/s13423-011-0173-y). (Via Crossref ho verificato solo l'abstract congressuale omonimo, [doi:10.1037/e520592012-406](https://doi.org/10.1037/e520592012-406). Rivista e pagine vengono dalla mia conoscenza e vanno ricontrollate.)
- Metcalfe & Finn (2011), "People's hypercorrection of high-confidence errors: Did they know it all along?" — [JEP:LMC, doi:10.1037/a0021962](https://doi.org/10.1037/a0021962). Rassegna: Metcalfe (2017), "Learning from Errors" — [Annual Review of Psychology 68, doi:10.1146/annurev-psych-010416-044022](https://doi.org/10.1146/annurev-psych-010416-044022).
- Dunlosky & Rawson (2012), "Overconfidence produces underachievement: Inaccurate self evaluations undermine students' learning and retention" — [Learning and Instruction 22(4), doi:10.1016/j.learninstruc.2011.08.003](https://doi.org/10.1016/j.learninstruc.2011.08.003). (Il risultato, cioè che studenti sovrastimanti interrompono lo studio troppo presto e ricordano meno, viene dalla mia conoscenza del paper. L'abstract non è stato recuperato.)
- Rhodes & Tauber (2011), meta-analisi sull'effetto dei JOL ritardati (delayed-JOL effect) sull'accuratezza metacognitiva — [Psychological Bulletin 137(1), doi:10.1037/a0021705](https://doi.org/10.1037/a0021705). (Il risultato noto, cioè che i JOL dati dopo un ritardo sono molto più accurati di quelli immediati, viene dalla mia conoscenza; full text non letto.)
- Nel benchmark di FSRS, log loss e RMSE(bins) misurano la calibrazione e l'AUC la discriminazione: "AUC can be good (high) even if Log Loss and RMSE are poor" — [srs-benchmark README](https://github.com/open-spaced-repetition/srs-benchmark). Lo stesso schema (curva di calibrazione per bin, Brier score) vale per la fiducia dello studente.
- FSRS: "Easy, Good, and Hard all count as 'success'; Again counts as a memory 'lapse'. That's why you shouldn't use Hard as a failing grade" — [FSRS wiki, The Algorithm](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm). In FSRS-7 la difficoltà dipende da R solo su Again (termine L), "it only improves log loss very mildly" — stessa fonte.

### Inferences
- **Non** usare la fiducia per creare un "lapse più forte" dentro FSRS: FSRS ha un solo esito di fallimento e i parametri sono ottimizzati su voti 1-4. Introdurre un quinto segnale scalandolo a mano decalibrerebbe R. L'ipercorrezione suggerisce anzi che un errore sicuro corretto con feedback ha buone probabilità di essere sistemato a breve termine. Il rischio vero è il **ritorno** dell'errore dopo giorni (Butler et al.). Implicazione: errore sicuro -> Again (come oggi) + feedback esplicativo immediato (già c'è il messaggio "Eri sicuro al X%...") + **retest programmato a 1-3 giorni** e flag "misconcezione attiva" finché non c'è un successo ritardato. È questo il contenuto da mostrare nella lente P4.
- L'attuale `proposeGrade` (corretto e fiducia < 50 -> Hard) è coerente con FSRS, perché Hard resta un successo. Va però tenuto presente che la fiducia degli studenti è sovrastimata, quindi Good cadrà spesso su risposte "fortunate". La validazione possibile è a posteriori: confrontare la fiducia media per bin con la frequenza di successo al ripasso successivo.
- **Calibrazione come dato del grafo**: per ogni nodo o materia, scarto medio tra fiducia e correttezza (bias = fiducia media − accuratezza) e Brier score. Proposta di encoding: un anello o tratteggio sul nodo quando la fiducia supera sistematicamente la prestazione ("ti senti sicuro, ma..."). I JOL ritardati sono più accurati, quindi i dati di fiducia raccolti in ripassi ritardati (Ripasso FSRS) valgono più di quelli raccolti subito dopo la spiegazione in sessione.
- Il "confidence-weighted testing" (punteggi che premiano la calibrazione) è citato nella consegna: non ho trovato una fonte primaria in questo giro, vedi Gaps.

### Gaps
- Nessuna fonte primaria trovata su "confidence-weighted testing" e sull'addestramento della calibrazione metacognitiva con effetti misurati. Da cercare (es. lavori su certainty-based marking, Gardner-Medwin).
- Non ho trovato studi che integrino la fiducia auto-riportata in un modello tipo FSRS e ne misurino il guadagno predittivo. Il benchmark FSRS non usa la fiducia, perché Anki non la raccoglie.
- Non ho trovato una meta-analisi sull'ipercorrezione con dimensione d'effetto verificata.

---

## 5. Misconcezioni e feedback guidato dall'errore; propagare un fallimento alle premesse

### Takeaway
Ci sono prove che presentare e confrontare esempi errati e testi di confutazione aiuta, anche in matematica (decimali). La propagazione bayesiana del fallimento ai prerequisiti è ben fondata nei DBN/knowledge tracing. Per Sinapsi la soluzione proporzionata è un **segnale di sospetto** sulle premesse (diagnosi, retest mirato), senza modificare lo stato FSRS dei prerequisiti in base a errori altrui.

### Cited Findings
- Adams, McLaren, Durkin, Mayer et al. (2014): esempi errati in un tutor web per i decimali — [Computers in Human Behavior 36, doi:10.1016/j.chb.2014.03.053](https://doi.org/10.1016/j.chb.2014.03.053).
- Durkin & Rittle-Johnson (2012): efficacia del confronto tra esempi corretti e incorretti per la magnitudine dei decimali — [Learning and Instruction 22(3), doi:10.1016/j.learninstruc.2011.11.001](https://doi.org/10.1016/j.learninstruc.2011.11.001).
- Tippett (2010): rassegna di due decenni di ricerca sui testi di confutazione (refutation text) nelle scienze — [Int. J. of Science and Mathematics Education 8, doi:10.1007/s10763-010-9203-x](https://doi.org/10.1007/s10763-010-9203-x).
- Metcalfe (2017): rassegna su quando e perché commettere errori, seguiti da feedback correttivo, favorisce l'apprendimento — [Annual Review of Psychology, doi:10.1146/annurev-psych-010416-044022](https://doi.org/10.1146/annurev-psych-010416-044022).
- Käser et al.: le DBN sui grafi di skill superano il BKT a skill indipendenti nell'accuratezza predittiva e "yields meaningful instructional policies" — [IEEE TLT 2017, doi:10.1109/TLT.2017.2689017](https://doi.org/10.1109/TLT.2017.2689017).
- Nota: i risultati direzionali di Adams 2014, Durkin & Rittle-Johnson 2012 e Tippett 2010 riportati qui vengono dalla mia conoscenza dei paper. Gli abstract non sono stati scaricati in questa sessione: ho verificato titoli, sedi e DOI via Crossref.

### Inferences
- **Opzione A (consigliata)**: tenere FSRS per carta. Quando una conclusione fallisce (teorema o esercizio), calcolare un punteggio di sospetto sulle premesse a 1 hop: alto se la premessa ha R_esame bassa, una misconcezione attiva o una calibrazione scarsa; basso se è stata provata con successo di recente. Il sospetto si mostra nel grafo e genera una domanda diagnostica sulla premessa (che diventa vera evidenza FSRS). Pro: nessuna contaminazione della calibrazione FSRS, spiegabile, poco costoso. Contro: euristico, non apprende dai dati.
- **Opzione B**: DBN/BKT o GKT sul grafo. Pro: inferenza coerente sulle premesse, predizione migliore secondo Käser. Contro: richiede parametri (slip/guess, transizioni) per struttura, molti dati, complessità; si sovrappone a FSRS con due modelli di memoria in conflitto. Per un'app a utente singolo è sproporzionata.
- I `WeaknessLine` già esistenti (kind = misconception/gap/execution/discrimination, status active/resolved) sono il dato naturale per il filtro "misconcezioni attive" della lente P4. La regola di risoluzione dovrebbe richiedere un successo **ritardato** (non immediato), per via del ritorno degli errori sicuri.

### Gaps
- Non ho trovato evidenze specifiche sui testi di confutazione per la matematica universitaria (definizioni/teoremi): la letteratura citata riguarda soprattutto scienze e decimali.
- Non ho trovato confronti diretti tra "FSRS + euristica sui prerequisiti" e un modello KT sui grafi.

---

## 6. Encoding visivo: colorare solo per R è fuorviante? Mostrare incertezza e previsione

### Takeaway
Sì, R istantanea da sola è fuorviante in fase pre-esame: due nodi con R = 0.94 oggi possono arrivare all'esame con 0.75 o 0.96 (tabella sez. 1). La pratica consigliata nella visualizzazione dell'incertezza è rendere esplicita la grandezza rilevante per la decisione (qui R alla data dell'esame) e la sua incertezza, con codifiche di frequenza o intervalli invece di un singolo colore categorico.

### Cited Findings
- Kay, Kola, Hullman & Munson (2016), "When (ish) is My Bus?": studio sulla visualizzazione dell'incertezza delle previsioni per decisioni quotidiane (introducono i quantile dotplots) — [CHI 2016, doi:10.1145/2858036.2858558](https://doi.org/10.1145/2858036.2858558).
- Padilla, Kay & Hullman (2020), "Uncertainty Visualization" (capitolo/rassegna) — [PsyArXiv, doi:10.31234/osf.io/ebd6r](https://doi.org/10.31234/osf.io/ebd6r).
- Bodily & Verbert (2017), rassegna sui dashboard di learning analytics rivolti agli studenti e sui sistemi di raccomandazione educativi — [IEEE TLT, doi:10.1109/TLT.2017.2740172](https://doi.org/10.1109/TLT.2017.2740172).
- Incertezza nella stima di S: MAPE di circa 33% su una collezione reale — [Expertium](https://expertium.github.io/Algorithm.html). Nel benchmark FSRS-6, RMSE(bins) ≈ 0.065: l'errore tipico di calibrazione di R per bin è di alcuni punti percentuali — [srs-benchmark](https://github.com/open-spaced-repetition/srs-benchmark).
- Note: i contenuti specifici dei tre lavori di visualizzazione e dashboard (es. che i quantile dotplots migliorano le decisioni rispetto a intervalli o densità) vengono dalla mia conoscenza: ho verificato solo titoli, sedi e DOI.

### Inferences
- Lente "Tenuta all'esame": riempimento = R_esame proiettata (stesse soglie 0.85/0.6 per coerenza con il resto dell'app); bordo o anello = R ora, oppure freccia "da -> a" nel tooltip ("oggi 94% -> all'esame 75% se non lo ripassi"). Un marker separato (non il colore) per "misconcezione attiva" e "premessa sospetta".
- Incertezza: con pochi ripassi (reps basso) R è poco affidabile. Si può attenuare la saturazione del colore quando reps < 3 o mostrare "stima incerta", invece di un verde pieno. Questa è un'inferenza di design, non un risultato sperimentale specifico per i learner dashboard.
- Il dato più utile per lo studente non è il colore del singolo nodo ma un aggregato decisionale: "numero atteso di proposizioni che ricorderai all'esame = Σ R_esame" e "+X se fai i 15 ripassi suggeriti oggi" (dal greedy della sez. 2). È un formato di frequenza attesa, in linea con l'approccio di Kay et al.

### Gaps
- Non ho trovato studi controllati su come gli studenti interpretano colori basati su probabilità di richiamo nei sistemi SRS. Le raccomandazioni sono trasferite dalla letteratura generale sulla visualizzazione dell'incertezza.
- Non ho trovato evidenze sul fatto che mostrare R proiettata cambi davvero il comportamento di studio pre-esame.
