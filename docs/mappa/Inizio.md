# Mappa di Sinapsi — inizio

Questa cartella è una **mappa per orientarsi nel codice**: si parte da qui e si seguono i link fino all'area che serve, poi si aprono solo i file indicati. Si può aprire in Obsidian come vault a sé (vista grafo).
Per i dettagli di progetto completi c'è [docs/ARCHITECTURE.md](../ARCHITECTURE.md); questa mappa dice *dove* guardare.

## Cos'è Sinapsi
App desktop Electron (macOS) per studiare dalle note di un vault Obsidian: grafo dei concetti, ripasso FSRS, tutor socratico, note vive interattive, pratica ed esami. Tre processi: **main** (`src/main`, Node: AI, vault, dati), **preload** (`src/preload`), **renderer** (`src/renderer/src`, React). Codice condiviso e tipi in `src/shared`.

## Aree
- [[Processi e IPC]] — come interfaccia e motore si parlano (`window.sinapsi`, canali `CH`).
- [[AI e motori]] — ogni chiamata a Claude / Gemini (agy) passa da qui.
- [[Vault Obsidian]] — lettura delle note, cache dell'indice, sincronizzazione con le modifiche.
- [[Grafo dei concetti]] — estrazione, catene, derivazione del grafo.
- [[Memoria e ripasso]] — FSRS, esercizi, correzioni, «Spiegalo tu».
- [[Sessioni di studio]] — il tutor socratico.
- [[Note vive]] — generazione e aggiornamento per sezione.
- [[Pratica ed esami]] — allenamenti, simulazione d'esame, foto del foglio, piano.
- [[Lezioni e tutor]] — registro lezioni, tutor di Sinapsi, suggerimenti.
- [[Fonti e voce]] — notebook delle fonti, dettatura locale.
- [[Dati su disco]] — cosa viene salvato e dove.
- [[Interfaccia]] — viste React, stile e regole di design.

## Regole che valgono ovunque
- **Le scritture sono append-only.** I dati sono JSONL; lo stato (memoria, grafo, sessioni) si ricostruisce dalle righe. Non riscrivere i ledger. → [[Dati su disco]]
- **Il vault è in sola lettura.** Sinapsi non modifica mai le note Obsidian.
- **Ogni chiamata AI passa dal bridge** (`src/main/ai/bridge.ts`), mai `spawn` diretti. → [[AI e motori]]
- **Validazione all'ingresso.** Ogni payload dalla finestra è validato con zod nel main (`src/main/ipc-handlers.ts`).
- **Gli id li assegna il codice, non il modello** (concetti, catene, varianti).
- **UI:** solo token di `src/renderer/src/styles/tokens.css` e principi di `docs/design.md`. → [[Interfaccia]]
- **Test:** `npx vitest run <file>` mirato; `npm run typecheck` prima di chiudere un lavoro.

## Manutenzione della mappa
Chi cambia un flusso o sposta una funzione aggiorna la pagina della sua area **nello stesso commit**. Le pagine descrivono flussi e punti d'ingresso, non ogni riga: se un nome di file o funzione citato qui non esiste più, correggilo.
