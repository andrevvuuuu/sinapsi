# Report QA, test visivi e performance — 19/11/2026

Builder: Qwen locale (qwen3.5:9b, patch JSON per finestre di righe) e agy (1 invocazione). Codex non usato.

## 1. Errori di scrittura e di codice
- Lint (src + tests, esclusi prettier e return type espliciti): da 55 a 39 problemi.
- Corretti via Qwen: `prefer-const` (events.ts, ReviewView.tsx), assegnazioni inutili (events.ts, runner.ts, settings.ts), prop inutilizzata `cascadeWeak` (ReviewView), disable mirato per `_drop` (teacher-protocol.ts), NBSP letterale nella regex → ` ` (numbers.ts).
- Copy UI: nessun typo trovato (parole ripetute e refusi italiani comuni).
- Regressione funzionale corretta: Esc nella ricerca del grafo chiudeva anche la card del concetto selezionato (GraphView.tsx, listener globale ora ignora gli eventi dentro `.gnotch-dock`).

## 2. Test funzionali e ispezione screenshot
- Unit: da 11 test falliti (12 file) a 1265/1265 verdi (148 file). Erano test obsoleti verso il modulo notebook rimosso, mock senza `vault`, tab rinominata «Materiale del corso», fixture del grafo senza `retired`/`dormant`, dialog in portale.
- `notes-math-fallback` è instabile solo sotto carico (passa 3/3 da solo).
- e2e `tests/e2e/screens.spec.ts`: obsoleta (cerca notebook e la vecchia home); NON aggiornata. Gli screenshot sono stati presi con uno script dedicato sull'interfaccia attuale (6 viste × 2 temi × 2 finestre).
- Difetti trovati e risolti (agy, batch unico): dock che copre «Coda di oggi» a 1024×680 (ora scorrendo resta libero: card a 560 px, dock da 596 px); card «Prontezza esame» con meta e azione che andavano a capo; «Ripassa gli errori sicuri (0)» che sembrava attivo; contrasto del conteggio suggerimenti (ora 4.8:1).
- Errore runtime risolto: worker `blob:` del glass SDK bloccato dalla CSP. Dopo la correzione, zero errori in console.

## 3. Ottimizzazioni RAM e anti-lag
- Grafo: il ciclo requestAnimationFrame non gira più a 60 fps a vuoto; dorme finché `markDirty()` lo sveglia (zoom, resize, tema, hover, simulazione).
- Grafo: colore della materia con lookup su Map invece di `find` lineare per nodo a ogni ridisegno.
- CSP `worker-src 'self' blob:`: la codifica delle mappe del vetro torna su un Web Worker invece del thread principale.
- `appendJsonl`: la mappa delle catene di scrittura ora rilascia le voci finite (prima cresceva di una voce per file per sempre).
- Audit listener/timer/observer/watcher: nessun altro squilibrio rilevante.
- Non misurato con un profiler: miglioramenti dedotti dal codice.

## 4. Invocazioni agy
- 1 sola invocazione (UI1, senza /teamwork): 4 difetti visivi accorpati, perché richiedevano le skill di design. Tutto il resto (≈40 micro-task) è andato a Qwen, con 3 micro-edit diretti per riparare errori nelle mie specifiche o nell'output di Qwen.
