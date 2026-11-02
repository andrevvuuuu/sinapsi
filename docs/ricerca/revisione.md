# Revisione di Obsidian + Sinapsi alla luce delle deep research

2 novembre 2026. Fonti: tre rapporti Gemini Deep Research (A evidenze, B pratiche, C strumenti), il documento [il-mio-metodo.md](il-mio-metodo.md), il codice di Sinapsi e l'automazione Antigravity.
Vincoli: esami a febbraio, modifiche finite entro metà dicembre, note non scritte né lette a mano.

## 1. Quanto fidarsi dei rapporti

| Rapporto | Affidabilità | Perché |
|---|---|---|
| A, evidenze | Buona, con correzioni | Gli studi principali esistono, ma alcuni sono riportati male (sotto) |
| C, strumenti | Media | Math Academy e FSRS descritti bene; il resto è poco verificabile; dice che il tutor di Sinapsi è Gemini (è Claude); consiglia fine-tuning (DPO), impossibile con gli abbonamenti |
| B, pratiche | Bassa | Nessun video o thread citato, nonostante la richiesta. I numeri (−11% a 45 giorni, 30% di carte inutili, "6–8 volte più veloce", sovrastima del 30%) non hanno fonte: vanno trattati come inventati. Almeno un link GitHub è sbagliato (Smart Connections è di brianpetro). Utile solo come elenco di idee |

### Verifica delle affermazioni principali

| Affermazione | Esito |
|---|---|
| Bastani et al. 2024: GPT libero +48% in esercitazione, −17% all'esame; tutor con guardrail +127% senza danno | **Confermato.** Ma riguarda liceali turchi, non universitari |
| Kestin et al. 2025: tutor AI a Harvard, apprendimento circa doppio rispetto alla lezione attiva | **Confermato.** Un solo corso di fisica, circa 200 studenti |
| Banca Mondiale in Nigeria: +0,31 deviazioni standard in 6 settimane | **Confermato, ma era inglese, non matematica.** Il rapporto non lo dice |
| MIT "Your Brain on ChatGPT": 0% contro 83% e 89% di citazioni ricordate | **Distorto.** Era scrittura di saggi, 54 persone, preprint non revisionato. I numeri sono rimescolati: circa l'83% del gruppo LLM non riusciva a citare il proprio testo. Evidenza debole |
| Urry et al. 2021: la penna non batte la tastiera, conta la profondità di elaborazione | **Confermato** |
| Retrieval practice g = 0,56 "da Dunlosky 2013" | **Principio solidissimo**, ma il numero viene da altre meta-analisi (circa 0,5–0,6) |
| Worked examples e fading (Barbieri 2023, Renkl) | **Plausibile e coerente** con la letteratura nota |
| FSRS: 20–30% di ripassi in meno rispetto a SM-2 | **Confermato** dal benchmark open-spaced-repetition. Il "30–50%" del rapporto C è gonfiato |
| Domande riformulate meglio della stessa domanda | **Evidenza moderata.** La fonte citata è StudyFinds, un sito di notizie, e la letteratura è mista. Non "Forte" |
| BrokenMath 2025: GPT-5 "dimostra" teoremi falsi nel 29% dei casi | **Confermato.** Rilevante: un correttore AI può validare un ragionamento sbagliato ma convincente |
| MA-ProofBench 2026: 16% sulle dimostrazioni universitarie, quindi l'AI non sa correggere | **Non verificato, e il ragionamento non regge.** Misura la *scrittura di dimostrazioni formali in Lean*, non la *correzione* di dimostrazioni informali confrontate con una soluzione di riferimento. Il rischio di correzione è reale (vedi BrokenMath), ma non si deduce da qui |
| Math Academy: ripasso implicito frazionario (FIRe) sul grafo | **Descrizione corretta** (scritti di Justin Skycak). Nessuno studio indipendente. Il loro grafo è curato da esperti, quello di Sinapsi è estratto dall'AI |

### Dove i rapporti si contraddicono

C dice che le note "a sforzo zero" sono un vantaggio, perché tolgono carico inutile. A e B dicono che bloccano la codifica.
La soluzione la dà A stesso (Urry): le note complete vanno bene **come archivio**, purché siano seguite da un'attività generativa.
È il tuo caso: non leggi le note Obsidian, ci studi sopra in Sinapsi. Il rischio "illusione da lettura" si sposta sulla **nota viva**, che leggi dopo la sessione.

## 2. Cosa Sinapsi fa già bene (non toccare)

- **Prevedi prima della spiegazione**: è il "tentativo prima della risposta" di Bastani e Kestin.
- **Misura iniziale con ricerca binaria** su pavimento e soffitto: è la diagnosi della "knowledge frontier".
- **"Svuota la testa"** finale: richiamo libero.
- **FSRS-5 per concetto**, con domande in forme diverse e 10 tipi di esercizio.
- **Ripasso mescolato tra note diverse** (`interleave` in `memory/review.ts`).
- **Pratica**: scala di indizi, soluzione mostrata solo alla fine, simulazione d'esame senza indizi. Ogni problema aggiorna la memoria dei concetti esercitati (un ripasso implicito parziale).
- **Fiducia e calibrazione**, misconcezioni segnalate quando sbagli con sicurezza.
- **Correzione delle risposte di ripasso confrontata con una risposta di riferimento**: è la difesa migliore contro la compiacenza.
- **Nota viva**: segnala le imprecisioni invece di correggerle in silenzio; c'è già "Prova da solo".

Le ricerche, nel complesso, **confermano l'impostazione di Sinapsi**. Le modifiche servono a rifinire, non a rifare.

## 3. Modifiche consigliate, in ordine di priorità

Criterio: forza delle prove × rischio che risolvono × costo, entro metà dicembre.

### P1. Verificare la correttezza delle note prima che entrino in Sinapsi

- **Problema**: non leggi le note, e Sinapsi le prende come verità per sessioni, quiz e concetti. Un errore di Gemini si propaga ovunque. Oggi la fase "Verifica" di Antigravity controlla la struttura (DENTRO/FUORI), non la correttezza matematica.
- **Modifica**: dopo la scrittura, un secondo modello (Claude) rilegge definizioni, enunciati e dimostrazioni. Scrive l'esito nel frontmatter (`verifica: ok | segnalazioni`) e le segnalazioni in un callout. Sinapsi mostra lo stato della nota e avvisa prima di studiarne una con segnalazioni aperte.
- **Prove**: BrokenMath (compiacenza ed errori dei modelli); errori dell'AI imparati come veri.
- **Costo**: medio, quasi tutto in Antigravity (`run_job.sh`, `core-guidelines.md`), poco in Sinapsi.

### P2. Correzione più severa (ripasso, Pratica, foto del foglio)

- **Modifica**: nei prompt di correzione, la regola "un passaggio non giustificato è sbagliato, anche se la conclusione è giusta o il ragionamento suona bene". Indicare il **primo** passaggio non giustificato, e confrontare sempre con la soluzione di riferimento. Se il correttore non è sicuro, deve dirlo invece di promuovere.
- **Prove**: BrokenMath; per le risposte brevi, invece, il feedback automatico ha effetti positivi moderati (Fleckenstein 2023).
- **Costo**: basso (`memory/grade-prompt.ts`, `practice/prompt.ts`, `practice/exam.ts`).

### P3. Simulazione "a macchina spenta" con autovalutazione

- **Modifica**: nella simulazione d'esame, una modalità carta e penna. L'app dà il foglio e il tempo; alla fine **ti dai prima tu il voto** confrontandoti con la soluzione modello, poi arriva la correzione AI. La differenza tra le due è un dato di calibrazione.
- **Prove**: sovrastima indotta dai tutor; calibrazione; recupero senza aiuti. Una a settimana da dicembre.
- **Costo**: basso-medio (esiste già quasi tutto in `practice/exam.ts`).

### P4. Fading: meno aiuto man mano che un concetto si consolida

- **Modifica**:
  - Il tutor riceve lo stato di memoria dei concetti della nota. Oggi `session/runner.ts` non lo passa: la misura iniziale riparte da zero.
  - Nella nota viva, le dimostrazioni si nascondono "a ritroso" in base alla memoria: prima l'ultimo passo, poi gli ultimi due, fino all'intera dimostrazione. "Prova da solo" diventa automatico per i concetti già visti.
- **Prove**: worked examples ed expertise reversal (forte); backward fading (Renkl).
- **Costo**: medio.

### P5. Un solo sistema di ripasso per la matematica

- **Modifica**: per l'università, il ripasso lo fa solo Sinapsi; Anki resta per le materie personali, se ti serve. In alternativa si spegne `anki_sync.py` per le note `#università`.
- **Prove**: domande variate per concetto, meglio delle stesse carte (moderata); i rapporti A e B segnalano il carico e l'interferenza delle flashcard generate in massa.
- **Costo**: nessuna riga di codice, è una decisione tua.

### P6. "Spiegalo tu" come tipo di ripasso

- **Modifica**: un nuovo tipo di esercizio. Spieghi un concetto o ricostruisci una dimostrazione a libro chiuso, a voce (la trascrizione `mlx_whisper` c'è già) o scritto; Claude fa lo studente pignolo e corregge confrontando con la nota. Era già nel design ("spiegalo a voce"), ma non è implementato.
- **Prove**: auto-spiegazione (forte), effetto protégé (moderato).
- **Costo**: medio.

### Dopo febbraio

- **Ripasso implicito sul grafo (FIRe)**: quando ripassi bene una conclusione, credito frazionario alle premesse. Vale di più quando il grafo è grande, ma gli archi sono estratti dall'AI: prima conviene che P1 renda il grafo affidabile.
- **Ritenzione desiderata regolabile** (per esempio 90%, 95% prima di un esame): piccolo, ma serve solo se il carico diventa troppo.

## 4. Idee scartate

| Idea | Perché no |
|---|---|
| Verifica con Lean 4 | Sproporzionata al primo anno; tradurre la tua dimostrazione in Lean lo farebbe comunque un LLM, con altri errori |
| Fine-tuning o DPO del tutor, validatore multi-agente anti-"collasso socratico" | Impossibile con gli abbonamenti; il tutor è già vincolato dal protocollo JSON, e l'unico utente sei tu |
| Note Obsidian con buchi o cloze da riempire | Va contro il tuo vincolo; lo stesso effetto lo dà P4 dentro Sinapsi |
| Area di revisione obbligatoria per ogni contenuto generato | Stesso motivo: richiede di leggere tutto. P1 la sostituisce con un controllo automatico |
| Contatore di "debito cognitivo" che blocca le simulazioni | Paternalista, nessuna prova |
| "Test di compiacenza" (l'AI ti propone apposta una risposta sbagliata) | Curioso ma secondario; forse dopo febbraio |
| Panoramiche audio stile NotebookLM | Ascolto passivo |

## 5. Da chiarire

- Hai **compiti d'esame degli anni passati** dei tuoi corsi? Se sì, caricarli nel Notebook e usarli per la Pratica è probabilmente la cosa più utile in assoluto prima di febbraio.
