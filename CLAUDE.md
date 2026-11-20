# Sinapsi — istruzioni per gli agenti

Prima di esplorare il codice leggi la mappa: [docs/mappa/Inizio.md](docs/mappa/Inizio.md). Da lì segui i link fino all'area che ti serve e apri solo i file indicati. Per i dettagli di progetto: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Regole
- Vault Obsidian in sola lettura; dati in JSONL append-only, stato ricostruito dalle righe.
- Ogni chiamata AI passa da `src/main/ai/bridge.ts`. Le chiamate a Claude restano isolate dall'ambiente utente (`buildArgs` in `src/main/ai/engines.ts`).
- Payload dal renderer validati con zod in `src/main/ipc-handlers.ts`.
- UI: solo token di `src/renderer/src/styles/tokens.css`, principi in `docs/design.md`; niente nuove librerie UI.
- Test mirati: `npx vitest run <file>`; prima di chiudere: `npm run typecheck`.
- Chi cambia un flusso aggiorna la pagina della sua area in `docs/mappa/` nello stesso commit.
