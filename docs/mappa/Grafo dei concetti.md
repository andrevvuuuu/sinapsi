# Grafo dei concetti

← [[Inizio]] · approfondimento: [docs/CONCEPT_GRAPH.md](../CONCEPT_GRAPH.md)

## Estrazione (nota → idee e catene)
- `createExtractor()` in `src/main/graph/jobs.ts`: coda di estrazione (`request(path, reason)`), estrazione in background quando il Mac è inattivo (`backgroundTick`, timer ogni 10 min in `src/main/ipc.ts`, limite giornaliero dalle impostazioni), stato trasmesso al renderer.
- Prompt: `buildExtractPrompt()` in `src/main/graph/extract-prompt.ts`; candidati già nel grafo scelti da `pickCandidates` (in `jobs.ts`), così il modello riusa gli id esistenti invece di duplicare.
- Risposta: `ExtractReplySchema` (permissivo, scarta le voci rotte) e `mergeExtraction()` in `src/main/graph/extract.ts`, che assegna gli id (`n_…`, `arg_…`).
- Task AI `extract` (Gemini medium). Note invariate (stesso hash) non vengono riestratte, salvo richiesta manuale o nota collegata.

## Derivazione
- `deriveGraph()` in `src/main/graph/derive.ts`: funzione pura che ricostruisce concetti, catene, profondità e note di provenienza dai ledger. `ancestors()` per i prerequisiti.
- `graphStore()` in `src/main/graph/store.ts`: unico scrittore dei ledger (`propositions`, `chains`, `extractions`, `moves`); `read()` riusa i dati se i file non sono cambiati (firma mtime+size). Spiegazioni delle catene in `explanations.json`.
- `extractor.graph()` restituisce il grafo memoizzato finché ledger e indice del vault sono gli stessi oggetti. **Il risultato è condiviso: non mutarlo.**
- Rinomine e spostamenti: `detectMoves` / `detectOfflineMoves` in `src/main/graph/moves.ts` (i concetti seguono la nota).

## «Perché sono collegati»
`createChainExplainer()` in `src/main/graph/explain.ts`: genera la spiegazione di una catena e la fa verificare dal motore «altro».

## Interfaccia
`src/renderer/src/graph/`: `GraphView.tsx` (vista, ~1.700 righe), `GraphNotchDock.tsx` (pannello), `layout.ts` (d3-force con budget di tempo), `draw.ts`, `model.ts`.

- `.gnotch-dock` e `.gzoom` usano solo token (tema chiaro e scuro), con test in `tests/unit/contrast.test.ts`.
- Alla selezione un impulso di ~800 ms scorre sugli archi della catena (`pulse` in `DrawState`, `draw.ts`); poi il loop rAF si ferma. Con «Riduci movimento» un solo frame statico.
- «Apri la nota» nella card apre prima l'anteprima `NotePeek` (`src/renderer/src/components/NotePeek.tsx`, superficie solida, nessuna scena WebGPU nuova): zoom, selezione e cluster restano com'erano. Da lì «Apri Nota Viva completa» o la nota.

Collegate: [[Vault Obsidian]], [[AI e motori]], [[Memoria e ripasso]].
