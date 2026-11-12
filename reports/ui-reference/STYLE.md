# Sinapsi: riferimenti di stile (Fase 3, redesign UI)

Queste sono le reference ufficiali per lo stile dell'app. Ogni builder le legge prima di toccare la UI.
Le immagini (screenshot di altre app e fotogrammi estratti dai video in `~/Documents/ui sinapsi reference/`) restano solo in locale in questa cartella: non sono pubblicate nel repository.

| File | Cosa prendere |
|---|---|
| `stile-app-1.png` | Struttura e materiale: app desktop grafite, sidebar con sezioni, schede metriche, lista "servizi", pannello log |
| `stile-app-2.png` | Densità e dati: schede con numeri grandi, mini-istogrammi, grafico a barre 24h con evidenza ambra, barra di ricerca ⌘K in basso |
| `toggle-tema-frames.jpg` | Interruttore del tema chiaro/scuro (elemento da avere) |
| `chip-ink-frames.jpg` | Filtri a chip con riempimento a inchiostro (elemento da avere) |
| `dock-liquido-frames.jpg`, `dock-liquido-closeup.jpg` | Menu a dock liquido (elemento da avere) |

## 1. Materiale e colore
- **Scuro (default):** grafite neutra e fredda, non nera. Fondo finestra ~`#1c1d20`, pannello sidebar ~`#232428`, schede ~`#2a2b30` con bordo hairline `rgba(255,255,255,.06)` e un riflesso interno in alto (`inset 0 1px 0 rgba(255,255,255,.04)`). Testo primario ~`#ececef`, secondario ~`#9a9ba3`.
- **Chiaro:** carta calda e grigia (come nei fotogrammi chiari del toggle): fondo ~`#ecebe8`, schede ~`#f7f6f3`, testo ~`#1d1d1f`.
- **Accenti semantici, mai decorativi:** ambra `#f2b84b` per "adesso / in evidenza" (la barra di oggi, lo streak); verde `#5fd38a` per stato attivo/OK (pallino "live"); blu `#4c8dff` per link e azioni secondarie; arancio corallo per il tutor/AI (come l'asterisco di Claude nello screenshot).
- Profondità data dal colore delle superfici, non da ombre pesanti. Ombra solo sugli elementi flottanti (dock, toggle, popover).

## 2. Forma e spazio
- Raggi generosi e concentrici: finestra 22px, schede 16px, righe selezionate 10px, chip e pill a pillola.
- Griglia a multipli di 4; padding scheda 16–20px; gap tra schede 12px.
- Riga di lista: icona-avatar quadrata arrotondata 28px + titolo + sottotitolo mono smorzato + metadati allineati a destra. La riga selezionata ha un riempimento tenue, non un bordo.

## 3. Tipografia
- Sans (Geist) per UI; **mono (Geist Mono) per metadati e numeri tecnici** (orari, `:3000`, durate, contatori).
- Numeri metrica grandi (32–40px, peso 500) con unità piccola smorzata accanto (`42 m`, `412 MB`). Etichetta scheda in alto a sinistra 13px secondaria; contesto sotto ("Da 10:14", "Picco 38%").
- Etichette di sezione della sidebar: 12–13px, secondarie, con un `+` a destra quando si può aggiungere.

## 4. Visualizzazione dati
- Mini-istogrammi a barre sottili dentro le schede metrica, grigi con l'ultima barra accesa (blu o ambra).
- Grafico a barre di periodo: barre grigie arrotondate, il periodo corrente in ambra, etichette agli estremi ("Ieri 01:00" / "Adesso").
- Anelli di progresso sottili con un'icona al centro.

## 5. Elementi interattivi obbligatori
1. **Toggle del tema (sole/luna):** pista a pillola incassata (inner shadow); manopola quadrata arrotondata che scorre. L'icona è fatta di puntini (dithering) e durante il passaggio si scompone in particelle e si ricompone (sole ↔ luna). Bagliore sul bordo della manopola: ambra/oro in chiaro, viola-blu in scuro, che segue il lato verso cui la manopola si muove. Molla morbida, circa 450ms.
2. **Chip filter a inchiostro:** a sinistra una pill scura "N risultati"; a destra chip con contorno. Al clic su un chip l'inchiostro scuro parte dal bordo vicino alla pill, riempie il chip e il chip si fonde ("gooey", metaball) con la pill dei risultati, dentro cui compare separato da un divisore sottile. Il contatore cambia con un rotolamento verticale delle cifre. Togliendo il filtro, l'inchiostro si ritira e il chip si stacca. Sensazione ASMR: lenta all'inizio, rapida alla fine.
3. **Dock liquido:** barra di vetro scuro con hairline chiara, icone lineari. Sopra la voce attiva il bordo superiore si gonfia in una gobba morbida (il bordo è un path SVG) che scorre fluida da una voce all'altra. Sotto la voce attiva un alone colorato diffuso, **diverso per ogni voce** (viola, blu, rosa, ambra, verde) che tinge anche lo sfondo dietro. Solo la voce attiva mostra l'etichetta, piccola, sotto l'icona.

## 6. Movimento
- Curve di molla, niente lineari; 200–450ms. Ogni animazione ha un'alternativa con `prefers-reduced-motion` (cambio di stato immediato, niente particelle).

## 7. Mappa dei concetti di Sinapsi (per dare nomi coerenti all'interfaccia)
| Nell'app attuale | Che cos'è | Nome proposto nella nuova UI |
|---|---|---|
| Composer in Home, modalità *Apprendimento* → `SessionView` (Misura → Piano → Insegnamento → Consolidamento) | L'AI ti fa lezione su un argomento che scrivi o detti | **Studia**: è "la lezione" vera e propria |
| *Pratica* → `PracticeView` (tutor socratico con bussola, riformulazione, fading) | Esercizi guidati con domande: il tutor non ti dà la risposta | **Esercitati** (il tutor socratico) |
| *Ripasso* → `ReviewView` (FSRS, calibrazione della confidenza) | Ripasso spaziato di ciò che sta svanendo | **Ripassa** |
| *Registro Lezioni* → `lessons/` | Diario delle lezioni **di scuola**: nota sorgente, prerequisiti, nucleo 80/20, dubbi aperti, misconcezioni, padronanza | **Registro** (lezioni in classe) |
| `plan/` | Esami, piano settimanale, indice di prontezza | **Piano** |
| Grafo + note | Mappa dei concetti e note vive | **Mappa** / **Note** |

Regola: il campo "Cosa vuoi studiare?" (testo o dettatura) è sempre raggiungibile ed è il centro della schermata Oggi.
