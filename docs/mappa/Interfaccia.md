# Interfaccia

← [[Inizio]] · approfondimento: [ARCHITECTURE §7](../ARCHITECTURE.md), regole: [docs/design.md](../design.md)

## Struttura
React 19 + Vite (electron-vite). `src/renderer/src/App.tsx` gestisce lo stack di navigazione (`src/renderer/src/nav/nav-stack.ts`, `useNavStack.ts`) con label indietro contestuale e scorciatoia ⌘[; la shell e i dati condivisi stanno in `src/renderer/src/shell/` (`AppData.tsx` con provider per IPC unificate, `AppShell.tsx`, `Sidebar.tsx`, `LiquidDock.tsx` con Oggi / Mappa / Piano, `CommandPalette.tsx` ⌘K, `TodayView.tsx`, `MapView.tsx`, `AIStatusPopover.tsx`).

## Viste
| Cartella | Vista | Area |
|---|---|---|
| `review/` | Ripasso | [[Memoria e ripasso]] |
| `practice/`, `plan/` | Esercitati, esame, Piano | [[Pratica ed esami]] |
| `session/` | Studio socratico e giochi | [[Sessioni di studio]] |
| `nota/` | Note vive (blocchi, figure interattive) | [[Note vive]] |
| `graph/` | Grafo D3 | [[Grafo dei concetti]] |
| `lessons/` | Registro | [[Lezioni e tutor]] |
| `home/` | vecchia home, non montata; restano `SettingsDialog`, `NoteTree`, `LogoMark` | — |
| `components/` | componenti condivisi (vetro, microfono, selettore formule) | — |

## Componenti condivisi nuovi
- `components/ConfirmButton.tsx`: conferma inline a due stati per azioni irreversibili (al posto di `window.confirm`, che non si usa più): Esc, «Annulla» o 4 s annullano.
- `components/NotePeek.tsx`: anteprima della nota sopra la vista corrente (Grafo, Ripasso).
- `components/useWaitStage.ts` + `Skeleton.tsx`: attese AI con stadio (preparo, in coda, ragiono, scrivo, lento) dai canali esistenti (`ai:status-changed`, `session:partial`, `notes:updated`).
- `shell/CommandPalette.tsx` (⌘K) e lo stack di navigazione (`nav/`): «indietro» contestuale (`← Grafo`, `← Note`…) e ⌘[.

## Regole di stile (obbligatorie)
- Solo token di `src/renderer/src/styles/tokens.css` (temi `lavagna` e `trattato`), niente valori CSS grezzi, niente nuove librerie UI, niente componenti duplicati.
- Vetro: `@glass-sdk/liquid-glass`, spento con «Riduci trasparenza».
- Alcuni test leggono `home.css` e `graph.css` con espressioni regolari: non riformattarli.
- La palette `--sh-*` di `shell/shell.css` è in migrazione verso i token: i controlli già migrati (zoom del grafo `.gzoom`, chip scelte `.mt-chip.on` di Pratica) sono protetti da `tests/unit/contrast.test.ts`, che controlla il contrasto AA in entrambi i temi, l'assenza di colori grezzi e i 34 px di `.gzoom` (eccezione `DENSE` in `tests/e2e/screens.spec.ts`).
- Livelli: viste < 10, dock 20, dialoghi 60, Impostazioni 80.
- File grandi (`graph/GraphView.tsx`, `graph/GraphNotchDock.tsx`): leggere solo le parti necessarie.

Collegate: [[Processi e IPC]].
