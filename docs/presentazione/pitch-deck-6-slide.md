# Sinapsi — Pitch Deck, Livello 1 (6 slide)

Direzione artistica, testi e animazioni per le 6 slide del regolamento.
Il testo che va **sulla slide** è in inglese, come lo speech. Le indicazioni di regia sono in italiano.

## Prima di tutto: quattro correzioni al brief

Il brief descrive un prodotto diverso da quello che c'è nel repository. Una giuria che fa una domanda tecnica se ne accorge, quindi il deck segue il codice.

| Nel brief | Nel repository | Nel deck |
| --- | --- | --- |
| Web app self-hosted, Next.js + Tailwind | App desktop per Mac: Electron, React 19, TypeScript. Tailwind non c'è | "Mac study companion" |
| Integrazione MCP con NotebookLM | Nessuna. C'è una sezione **Notebook** interna, simile a NotebookLM (fonti caricate e chat che risponde solo da quelle) | "Notebook: chat grounded on your sources" |
| "L'AI orchestra un vault Obsidian" | Il vault è **in sola lettura**. Gemini estrae concetti e genera note vive e domande, Claude fa da tutor e corregge, tramite le CLI con gli abbonamenti dello studente | "Your notes, read-only" |
| KPI come "retention %" e "tempo risparmiato" | Non esiste una sperimentazione in classe: lo speech lo dichiara | Slide 5 separa **prove pubblicate**, **cosa misura già l'app** e **obiettivi del pilota** |

## Sistema visivo (vale per tutte le slide)

- **Stage:** 16:9, 1920×1080. Margini 120 px ai lati, 96 px sopra e sotto. Griglia a 12 colonne, gutter 24 px.
- **Materiale:** lo stesso dell'app negli screenshot. Fondo carta calda `#F1EDE6`, superfici `#FAF7F1` con bordo sottile, inchiostro `#1D1B18`, testo secondario `#6B665E`.
- **Un solo accento:** terracotta `#9C4A2F`, usato per "il punto della slide" (un numero, un nodo, una parola). Verde `#3F7D58` solo per "consolidato". Niente gradienti viola.
- **Tipografia:** titoli nel serif condensato dei titoli dell'app (quello di "Teorema di Rolle", "21/30"), 88–120 px. Corpo in Geist 30–34 px. Etichette e numeri tecnici in Geist Mono maiuscolo, 18–20 px, spaziatura larga.
- **Screenshot:** sempre in una cornice finestra con raggio 22 px, bordo sottile e ombra morbida. Mai a tutto schermo, mai ritagliati senza cornice. Le didascalie in inglese stanno **fuori** dallo screenshot, in mono, collegate con una linea sottile al punto che spiegano.
- **Motivo ricorrente:** il grafo. Nodi rotondi con bordo, archi sottili con freccia. Compare rotto nella slide 1, ordinato nella 2, colorato dalla memoria nella 5. È il filo che tiene insieme il deck.
- **Movimento:** curve a molla, 300–600 ms, mai lineari. Una sola animazione "protagonista" per slide. Ogni comparsa parte con un clic, così segue la voce e non un timer.
- **Come ottenere il Morph:** in PowerPoint transizione *Morph* con gli stessi nomi oggetto (`!!node-rolle`, `!!node-lagrange`…); in Keynote *Magic Move*; in HTML elementi condivisi con lo stesso `view-transition-name`.

Gli screenshot citati sono file reali in `.audit/after/`. Dove ne serve uno nuovo è scritto.

---

## SLIDE 1 — Problem

**[TESTO]**

- Etichetta: `01 · THE PROBLEM`
- Titolo: **Two ways to fail.**
- Colonna sinistra, titolo: **One lecture, two hundred students.**
  Sotto: *Miss one prerequisite in week 3 and everything built on it is noise.*
- Colonna destra, titolo: **A chatbot that thinks for you.**
  Numeri: **+48%** *in practice* → **−17%** *on the real exam*
  Fonte, in mono piccolo: `Bastani et al., 2024 · randomized trial · high-school students · unrestricted GPT`
- Riga di chiusura, a tutta larghezza: *The question isn't whether to use AI. It's how it is built.*

**[VISUAL & SCREENSHOTS]**

- Nessuno screenshot: qui il prodotto non esiste ancora, e la sua assenza fa parte del racconto.
- Layout a due metà (colonne 1–6 e 7–12), separate da una linea verticale sottile.
- **Sinistra, il grafo rotto.** Una decina di nodi di Analisi 1 in catena deduttiva (Continuity → Weierstrass → Fermat → Rolle → Lagrange → Taylor…). Il nodo "Rolle" è vuoto, tratteggiato. Tutto ciò che sta a valle è grigio al 30% e gli archi in uscita sono spezzati. Questo è il "diagramma caotico": non confusione generica, ma una catena precisa che cede in un punto.
- **Destra, i due numeri.** `+48%` in grigio, 96 px. Sotto, `−17%` in terracotta, 220 px: è l'elemento più grande della slide. Tra i due una freccia sottile che scende.
- La riga di chiusura sta in basso, in serif corsivo, 40 px.

**[ANIMAZIONI]**

1. *Ingresso:* compare solo il titolo. Mezzo secondo di vuoto.
2. *Clic 1 ("one lecture"):* i nodi entrano uno dopo l'altro lungo la catena, 60 ms di scarto, tutti pieni e collegati. Sembra che funzioni.
3. *Clic 2 ("you missed one prerequisite three weeks ago"):* "Rolle" si svuota e diventa tratteggiato. Con 120 ms di ritardo a cascata, i nodi a valle perdono colore e gli archi si spezzano. È l'animazione protagonista: il danno deve **propagarsi**, non apparire.
4. *Clic 3 ("a chatbot"):* `+48%` sale con un contatore veloce (400 ms). Pausa.
5. *Clic 4 ("17% worse"):* `−17%` scende con un contatore più lento (900 ms) e si ferma con un piccolo rimbalzo. Qui non si parla per un secondo.
6. *Clic 5:* dissolvenza della riga di chiusura.

---

## SLIDE 2 — Idea

**[TESTO]**

- Etichetta: `02 · THE IDEA`
- Titolo: **Start from what you already know.**
- Il flusso, cinque passi in riga:
  `Your notes (read-only)` → `Concept graph` → `Memory · FSRS-5` → `Socratic practice` → `Exam readiness`
- Tre regole, una riga ciascuna:
  - **Read-only.** Sinapsi never writes to your Obsidian vault.
  - **Attempt first.** No answer, no hint, before you have tried.
  - **Measured mastery.** Mastery is the recall probability FSRS-5 estimates from your answers, not a tick.
- Piè di pagina in mono: `Gemini extracts and generates · Claude tutors and grades · your own subscriptions, no server`
- Seconda riga del piè di pagina: `Builds on LearnHarness and DeepTutor. We add everything after the lesson.`

**[VISUAL & SCREENSHOTS]**

- **Screenshot protagonista:** `.audit/after/19-home-with-data-1280.png`, la Home con la mappa (Rolle, Fermat, Weierstrass), le sessioni a sinistra e Notebook più note di Obsidian a destra.
- **Posizione:** colonne 6–12, centrato in verticale, largo circa 1020 px, ruotato di 0° (niente prospettive). Il bordo destro esce di 40 px dal margine per dare l'idea di una finestra vera.
- **Tre didascalie collegate allo screenshot:**
  - sul pannello destro "Note di Obsidian": `YOUR NOTES · READ-ONLY`
  - sulla mappa al centro: `CONCEPT GRAPH · EVERY NODE TRACES BACK TO A NOTE`
  - sul selettore in basso (Apprendimento / Pratica / Ripasso): `LEARN · PRACTISE · REVIEW`
- **Colonne 1–5:** titolo, poi le tre regole impilate. Il flusso a cinque passi corre in basso a tutta larghezza, sotto screenshot e regole, come una linea della metropolitana: cinque fermate, quella attiva in terracotta.
- La sezione Notebook resta visibile nello screenshot ma non ha una didascalia: in questa slide un'idea sola.

**[ANIMAZIONI]**

1. *Transizione dalla slide 1 (Morph):* i nodi grigi e spezzati della slide 1 **non spariscono**. Scivolano verso destra, si rimpiccioliscono e vanno a posarsi esattamente sopra i nodi della mappa nello screenshot. "Rolle" torna pieno, gli archi si ricuciono, poi la cornice dell'app si dissolve attorno a loro (500 ms). Il messaggio visivo: lo stesso sapere, ora tenuto insieme.
2. *Clic 1–3:* le tre regole entrano una alla volta, mentre vengono dette. A ogni regola si accende la didascalia corrispondente sullo screenshot e le altre due scendono al 40% di opacità.
3. *Clic 4:* la linea del flusso si disegna da sinistra a destra (800 ms), le fermate si accendono in sequenza.
4. *Clic 5:* piè di pagina in dissolvenza.

---

## SLIDE 3 — Use scenario

**[TESTO]**

- Etichetta: `03 · USE SCENARIO`
- Titolo: **Tuesday, 6 pm. Calculus lecture this morning.**
- Sottotitolo: *A first-year STEM student, an oral exam in six weeks, notes in Obsidian.*
- Tre passi:
  - **Step 1 · Measure, then teach.** The tutor checks what you really remember about Rolle before it touches Lagrange. You predict, it explains, you verify.
  - **Step 2 · The note comes alive.** Each theorem as formula, plain language and intuition. Proofs stay hidden until you try. A mistake in your own notes is flagged, not absorbed.
  - **Step 3 · Review with a stake.** You declare how sure you are before answering. Wrong at 80% isn't a gap, it's a misconception, and it comes back.
- Riga finale: *Within 24 hours of the lecture, before forgetting does the work for you.*

**[VISUAL & SCREENSHOTS]**

- Tre screenshot in fila, stessa altezza (circa 520 px), uno per colonna da 4, numerati `01` `02` `03` in mono terracotta sopra la cornice. Il testo del passo sta sotto ciascuno.
  - **01:** `.audit/after/07-session-question-1280.png`. Ritaglio sulla scheda "Misura": la domanda su Rolle, le opzioni A/B, il cursore "Fiducia 50%", il campo "Il tuo ragionamento". Didascalia: `PREREQUISITE CHECK · CONFIDENCE · YOUR REASONING`.
  - **02:** `.audit/after/04-nota-viva-1280.png`. Ritaglio sul titolo "Teorema di Rolle del punto stazionario" e sulla barra Leggi / Prova da solo / Quiz. Didascalia: `LIVING NOTE · READ, THEN TRY ALONE`.
  - **03:** `.audit/after/10-review-exercise-1280.png`. La scheda di ripasso con "Quanto sei sicuro?". Didascalia: `CONFIDENCE BEFORE ANSWERING`.
- Una linea sottile con freccia collega le tre cornici all'altezza del centro: è la stessa linea del flusso della slide 2, ora con tre fermate.
- **Da catturare, se c'è tempo:** per il passo 2 vale di più uno screenshot della nota viva scorso più in basso, dove si vedono la decodifica su tre livelli e un errore segnalato. Per il passo 1, una schermata di Pratica con un indizio bloccato mostra il feedback del tutor meglio di qualsiasi frase (`13-practice-train-1280.png` mostra già "Dammi un indizio", ma non il blocco).
- Lo speech lo dice già: dieci secondi di registrazione mentre si trascina una figura della nota viva convincono più di un fermo immagine. Se il formato lo permette, il passo 2 diventa un video muto in loop.

**[ANIMAZIONI]**

1. *Ingresso:* titolo e sottotitolo. Le tre cornici ci sono già, ma vuote e al 25% di opacità: la giuria vede subito che i passi sono tre e sa quanto manca.
2. *Clic 1:* la cornice 01 va al 100% e sale di 12 px (molla, 450 ms), il testo del passo entra dal basso. Dentro lo screenshot, un anello terracotta pulsa una volta sul cursore "Fiducia".
3. *Clic 2:* 01 scende al 60%, 02 si accende allo stesso modo, la linea avanza da 01 a 02. L'anello pulsa su "Prova da solo".
4. *Clic 3:* stessa cosa per 03. L'anello pulsa sul cursore "Quanto sei sicuro?".
5. *Clic 4:* tutte e tre tornano al 100% e compare la riga finale.
- Regola per chi presenta: un clic per ogni "then" dello speech. Mai due passi accesi mentre se ne racconta uno.

---

## SLIDE 4 — Target user and context

**[TESTO]**

- Etichetta: `04 · WHO IT IS FOR`
- Titolo: **Students who build knowledge in layers.**
- Identikit, quattro righe con icona:
  - **Who.** First and second-year STEM students: Calculus, Linear Algebra, Physics.
  - **When.** The 24 hours after a lecture, and the six weeks before an exam.
  - **Already has.** Their own notes in Markdown, and an AI subscription they use badly.
  - **Pain.** Courses are cumulative. One missing prerequisite blocks the next ten theorems.
- Tre numeri:
  - **18.8M** · *tertiary students in the EU* · `Eurostat, 2022`
  - **≈ 5M** · *of them in STEM (26.9%)* · `Eurostat, 2023`
  - **≈ 1.9M** · *university students in Italy* · `MUR · figure to confirm on USTAT`
- Fascia "onestà", in fondo: **Left out today:** *no Mac · no Claude or Gemini subscription · notes not in Markdown · interface in Italian.*
- Riga di partenza: **Where we start:** *our own classrooms. First-year AI and Maths at Sapienza.*

**[VISUAL & SCREENSHOTS]**

- Layout asimmetrico: colonne 1–5 identikit, colonne 6–12 numeri e dettaglio di interfaccia.
- **Icone:** lineari, tratto 1,5 px, color inchiostro, dentro un quadrato arrotondato 56 px (lo stesso linguaggio delle icone dell'app). Niente emoji.
- **Numeri:** tre schede affiancate. Numero in serif 120 px, unità e descrizione in Geist 26 px, fonte in mono 16 px. Sotto le schede, tre cerchi concentrici sottili (EU → STEM → Italia come riferimento separato) riprendono le curve "limite di ciò che sai" della mappa di Sinapsi.
- **Dettaglio UI:** un ritaglio stretto, non una schermata intera. Da `.audit/after/08-session-plan-1280.png` la colonna "Il piano": *Teorema di Rolle (adesso) → Pendenza della corda (da fare) → Teorema di Lagrange (obiettivo)*. Largo circa 420 px, in basso a destra, con didascalia `THE PLAN STARTS FROM WHAT THIS STUDENT KNOWS`. È la prova che "personalizzato" non è un aggettivo.
- La dashboard delle statistiche chiesta dal brief non esiste come schermata catturata. Il piano personalizzato qui serve meglio; il pannello di prontezza va nella slide 5.
- **Fascia "Left out today":** fondo leggermente più scuro, a tutta larghezza. Dire i limiti prima che li chieda la giuria è una delle tre domande del regolamento.

**[ANIMAZIONI]**

1. *Ingresso:* titolo, poi le quattro righe dell'identikit in cascata (80 ms di scarto).
2. *Clic 1:* i tre contatori partono insieme da zero e arrivano al valore in 1,2 s con decelerazione. Mentre salgono, i tre cerchi concentrici si disegnano dall'esterno verso l'interno.
3. *Clic 2:* il ritaglio "Il piano" entra da destra; i tre punti del piano si accendono uno dopo l'altro, dal basso della conoscenza verso l'obiettivo.
4. *Clic 3:* la fascia "Left out today" sale dal basso, senza effetti. La sobrietà qui è voluta.

---

## SLIDE 5 — Success measures

**[TESTO]**

- Etichetta: `05 · HOW WE WILL KNOW`
- Titolo: **Measured, not felt.**
- Sottotitolo: *We haven't run a classroom trial, so we won't invent results. Here is what we measure and what we commit to.*
- Tre colonne:

| | **RETENTION** | **INDEPENDENCE** | **CALIBRATION** |
| --- | --- | --- | --- |
| Numero grande | **20–30%** | **/30** | **80%** |
| Cosa dice | fewer reviews for the same recall, FSRS vs SM-2 | timed exam simulation, no hints, graded out of thirty | wrong at this confidence is a misconception, not a gap |
| Cosa misura l'app | predicted vs observed recall, per concept | hints used per problem; solved twice without help on different days | declared confidence vs actual correctness |
| Fonte | `open-spaced-repetition benchmark` | `in the app today` | `in the app today` |

- Fascia inferiore, **Readiness index · 5 signals:** *unassisted simulations · errors cleared · concepts consolidated · "explain it yourself" passed · doubts closed.*
- Riga del pilota: **Next: one course, one exam session, real grades against the readiness index.**
- Micro-nota in mono: `Guardrailed tutor: +127% in practice with no exam penalty · Bastani et al., 2024`

**[VISUAL & SCREENSHOTS]**

- Tre colonne uguali (4 + 4 + 4), separate da linee verticali sottili. Dall'alto: etichetta mono, numero grande in serif 200 px, una riga di significato, una riga più piccola su cosa misura l'app, fonte.
- Un solo numero in terracotta: `/30`, perché è l'unico che lo studente riconosce come voto d'esame. Gli altri due in inchiostro.
- **Screenshot di sfondo o a lato:**
  - *Ideale, da catturare:* il pannello **Prontezza** della vista Piano (`ReadinessPanel`), con i cinque segnali e l'indice. In `.audit/after/` non c'è ancora. Va a destra, sotto le colonne, largo circa 620 px, con didascalia `READINESS · FIVE HARD SIGNALS`.
  - *Disponibile subito:* `.audit/after/16-exam-grade-1280.png`, la simulazione d'esame con "21/30" e la correzione per esercizio. Usato come **sfondo** dietro la colonna centrale, al 14% di opacità e sfocato di 2 px, così il "21/30" traspare dietro il `/30` della slide.
- La fascia dei cinque segnali è una riga di cinque pillole con bordo, stesso stile dei chip dell'app.
- **Scelta da confermare:** i numeri grandi sono prove pubblicate o proprietà del prodotto, non risultati di Sinapsi, e la slide lo dice. Se preferisci obiettivi dichiarati per il pilota (per esempio una soglia di richiamo o di calibrazione), vanno etichettati `TARGET` e decisi da te: non li ho inventati.

**[ANIMAZIONI]**

1. *Ingresso:* titolo e sottotitolo già fermi. Nessun effetto: la slide deve sembrare solida.
2. *Clic 1:* i tre numeri compaiono in dissolvenza rapida, 180 ms ciascuno, 100 ms di scarto, da sinistra a destra. Niente contatori: i contatori li abbiamo usati nella slide 4, qui il numero arriva già deciso.
3. *Clic 2:* sotto ogni numero entrano le due righe di testo (dissolvenza, 250 ms).
4. *Clic 3:* le cinque pillole dei segnali si riempiono in sequenza come una barra che avanza (5 × 120 ms). Lo screenshot di prontezza entra insieme.
5. *Clic 4:* la riga del pilota, in terracotta. È l'ultima cosa che resta sullo schermo.

---

## SLIDE 6 — 60-second pitch rehearsed

**[TESTO]**

Sulla slide solo questo:

- **Sinapsi**
- *AI that helps you think, and never thinks for you.*
- In mono piccolo: `Your notes → concept graph → memory → practice → readiness`

Lo speech, 144 parole, circa 60 secondi a 140–145 parole al minuto:

> Two hundred students, one lecture, one pace. Miss a single prerequisite and everything after it is noise. **/**
>
> So students ask a chatbot. In a 2024 randomized study, high-school students with unrestricted GPT did 48% better in practice, then 17% worse on the real exam. **/** The AI had done their thinking.
>
> Sinapsi is built the other way round. It reads the notes you already keep, and never edits them. It turns them into a graph of concepts, Rolle's theorem leading to Lagrange's, and tracks the probability that you still remember each one. A Socratic tutor starts from what you know and teaches one step at a time. Hints stay locked, in code, until you have tried. **/** Before every answer you say how sure you are, so a confident mistake is caught as a misconception.
>
> Sinapsi: AI that helps you think, and never thinks for you.

Tabella di marcia:

| Tempo | Blocco | Parole | Nota |
| --- | --- | --- | --- |
| 0:00 – 0:08 | L'aula | 17 | Lento. Guarda la sala su "two hundred". |
| 0:08 – 0:22 | Il chatbot | 33 | I due numeri una volta sola, staccati. Pausa dopo "real exam". |
| 0:22 – 0:54 | Sinapsi | 83 | Ritmo più alto. "In code" va isolato tra due respiri. |
| 0:54 – 1:00 | Chiusura | 11 | Fermo, senza salire di tono. Poi silenzio. |

`/` indica una pausa di un respiro. Ogni affermazione dello speech è verificabile nel codice o nelle fonti citate nelle slide 1 e 5.

**[VISUAL & SCREENSHOTS]**

- Slide quasi vuota: chi parla è il contenuto. Fondo carta, logo e nome al centro, la frase sotto in serif corsivo 56 px.
- Dietro, al 12% di opacità, la mappa dei concetti a tutto schermo: lo stesso grafo della slide 1, ora intero.
- Nessuno screenshot. In basso a destra, in mono 16 px, un contatore `0:00 → 1:00` visibile solo a chi presenta (o nelle note del relatore).

**[ANIMAZIONI]**

1. *Transizione dalla slide 5 (Morph):* le cinque pillole dei segnali si restringono in cinque nodi e raggiungono il grafo di sfondo.
2. *Durante i 60 secondi, senza clic:* i nodi del grafo passano uno alla volta da vuoti a pieni, uno ogni 5 secondi circa, partendo dai prerequisiti. È un orologio silenzioso per chi parla e l'immagine di chiusura dello speech lungo: "a graph where prerequisites turn solid and unlock the next step".
3. *Sull'ultima frase:* l'ultimo nodo, "Lagrange", si riempie in terracotta. Fine. Nessuna dissolvenza in uscita.

---

## Cosa manca per chiudere

1. **Uno screenshot nuovo:** il pannello Prontezza della vista Piano (slide 5).
2. **Due screenshot migliorabili:** nota viva scorsa fino alla decodifica su tre livelli con un errore segnalato; Pratica con un indizio bloccato (slide 3).
3. **Un numero da confermare:** gli iscritti all'università in Italia. Dalle fonti trovate si ricava circa 1,95 milioni per il 2023/24, ma è un valore derivato: il dato esatto è sul portale USTAT del MUR.
4. **DeepTutor:** nel repository c'è solo LearnHarness. Resta nel piè di pagina della slide 2 perché lo citi nello speech; se non puoi documentarlo, toglilo.

## Fonti dei numeri

- Bastani et al., 2024 (+48%, −17%, +127%): già verificato in `docs/ricerca/revisione.md`.
- FSRS, 20–30% di ripassi in meno rispetto a SM-2: benchmark open-spaced-repetition, verificato in `docs/ricerca/revisione.md`.
- 18,8 milioni di studenti terziari nell'UE (2022): [Eurostat, Tertiary education statistics](https://ec.europa.eu/eurostat/statistics-explained/index.php/Tertiary_education_statistics).
- 26,9% iscritti in area STEM nell'UE (2023): [Education and Training Monitor, comparative report](https://op.europa.eu/webpub/eac/education-and-training-monitor/en/comparative-report/chapter-1.html).
- Iscritti in Italia: stima derivata da [Sironi, 2025](https://www.boa.unimib.it/retrieve/91bb4710-046e-4fc4-bf06-84a4486c05f1/Sironi-2025-Agenda%20Digitale%20EU.pdf) (273.762 iscritti alle telematiche, pari al 14,0% del totale).
