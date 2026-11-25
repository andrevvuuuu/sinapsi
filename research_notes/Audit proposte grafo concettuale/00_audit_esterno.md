## **Analisi critica del modello attuale**

**1\. Illusione del richiamo attivo e passività diagnostica** L'architettura di Sinapsi compie una scelta eccellente a monte — modellare proposizioni vere (Concept) e catene di implicazione (Chain) invece di semplici file e wikilink — ma si ferma a metà strada nell'interfaccia utente (GraphView.tsx). L'azione **Cosa serve per capirlo (n)** si limita a illuminare sul canvas l'albero degli antenati (ancestors(g, id)), delegando allo studente il compito di ispezionare visivamente i nodi a ritroso e lanciare i ripassi uno alla volta. Allo stesso modo, la modalità "mappa muta" (§2.4) si affida interamente alla soglia di zoom (1,15× su tProp in draw.ts) e all'autodisciplina dell'utente nel parlare a voce alta prima di cliccare. Inoltre, FSRS traccia solo i singoli conceptId (memory/fsrs.ts), lasciando le giunzioni logiche prive di una verifica attiva sulla tenuta delle dimostrazioni.  
**2\. Rumore visivo e cecità strutturale su vault grandi** Nelle viste attuali (Home.tsx e MapView.tsx), il grafo carica simultaneamente tutte le note con nota viva pronta (livePaths), senza un filtro di isolamento per materia (subject), MOC o singolo cono deduttivo. Le quattro lenti del dock (GraphNotchDock.tsx) riducono i nodi non pertinenti al 12% di opacità ma mantengono l'intera geometria sullo schermo: al crescere del vault (fino a 20.000 voci in positions.json), il layout radiale o a piani rischia di diventare un groviglio illeggibile. Parallelamente, l'assenza di un filtro per i **nodi orfani** (depth \= 0 privi di voci "Porta a") costringe a cercarli a occhio sul primo anello radiale.  
**3\. Scollegamento dal ciclo reale di studio (comprensione → FSRS → pre-esame)** Il passaggio forzato per liveOnly() nasconde le note non ancora estratte e la **frontiera** dei MOC già calcolate da buildModel (model.ts), privando lo studente della visione di quanto manca per completare il programma d'esame. Durante la comprensione, manca un ponte rapido tra il grafo e l'AI Tutor sul singolo nodo: per chiarire un passaggio critico a 1-2 hop bisogna copiare a mano i nomi dei concetti, oppure avviare un'intera sessione sulla nota (minimalTree()). Infine, in fase pre-esame, la codifica cromatica si basa solo sulla Retrievability istantanea (R) e sulla scadenza (due), ignorando la Stabilità (S): un nodo ripassato ieri appare verde (R \\ge 0,85) anche se ha S \= 2 giorni e crollerà prima della data dell'appello.

## **Proposte di miglioramento**

### **1\. Ripasso a cascata dell'albero dei prerequisiti**

> * **Proposta:** Sostituire l'evidenziazione passiva degli antenati in GraphView.tsx con una coda di ripasso FSRS generata da ancestors(g, id), filtrata per R \< 0,85 e ordinata per depth crescente.  
> * **Spiegazione in parole povere:** Mentre ripassi, invece di cercare a occhio quale base ti manca sotto un teorema rosso, clicchi un tasto e l'app ti interroga in ordine dalle basi fino al teorema finale.  
> * **Cosa cambia dal modello attuale:** **Prima:** "Cosa serve per capirlo" illumina solo gli antenati sul canvas. **Dopo:** Avvia in automatico una coda review.ts dai prerequisiti deboli (depth 0\) fino al teorema scelto.

### **2\. Quiz di occlusione sulle giunzioni logiche e mappa muta attiva**

> * **Proposta:** Rendere cliccabili le giunzioni (Chain in model.ts) per lanciare micro-quiz che occultano una premessa o la conclusione, registrando l'esito sulle carte FSRS coinvolte.  
> * **Spiegazione in parole povere:** Mentre ripassi sul grafo, invece di ripetere a voce sperando di non imbrogliare, clicchi l'incrocio tra due frecce e indovini quale ipotesi manca per dimostrare il teorema.  
> * **Cosa cambia dal modello attuale:** **Prima:** La mappa muta dipende dallo zoom a 1,15× in draw.ts e le giunzioni sono solo grafiche. **Dopo:** Le catene diventano esercizi interattivi che testano i nessi causali.

### **3\. Passaggio diretto del vicinato a 1-2 hop all'AI Tutor**

> * **Proposta:** Aggiungere nella Card di GraphView.tsx l'azione "Chiedi al Tutor", che serializza enunciato, premesse (2 hop), conclusioni e metriche FSRS del nodo verso una micro-sessione AI.  
> * **Spiegazione in parole povere:** Se non capisci il legame tra due teoremi, invece di copiare a mano i nomi in chat, clicchi il nodo e il tutor ti risponde conoscendo già premesse, conseguenze e tuoi errori.  
> * **Cosa cambia dal modello attuale:** **Prima:** L'utente esplora i vicini a mano e scrive il prompt, o avvia l'intera nota. **Dopo:** Un click invia a runner.ts il sottografo locale (1-2 hop) e il suo stato FSRS.

### **4\. Lente pre-esame basata su Stabilità FSRS (S) e misconcezioni**

> * **Proposta:** Integrare in draw.ts e GraphNotchDock.tsx una lente "Tenuta all'esame" che evidenzia i nodi con Stabilità S inferiore ai giorni mancanti all'appello o con misconcezioni attive.  
> * **Spiegazione in parole povere:** A dieci giorni dall'esame, invece di vedere verdi anche i concetti studiati ieri che dimenticherai tra tre giorni, accendi i nodi che non reggeranno fino alla data dell'appello.  
> * **Cosa cambia dal modello attuale:** **Prima:** I colori in draw.ts usano solo la tenuta istantanea R e la scadenza due. **Dopo:** Il grafo proietta la tenuta futura tramite la Stabilità S e i dati di memory-brief.ts.

### **5\. Filtri per materia, lente Nodi Orfani e sblocco della Frontiera**

> * **Proposta:** Aggiungere in Home.tsx e MapView.tsx un toggle per mostrare la frontiera di buildModel, un filtro di isolamento per subject e una lente per i nodi orfani (depth 0 senza uscite).  
> * **Spiegazione in parole povere:** Mentre prepari un esame, isoli sullo schermo solo la materia che studi, vedi i capitoli del programma non ancora scritti e scovi subito le definizioni rimaste scollegate.  
> * **Cosa cambia dal modello attuale:** **Prima:** liveOnly() nasconde la frontiera, mostra tutto il vault insieme e ignora gli orfani. **Dopo:** Isoli singole materie, vedi i gap nei MOC e filtri i concetti isolati.

### **6\. Deduplicazione inter-materia e riallineamento della regola MOC**

> * **Proposta:** Estendere pickCandidates() in extract.ts a tutto il vault tramite similarità lessicale/LaTeX oltre il filtro subject, e unificare il parsing MOC tra linked.ts e shared/moc.ts.  
> * **Spiegazione in parole povere:** Quando ritrovi un teorema di Algebra Lineare negli appunti di un altro corso, l'app capisce da sola che è lo stesso concetto anche se non hai inserito il wikilink a mano.  
> * **Cosa cambia dal modello attuale:** **Prima:** pickCandidates filtra per wikilink/materia e linked.ts legge solo type: MOC. **Dopo:** I concetti trasversali si fondono tra corsi diversi e la logica MOC è coerente.