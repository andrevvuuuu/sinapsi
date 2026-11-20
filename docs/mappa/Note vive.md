# Note vive

← [[Inizio]] · approfondimento: [ARCHITECTURE §4.6 e §8.2](../ARCHITECTURE.md)

## Generazione
- `createNoteGenerator()` in `src/main/notes/generator.ts`: `create` (da nota o da sessione), `retry`, `refresh`, `list`, `get`. Task AI `note`.
- Prompt completo: `buildNotePrompt()` in `src/main/notes/prompt.ts` = regole (`NOTE_RULES`) + formato (`NOTA_FORMAT` in `src/shared/nota-schema.ts`) + nota (`capNote`) + estratti del notebook (→ [[Fonti e voce]]) + digest della sessione (`sessionDigest`).
- Validazione permissiva: `parseNota` / `NotaSchema` validano ogni blocco da solo, uno rotto non costa la nota; `NotaWriteSchema` (`src/shared/nota-math.ts`) aggiunge i controlli sulle formule, con `fallback` se falliscono.
- Salvataggio: `src/main/notes/store.ts` (`notes/<id>.json`), con `sourceHash` e le impronte della fonte (`sourceSections`, `sourceIntroHash`).

## Aggiornamento quando cambia la nota Obsidian
Avviato da `createLinkedSync()` (→ [[Vault Obsidian]]), dopo 2 minuti di quiete.
1. `splitSections()` in `src/main/notes/sections.ts` divide la nota sui titoli `##` (frontmatter escluso, codice protetto) e calcola un hash per sezione.
2. `refreshNote()` in `generator.ts` confronta con le impronte salvate. **Aggiornamento parziale** se: stessi titoli nello stesso ordine, intro invariata, al massimo metà delle sezioni cambiate, ogni sezione cambiata trovata nella nota viva (per indice o `matchesTitle` di `section-text.ts`).
3. Parziale: una chiamata con `buildSectionUpdatePrompt()` (solo le sezioni cambiate: testo nuovo + JSON attuale), risposta validata da `SectionsSchema`; si sostituiscono solo quelle sezioni, i blocchi `session` vecchi vengono conservati.
4. Altrimenti, o se la risposta è malformata: riscrittura completa. Timeout, accesso scaduto o motore mancante non fanno ripiegare (fallirebbero di nuovo, costando di più).

## Interfaccia
`src/renderer/src/nota/` (`NotaView.tsx`, `BlockView.tsx`, `blocks/`, `figure/` per le figure interattive).

## Regole
- Le sezioni della nota viva seguono le sezioni `##` della nota Obsidian: è ciò che rende possibile l'aggiornamento parziale.
- Mai correggere la nota in silenzio: gli errori diventano blocchi `flag`.

Collegate: [[AI e motori]], [[Sessioni di studio]], [[Fonti e voce]].
