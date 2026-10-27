# Sinapsi

App per Mac per studiare in modo attivo: sessioni guidate, note vive, grafo della conoscenza e ripasso a intervalli. Il progetto completo è in `docs/design.md`.

## Aprire l'app

1. Apri `dist/mac-arm64/Sinapsi.app`, oppure installa `dist/Sinapsi-0.1.0.dmg` trascinando Sinapsi in Applicazioni.
2. La prima volta macOS la blocca perché non è firmata: **clic destro sull'app → Apri → Apri**. Dalla volta dopo si apre normalmente.

## Collegare l'AI (senza chiavi API)

Sinapsi usa i tuoi abbonamenti tramite due comandi già installati:

- **Gemini** tramite Antigravity: comando `agy`
- **Claude** tramite Claude Code: comando `claude`

Se in alto nell'app compare "serve l'accesso", apri il Terminale, scrivi `agy` (o `claude`), completa l'accesso nel browser e riapri l'app.

## Obsidian

Sinapsi **legge** il vault `~/Obsidian Vault` e **non lo modifica mai**. Per cambiare cartella: ingranaggio in basso a sinistra → Cambia cartella.

## Note vive

Clic su una nota nell'elenco a sinistra → **Crea la nota viva**; oppure, alla fine di una sessione di Apprendimento, **Crea la nota viva** nella scheda finale. Gemini legge la tua nota Obsidian (e la sessione, se c'è) e in 3–4 minuti scrive una pagina da cui studiare:

- figure da toccare: cursori, punti da trascinare, elementi che **diventano verdi** quando la condizione è vera, tasto **Mostra i punti**;
- dimostrazioni passo per passo, con la figura che segue lo scorrimento;
- quiz e flashcard accanto ai paragrafi, esercizi svolti, da completare e da fare da solo;
- **Prova da solo** (in alto) copre le soluzioni finché non hai scritto la tua;
- strati **Sessione**, **Quiz** e **Fonti** da accendere e spegnere;
- le imprecisioni della tua nota sono **segnalate, non corrette**: "Copia la correzione per Obsidian" la mette negli appunti.

Le note vive restano nell'elenco **Note vive** a sinistra.

## Grafo

Al centro della home c'è il **grafo unito**: le tue note Obsidian e i **concetti** che Gemini ne estrae, collegati dalle **catene di ragionamento** (premesse ⇒ conclusione), come in Learn Harness.

- I concetti vengono estratti **quando apri o studi una nota**, e in background **quando il Mac è inattivo** (al massimo 6 note al giorno, dalle materie che stai studiando). Una nota non cambiata non viene estratta di nuovo.
- Ogni nota estratta è una **regione colorata**; un concetto presente in più note è **un nodo solo** (cerchio tratteggiato).
- **Radiale**: le basi al centro, ciò che ne deriva verso l'esterno. **A piani**: le basi in basso. **Libera**: come in Obsidian.
- Cerca un concetto o una nota; nella scheda: "Segue da", "Porta a", **Cosa serve per capirlo** (tutto ciò su cui poggia), "Studia questa nota".
- I puntini sul bordo sono la **frontiera**: note citate nei tuoi MOC ma non ancora scritte.

## Ripasso

Nel riquadro in basso scegli **Ripasso** e premi invio (vuoto = quello che sta sbiadendo; oppure scrivi un argomento, es. "Lagrange"). Dal grafo: **Ripassa** su un concetto o **Ripassa questa nota**.

- Ogni concetto del grafo ha una **memoria** (FSRS): la percentuale è la probabilità che te lo ricordi oggi.
- Le domande cambiano ogni volta: Gemini prepara **4–5 varianti** per concetto (la prima volta servono un paio di minuti) di 10 tipi: risposta aperta, scelta multipla, vero/falso e perché, riordina i passi, completa, abbina, controesempio, stima, trova l'errore, sul grafico. Nella prima schermata scegli quali usare.
- Dai la tua **fiducia**; le risposte aperte le corregge Claude. Il voto (Di nuovo / Difficile / Bene / Facile) è **proposto**, e puoi cambiarlo: decide quando rivedrai il concetto.
- Sbagliato **con sicurezza** = possibile **misconcezione**: il riepilogo ti propone di ristudiare il concetto con il tutor.
- Nel grafo i concetti sono colorati per memoria (verde la sai, giallo incerto, rosso debole, vuoto mai visto); le lenti **Da ripassare**, **Mai visti** e **Basi fragili** li evidenziano.

## Notebook

Nel pannello a destra della home: **Nuovo notebook**, poi dentro il notebook aggiungi le fonti con **File…** (PDF, PowerPoint .pptx, testo e Markdown, audio e video), **YouTube** (incolla il link) o **Nota del vault**. Puoi anche trascinare i file sulla colonna delle fonti.

- Le fonti si leggono una alla volta: i PDF per pagina, le slide per numero, le registrazioni e i video con **trascrizione locale** (mlx_whisper, sul Mac, senza quota; la prima volta scarica il modello, circa 1,6 GB). Per YouTube usa i sottotitoli se ci sono, altrimenti scarica l'audio e lo trascrive (yt-dlp).
- La chat risponde **solo dalle fonti selezionate** (le caselle a sinistra): ogni frase cita la fonte con un numero; cliccalo e vedi il passo evidenziato (per i video, il pulsante apre YouTube in quel minuto). Le frasi senza fonte vengono tolte e te lo dice; quello che le fonti non dicono compare in "Le fonti non dicono".
- **Materia**: collega il notebook a una materia del vault; le note vive di quella materia useranno anche gli estratti delle sue fonti.
- **Collega NotebookLM**: incolla il link del notebook con lo stesso argomento su NotebookLM; poi il pulsante lo apre.
- Le pagine scansionate (senza testo) non si possono leggere: il notebook te lo segnala.

## Pratica

Nel riquadro in basso della home scegli **Pratica** (vuoto: i suggeriti per oggi; oppure scrivi un argomento o incolla un esercizio d'esame).

- **Materiale**: i due concetti più urgenti sono già scelti; i suggeriti hanno accanto il motivo (da ripassare, memoria bassa, mai praticato). **Scegli…** apre tutto il grafo (materia → nota → concetti, con la memoria) e le **fonti dei notebook** (temi d'esame, eserciziari: il tutor li usa così come sono o ne crea di simili).
- **Allenamento** (Claude, metodo Learn Harness): problemi che non annunciano il teorema da usare; **Dammi un indizio** sale di un gradino alla volta (R0 → R5); scrivi il ragionamento o manda la **foto del foglio**; quando concludi vedi verdetto e soluzione di riferimento, poi fai domande o passi al **Prossimo problema**. A destra l'arco: riscaldamento, corpo mescolato, ritest finale di tutto ciò che hai sbagliato.
- **Simulazione d'esame**: durata 30/60/90 minuti o a scelta (5–300); compito da 30 punti, niente aiuti né correzioni durante; le risposte si salvano da sole e allo scadere si consegna da solo; poi voto in trentesimi, commento per esercizio, soluzioni e **Ritesta gli errori in allenamento**.
- **Foto del foglio**: l'iPhone compare tra le fotocamere (Continuity Camera), oppure scegli un'immagine. Claude trascrive il foglio in testo e LaTeX; controlli e correggi prima di mandarlo.
- Ogni problema concluso e ogni esercizio corretto aggiornano la **memoria** dei concetti (e quindi il grafo e il Ripasso).

## Giochi nell'Apprendimento

Ogni tanto, al posto di una normale verifica, il tutor propone un gioco breve su quello che ti ha appena spiegato (si possono spegnere in Impostazioni → Apprendimento):

- **Lampo**: vero o falso contro il tempo (8 secondi a frase), con la serie;
- **Coppie**: abbina ogni teorema, simbolo o ipotesi a ciò che gli corrisponde;
- **Ricomponi**: rimetti in ordine i passi di una dimostrazione;
- **Trova l'intruso**: una riga della derivazione è sbagliata, trovala e di' perché;
- **Tabù**: spiega un concetto senza usare le parole proibite (il tutor giudica la spiegazione).

Il risultato arriva al tutor come una risposta. In alto vedi i punti e la serie; nel riepilogo finale anche la serie migliore e la **calibrazione** (quanto la tua fiducia corrisponde a quello che sai davvero). "Salta il gioco" è sempre disponibile.

## Per lo sviluppo

```bash
npm install
npm run dev          # app in modalità sviluppo
npm test             # test unitari
npm run build && npm run test:e2e   # test end-to-end sull'app
LIVE_AI=1 npx vitest run --config vitest.live.config.ts   # prova vera di agy e claude (consuma quota)
npm run dist         # crea Sinapsi.app e il .dmg
```
