# Interfaccia

← [[Inizio]] · approfondimento: [ARCHITECTURE §7](../ARCHITECTURE.md), regole: [docs/design.md](../design.md)

## Struttura
React 19 + Vite (electron-vite). `src/renderer/src/App.tsx` sceglie la vista; la shell sta in `src/renderer/src/shell/` (`AppShell.tsx`, `Sidebar.tsx`, `LiquidDock.tsx` con Oggi / Mappa / Piano, `TodayView.tsx`, `MapView.tsx`, `AIStatusPopover.tsx`).

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

## Regole di stile (obbligatorie)
- Solo token di `src/renderer/src/styles/tokens.css` (temi `lavagna` e `trattato`), niente valori CSS grezzi, niente nuove librerie UI, niente componenti duplicati.
- Vetro: `@glass-sdk/liquid-glass`, spento con «Riduci trasparenza».
- Alcuni test leggono `home.css` e `graph.css` con espressioni regolari: non riformattarli.
- Livelli: viste < 10, dock 20, dialoghi 60, Impostazioni 80.
- File grandi (`graph/GraphView.tsx`, `graph/GraphNotchDock.tsx`): leggere solo le parti necessarie.

Collegate: [[Processi e IPC]].
