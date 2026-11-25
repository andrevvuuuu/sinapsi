# Dati su disco

← [[Inizio]] · schema completo con esempi di righe: [ARCHITECTURE §5](../ARCHITECTURE.md)

Tutto sta in `~/Library/Application Support/Sinapsi/` (`dataDir()` in `src/main/store/paths.ts`), oppure in `SINAPSI_DATA` per i test.

| Percorso | Contenuto | Scritto da |
|---|---|---|
| `settings.json` | impostazioni (con `settingsVersion`, migrazioni in `src/main/store/settings.ts`) | `saveSettings` |
| `ai-usage.jsonl` | una riga per chiamata AI: token, cache, durata, esito | bridge → [[AI e motori]] |
| `ai-cache/` | cache delle risposte `ask()` con `cache: true` | bridge |
| `graph/*.jsonl`, `positions.json`, `explanations.json` | ledger del grafo | `graphStore` → [[Grafo dei concetti]] |
| `memory/reviews.jsonl` | ogni risposta valutata: l'unica prova di memoria | → [[Memoria e ripasso]] |
| `memory/variants.jsonl`, `explain-checked.jsonl`, `weaknesses.jsonl` | esercizi preparati, verifiche, debolezze | review service |
| `sessions/<id>.jsonl`, `sessions/index.jsonl` | eventi e riepiloghi delle sessioni | → [[Sessioni di studio]] |
| `notes/<id>.json` | note vive (con impronte delle sezioni della fonte) | → [[Note vive]] |
| `notebook/` | fonti per materia | → [[Fonti e voce]] |
| `practice/` | allenamenti ed esami | → [[Pratica ed esami]] |
| `lessons.jsonl`, `exams.jsonl`, `attempts.jsonl` | registro lezioni, esami, tentativi nelle note vive | → [[Lezioni e tutor]] |

## Regole
- `appendJsonl` / `readJsonl` in `src/main/store/jsonl.ts`: append ordinato per file; in lettura le righe rotte o non valide vengono saltate.
- Mai riscrivere un ledger: si aggiungono righe e lo stato si ricostruisce (`reduce*`, `deriveGraph`, `memoryOf`).
