# Vault Obsidian

← [[Inizio]]

## Lettura
- `scanVault()` in `src/main/vault/scan.ts`: elenca i `.md` (salta cartelle escluse e nascoste, tiene i segnaposto iCloud come non disponibili), legge frontmatter con gray-matter, tag, titoli, block id, wikilink, materia; poi risolve i link per titolo/alias. Con un `memo` per file rilegge solo i file con `mtime`/dimensione cambiati.
- `createVaultIndexCache()` in `src/main/vault/index-cache.ts`: tiene l'ultimo indice; riscansiona solo dopo `invalidate()`, cambio di vault/esclusioni o dopo 30 s (TTL per eventi persi, es. download iCloud). Le chiamate concorrenti condividono la stessa scansione. **Gli indici restituiti sono condivisi: non mutarli.**
- `makeHandlers().vaultIndex()` (`src/main/ipc-handlers.ts`) è il punto d'ingresso usato da tutto il main.
- `links.ts` (wikilink), `subjects.ts` (materie dal vault), `body-hash.ts` (hash senza frontmatter).

## Modifiche in Obsidian
1. `watchVault()` in `src/main/vault/watch.ts` (chokidar, debounce 500 ms) → callback in `registerIpc()` (`src/main/ipc.ts`): `invalidate()` della cache, nuovo indice, rilevamento rinomine (`src/main/graph/moves.ts`), evento `vault:changed`.
2. `createLinkedSync()` in `src/main/vault/linked.ts`: aspetta che la nota resti ferma (`SETTLE_MS` = 2 min), confronta l'hash, poi aggiorna le note vive della nota (→ [[Note vive]]) e riestrae i concetti delle note collegate studiate (→ [[Grafo dei concetti]]). Le MOC non propagano.

## Regole
- Sinapsi non scrive mai nel vault.
- Solo note presenti nell'indice e disponibili possono essere mandate a un modello (mai path arbitrari dal renderer).

Collegate: [[Grafo dei concetti]], [[Note vive]].
