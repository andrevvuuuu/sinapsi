# Voce ovunque, liquid glass e rifinitura stile Apple — documento di progetto

Data: 5 novembre 2026. Stato: bozza, in attesa di approvazione di Andrea. Le parti segnate *scelta di Claude* sono decisioni di Claude da verificare.

## 1. Perché

Sinapsi è completa e la sua struttura l'ha ideata Andrea. Ora deve **sembrare fatta da un grandissimo esperto di design, in stile Apple**: facile e piacevole da usare, e bellissima da vedere. In più Andrea vuole poter **parlare invece di scrivere**, ovunque.

Il precedente tentativo di redesign è stato annullato perché **cambiava la struttura**. Questo progetto non la tocca.

## 2. Obiettivi

1. **Dettare ovunque si possa scrivere**, compreso l'argomento da studiare nella Home («Cosa vuoi studiare?»).
2. **Leggibilità della sessione**: mentre si risponde a una domanda, il testo che l'ha preceduta deve restare leggibile (oggi il riquadro della domanda lo copre quasi tutto: vedi §5.2).
3. **Rifinitura stile Apple (HIG macOS)** di tutta l'app: dimensioni dei tasti, distanze tra tasti e scritte, tipografia, colori, contrasto, stati (hover, premuto, focus, disattivato), animazioni.
4. **Liquid glass** come materiale dello strato dei controlli.
5. **Composer della Home** più accessibile e più bello (§5.3).

## 3. Non obiettivi e anti-obiettivi

- **Anti-obiettivo principale: cambiare la struttura.** Le schermate, l'ordine e la posizione degli elementi, il flusso, i testi e i nomi restano come sono. Niente spostato, aggiunto o tolto (unica aggiunta: il tasto microfono). Se il lavoro diventa irriconoscibile rispetto all'app attuale, è fallito anche se funziona.
- **Dove inizia "cambiare la struttura"** (chiarito da Andrea il 5/11): cambiare dimensioni dei tasti, distanze tra tasti e scritte, grandezze e pesi dei testi, colori e materiali è **richiesto**, anche se sposta le cose di qualche pixel. È vietato riordinare, spostare in un'altra zona, aggiungere o togliere elementi, o cambiare il flusso.
- Non si cambia l'identità: restano i due temi (Lavagna scuro, Trattato chiaro), le famiglie di caratteri (Instrument Serif, Geist, Geist Mono, Caveat) e il colore d'accento di ciascun tema. Si possono ritoccare i valori (grandezze, pesi, tinte, contrasti), non sostituirli.
- Niente vetro sotto il testo da leggere (vedi §5.4).
- Nessun servizio di trascrizione esterno o a pagamento.
- Nessuna modifica alla logica (tutor, FSRS, grafo, note vive) se non quella necessaria per la voce.

## 4. Vincoli

- App Electron solo Mac, React; finestra `titleBarStyle: 'hiddenInset'`. Stili in CSS per vista (`home.css`, `session.css`, `review.css`, `practice.css`, `nota.css`, `graph.css`, `notebook.css`, `games.css`) più `styles/tokens.css`.
- Si segue **solo lo stile macOS** (decisione di Andrea in una conversazione precedente).
- Controlli interattivi: 44×44 pt per i tasti principali e per quelli che oggi lo sono già (`--ctl: 44px`). Le barre dense già approvate con la revisione di layout (`--ctl-sm: 36px`, `--hit-min: 28px`: barra della nota viva, controlli del grafo) restano alla loro misura *(scelta di Claude: portarle a 44 le allargherebbe e le riordinerebbe)*.
- Richiesta precedente di Andrea ancora valida: **i suggerimenti della Home restano tutti su una riga, senza andare a capo**.
- Accessibilità: contrasto WCAG 2.2 AA (4,5:1 testo normale, 3:1 testo grande e bordi dei controlli), focus sempre visibile, tutto usabile da tastiera, `prefers-reduced-motion` già gestito, «Riduci trasparenza» di macOS da rispettare (§5.4).
- I test esistenti (`npm test`, `npm run test:e2e`) devono continuare a passare; dove cambiano solo classi o markup si aggiornano i test, non si tolgono.

## 5. Cosa si fa

### 5.1 Voce ovunque

**Già esiste**: nel ripasso «Spiegalo tu» (`review/exercises/Explain.tsx`) un tasto registra con `MediaRecorder` e la registrazione viene trascritta in locale con mlx_whisper (`main/memory/voice.ts` → `notebook/media.ts`, IPC `api.review.voice`). La registrazione viene cancellata dopo la trascrizione.

**Da fare**:
- Estrarre quel meccanismo in un componente/hook riusabile del renderer (tasto microfono + stati *pronto → registra → trascrive*) e in un canale IPC generico (non più legato al ripasso; quello del ripasso può riusarlo).
- Il microfono sta **dentro** il campo, come icona a destra, e non aggiunge altezza né sposta altri elementi; nei campi piccoli (ricerche) usa la misura compatta già prevista (`--ctl-sm`) *(scelta di Claude)*.
- Mettere il tasto in **ogni campo di testo libero** dell'app (vale la regola qui sotto; l'elenco è una guida e va corretto dove non la rispetta: per esempio la stima decimale in `Inputs.tsx` e l'ID del modello in `SettingsDialog.tsx` sono esclusi). Elenco attuale:
  - Home: `home/Composer.tsx` (argomento), `home/LeftPanel.tsx` (ricerca), `home/NotebookPanel.tsx` (nome notebook)
  - Sessione: `session/SessionView.tsx` (domanda al tutor), `session/QuestionDock.tsx` (tre campi: modifica al piano, pensieri, ragionamento), `session/games/Spot.tsx`, `session/games/Taboo.tsx`
  - Ripasso: `review/ReviewView.tsx`, `review/exercises/Choice.tsx`, `review/exercises/Inputs.tsx` (due campi), `review/exercises/Explain.tsx` (già lo ha: passa al componente comune)
  - Pratica: `practice/PracticeView.tsx` (due campi), `practice/PracticeSetup.tsx`, `practice/ExamView.tsx`, `practice/PaperExam.tsx` (due campi), `practice/MaterialDialog.tsx` (due campi), `practice/PhotoButton.tsx` (testo letto e campo)
  - Nota viva: `nota/blocks/Practice.tsx`
  - Notebook: `notebook/ChatPane.tsx`, `notebook/NotebookView.tsx` (campo testuale non-link), `notebook/SourceList.tsx` (ricerca nota)
  - Grafo: `graph/GraphView.tsx` (ricerca)
  - Impostazioni: `home/SettingsDialog.tsx` (campi di testo)
- **Esclusi** *(scelta di Claude)*: campi numerici (durata, quantità) e campi in cui si incolla un link (YouTube, NotebookLM), perché dettare un numero o un URL non serve.
- **Comportamento** *(scelta di Claude)*: il testo trascritto si **aggiunge** a quello già presente nel campo, al punto del cursore, e **non viene mai inviato da solo**: Andrea lo rilegge e invia. Durante la registrazione il tasto mostra il tempo trascorso; un secondo clic ferma. Durante la trascrizione il campo mostra «Trascrivo…» e il tasto invio resta disattivato (come in Explain oggi). Limite di durata: quello già usato in Explain.
- **Scorciatoia** *(scelta di Claude)*: una scorciatoia da tastiera avvia e ferma la dettatura nel campo che ha il focus (proposta: ⌥ + Spazio, oppure tenere premuto Fn se intercettabile; decide il builder purché non entri in conflitto con scorciatoie esistenti).
- **Errori**: microfono negato, mlx-whisper mancante o modello non scaricato → messaggio chiaro sotto il campo, con le stesse frasi già usate (`Manca … installalo con «pip install mlx-whisper»`). Il primo uso che scarica il modello mostra lo stato di download.
- **Rapidità** *(scelta di Claude)*: oggi ogni trascrizione avvia un nuovo processo `mlx_whisper` e ricarica il modello, quindi anche tre parole costano diversi secondi. Per la dettatura breve il modello resta caricato in un processo persistente (avviato al primo uso e chiuso dopo un periodo di inattività), oppure si usa un modello più piccolo per le clip brevi: decide il builder, l'obiettivo è che una frase breve appaia in circa 1–2 secondi. «Spiegalo tu» passa allo stesso meccanismo. Lingua: italiano. Lo stato di download del modello va collegato (oggi `onStage` è vuoto). Limite di durata: 10 minuti per le risposte lunghe (come oggi), 2 minuti per campi brevi come le ricerche.
- Accessibilità del tasto: `aria-label` («Detta» / «Ferma la dettatura»), `aria-pressed`, stato annunciato con una regione `aria-live`.

### 5.2 Leggibilità della sessione

**Problema** (screenshot di Andrea, fase Misura): il riquadro della domanda (`.dockwrap`, `position: sticky; bottom: 0`) cresce con quattro opzioni lunghe, cursore della fiducia e ragionamento, e copre quasi tutta l'altezza. Il messaggio del tutor che ha portato alla domanda finisce tagliato sotto la barra in alto e l'obiettivo resta troncato dietro al riquadro.

**Cosa si fa** *(scelta di Claude: la struttura resta, cambia solo come convivono i due spazi)*:
- La conversazione riceve sempre in fondo uno spazio pari all'altezza reale del riquadro (misurata con `ResizeObserver`), così l'ultimo messaggio si può sempre leggere per intero sopra il riquadro.
- Il riquadro ha un'altezza massima (indicativamente il 55–60% della finestra); oltre, scorrono **le opzioni al suo interno**, mentre la domanda in cima e la riga «Invia risposta» restano sempre visibili.
- Quando arriva una domanda nuova, la conversazione scorre in modo che **l'inizio** del messaggio del tutor sia visibile, non solo la fine.
- Il passaggio sfumato tra conversazione e riquadro non deve coprire testo leggibile.
- Stesso principio, dove serve, nei riquadri analoghi di Ripasso e Pratica.

### 5.3 Composer della Home (screenshot di Andrea)

Stessa disposizione: selettore Apprendimento/Pratica/Ripasso sopra, suggerimenti in alto nel riquadro, campo e tasto invio sotto.
- **Suggerimenti**: restano su una riga. Oggi i titoli finiscono con «…» («Principio del Buon Ordin…»). *(Scelta di Claude)* Larghezza in base al contenuto dentro la riga, titolo su massimo due righe prima del troncamento, testo completo all'hover e al focus; contrasto della riga secondaria («sessione da finire») portato ad AA.
- **Tasto invio**: oggi quando è disattivato è un cerchio grigio poco leggibile. Deve avere uno stato attivo e uno disattivato chiari, entrambi a contrasto sufficiente; quando è attivo diventa il punto d'attenzione.
- **Microfono** accanto al tasto invio (§5.1).
- Il placeholder deve rispettare il contrasto AA.
- Il selettore delle modalità e il riquadro diventano vetro (§5.4); distanze e raggi coerenti (raggi concentrici: raggio esterno = raggio interno + spessore del bordo).

### 5.4 Liquid glass

*(Scelta di Claude, coerente con le HIG Apple: il vetro è per lo strato di navigazione e dei controlli che galleggia sopra i contenuti, non per i contenuti.)*

**Dove va**: barre in alto delle viste, tasto «← Home», selettore delle modalità, riquadro del composer della Home, riquadro di risposta della sessione (il suo guscio esterno, `.shell`), barre degli strumenti e controlli fluttuanti del grafo e della nota viva, menu e popover, dialoghi (guscio esterno).
**Selettori a segmenti** (richiesta di Andrea, 5/11): anche tutti i selettori a segmenti (Apprendimento/Pratica/Ripasso, Tutte/Apprendimento/Pratica/Ripasso nel pannello sinistro, Evidenzia nel grafo, i selettori delle impostazioni, del ripasso e della pratica) sono in Liquid Glass: la traccia è vetro e l'opzione scelta è una «lente» di vetro che scivola fino all'opzione cliccata, come nei controlli Apple. Dove la traccia è già vetro, la lente è una variante luminosa senza un secondo `backdrop-filter`. Con `prefers-reduced-motion` la lente cambia posto senza scivolare. *(Scelta di Claude, coerente con Apple:)* anche il pallino dei cursori (per esempio Fiducia) diventa una piccola lente di vetro.

**Dove non va**: testo delle domande, opzioni di risposta, note, messaggi del tutor, schede del ripasso. Queste superfici restano piene (l'interno `.inner`/`.core` resta solido), perché il vetro sotto il testo ne riduce la leggibilità.

**Fedeltà** (decisione di Andrea, 5/11): deve essere **il classico Liquid Glass di Apple**, fatto bene anche dove oggi, su sfondo uniforme, si nota poco: si vedrà di più quando l'app sarà più piena. Non si aggiungono sfondi o decorazioni solo per far risaltare il vetro.
*(Scelta di Claude, coerente con il comportamento Apple:)* nelle viste che scorrono (conversazione della sessione, nota viva, liste, ripasso, pratica) il contenuto scorre **sotto** la barra in alto e sotto il riquadro di risposta, con la dissolvenza al bordo tipica di macOS (scroll edge effect). Nessun elemento cambia posto; a riposo, all'inizio e alla fine dello scorrimento, il contenuto non è coperto (vale il §5.2).

**Com'è fatto il materiale** (da definire una volta in `tokens.css` come token e classe riusabile, con varianti per i due temi):
- traslucenza con sfocatura e saturazione dello sfondo (`backdrop-filter`);
- leggera rifrazione ai bordi dove Chromium lo permette (filtro SVG di spostamento usato come `backdrop-filter`), con ricaduta sulla sola sfocatura se non disponibile;
- bordo luminoso sottile e riflesso speculare in alto, ombra morbida sotto, tinta che si adatta al tema;
- testo e icone sopra il vetro sempre a contrasto AA, verificato su sfondi chiari e scuri reali dell'app (il grafo è lo sfondo più difficile).
- **Riduci trasparenza**: se macOS lo ha attivo (Electron `nativeTheme.prefersReducedTransparency`, passato al renderer), il vetro diventa una superficie piena. Con `prefers-reduced-motion` niente animazioni del materiale.
- Prestazioni: niente vetro annidato nel vetro; scorrimento e grafo devono restare fluidi.

### 5.5 Rifinitura stile Apple di tutta l'app

Su tutte le viste (Home, sessione, ripasso, pratica ed esame, nota viva, grafo, notebook, impostazioni), senza spostare nulla:
- **Scala tipografica** unica (pochi gradini, interlinea e pesi coerenti); niente testo sotto 12 px salvo etichette in maiuscoletto mono, che vanno portate ad almeno 11 px con contrasto AA.
- **Scala delle distanze** unica (multipli di 4) tra tasti, tra tasto e scritta, tra gruppi; allineamenti regolari.
- **Controlli**: 44 pt minimi, raggi coerenti e concentrici, gerarchia chiara tra tasto principale, secondario e testuale; stati hover, premuto, focus e disattivato definiti per ognuno. I tasti disattivati devono restare leggibili.
- **Colori e contrasto**: i grigi `--muted` e i bordi `--hair` portati ad AA dove servono (oggi alcuni testi secondari e il placeholder sono sotto soglia).
- **Animazioni**: brevi e con la curva già in uso (`--ease-out`), solo dove aiutano a capire un cambiamento.
- Chi esegue usa insieme le skill di design disponibili (apple-design, impeccable, ui-ux-pro-max, frontend-design, design-system-patterns, accessibility-compliance, web-design-guidelines) e verifica il risultato con screenshot reali dell'app (agent-browser o Playwright), in entrambi i temi.

## 6. Come si verifica

- Screenshot prima/dopo di ogni vista in entrambi i temi: la disposizione deve essere la stessa.
- Lo scenario dello screenshot di Andrea (fase Misura con quattro opzioni lunghe) mostra il messaggio del tutor leggibile per intero.
- Dettatura provata in almeno un campo per vista; caso «microfono negato» e «mlx-whisper mancante».
- Controllo del contrasto (AA) su testi, placeholder, tasti disattivati e testo sopra il vetro.
- Con «Riduci trasparenza» attivo il vetro diventa pieno.
- `npm run typecheck`, `npm test`, `npm run test:e2e` passano.

## 7. Lasciato a chi costruisce

Valori esatti di scala tipografica, distanze, raggi, tinte e sfocature; implementazione del filtro di rifrazione; nome e forma del componente microfono; scelta finale della scorciatoia; ordine di lavoro tra le viste.
