# Il mio metodo di studio (bozza)

Bozza scritta da Claude il 2 novembre 2026 leggendo l'automazione Obsidian e Sinapsi. Serve come base per la revisione dopo le deep research.
Correggi tutto ciò che è sbagliato. I punti segnati **[DA CONFERMARE]** sono ipotesi mie.

## Chi sono e cosa studio

- Primo anno di Scienze matematiche per l'IA. Ora sto facendo Analisi 1 (numeri, completezza, induzione, combinatoria) e Algebra lineare. Le 56 note di Matematica sono quasi tutto il vault.
- Studio anche per interesse personale: bodybuilding, nutrizione, farmacologia, arte e altro. Lì non c'è un esame: voglio capire e ricordare.
- I primi esami sono a febbraio 2027, cioè tra circa 3 mesi. Le modifiche al sistema devono essere finite in tempo per usarlo davvero prima degli esami.
- Il mio problema storico: rileggevo o ricopiavo e dopo l'esame dimenticavo tutto.
- Non mi va di scrivere le note a mano. Se servisse, terrei un vault separato per le note scritte da me.

## Il flusso, dalla fonte all'esame

### 1. Raccolta delle fonti

Le fonti sono lezioni (PDF, slide, registrazioni), libri, video YouTube, siti e notebook di NotebookLM.
Le scelgo dal menu Antigravity in Obsidian: NotebookLM, YouTube, sito o file locali.

### 2. Generazione delle note (Obsidian + Antigravity/Gemini)

- Scelgo materia e azione: nuova nota, MOC (mappa) o migliora una nota esistente. Posso anche creare in batch tutte le note mancanti di un MOC.
- Gemini scrive la nota seguendo `core-guidelines.md` e le regole della materia. Le note sono:
  - complete ed esaustive, senza limite di lunghezza;
  - scritte "a sforzo cognitivo zero": frasi brevi e lessico tecnico spiegato subito;
  - con tutti i passaggi esplicitati, compresa ogni riga di calcolo con il suo perché;
  - con il callout "Decodifica Logico-Formale" su ogni definizione o teorema e le dimostrazioni in 3 atti;
  - divise per tipo: una nota per concetto, teorema o metodo, collegate con wikilink e raccolte nei MOC;
  - con un pannello di flashcard e quiz in fondo (`study_panel.js`).
- Le flashcard vanno anche in Anki (`anki_sync.py`), che uso ancora. Quindi ho due sistemi di ripasso a intervalli: Anki (sulle flashcard delle note) e il Ripasso di Sinapsi (sui concetti).
- Le note Obsidian non le leggo e non le controllo: le uso solo come base per Sinapsi. Le eventuali imprecisioni le vedo solo se Sinapsi le segnala nella nota viva.

### 3. Studio attivo (Sinapsi)

Sinapsi legge il vault ma non lo modifica mai. Per ogni nota posso:

- fare una **sessione di Apprendimento** con il tutor (Claude): obiettivo, misura di cosa so, piano, ciclo prevedi → spiega → verifica, giochi e "svuota la testa" finale;
- generare la **nota viva**: la nota Obsidian rifatta da Gemini con figure interattive, quiz accanto ai paragrafi e "Prova da solo";
- fare il **Ripasso** FSRS per concetto, con domande riformulate ogni volta, fiducia, voto proposto e segnalazione delle misconcezioni;
- fare **Pratica**: allenamento o simulazione d'esame, anche con foto del foglio corretta da Claude;
- usare il **Notebook**: fonti grezze e chat sulle fonti;
- guardare il **grafo** dei concetti con i colori della memoria.

Le uso tutte. Per una nota nuova l'ordine è: sessione → nota viva → Pratica → Ripasso.

## Cosa voglio ottenere

- Capire davvero, cioè ricostruire una dimostrazione e applicare un concetto a un caso nuovo, non solo riconoscerlo.
- Ricordare a lungo, non fino al giorno dopo l'esame.
- Faticare il giusto: lo sforzo deve stare dove serve per imparare, non nella scrittura delle note o nella gestione del sistema.

## Vincoli

- Le note non le scrivo io (al massimo in un vault separato).
- Uso gli abbonamenti di Gemini (Antigravity, `agy`) e di Claude (Claude Code, `claude`), niente chiavi API. La quota è limitata.
- Lavoro su un solo Mac.

## Dubbi aperti da verificare con la ricerca

1. Studiare da note complete generate dall'AI mi dà l'illusione di aver capito? Cosa compensa senza dover scrivere le note?
2. Le note possono contenere errori dell'AI e io non le leggo: come me ne accorgo prima di impararli?
3. Anki e il Ripasso di Sinapsi insieme: è un doppio carico? Conviene tenerne uno solo?
4. Il mio sistema ha troppe funzioni? Quali contano davvero e quali posso togliere?
5. Come misuro se il metodo funziona prima di febbraio?
