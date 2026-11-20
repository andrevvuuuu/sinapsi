# Memoria e ripasso

← [[Inizio]]

## Memoria (FSRS-6)
- Ogni risposta valutata è una riga di `memory/reviews.jsonl` (`ReviewLineSchema` in `src/shared/memory-types.ts`). La carta FSRS **non viene salvata**: si ricostruisce rigiocando le righe.
- `src/main/memory/fsrs.ts`: `memoryOf()` (stato di ogni concetto: R, scadenza, stabilità, misconcezioni), `trainingLines()` (regola dello stesso giorno: dopo la prima riga del giorno conta solo un «Di nuovo» in più), `studyClock`/`studyDay` (il giorno cambia alle 04:00), `displayedR`, `previewIntervals`.
- `memoryStore()` in `src/main/memory/store.ts`: append + lettura con cache (rilegge solo se il file è cambiato). `weaknesses.ts`: debolezze e misconcezioni attive. `fading.ts`: concetti da cui togliere gli aiuti.

## Servizio di ripasso
`createReviewService()` in `src/main/memory/review.ts`:
- `plan` — sceglie i concetti in scadenza e prepara gli esercizi; se mancano, li genera per nota con il task `variants` (`buildVariantsPrompt` / `parseVariants` in `variants.ts`, salvati in `variants.jsonl`).
- `grade` — correzione delle risposte aperte (`buildGradePrompt` in `grade-prompt.ts`, motore «altro»).
- `explain` — «Spiegalo tu»: dialogo di al massimo `MAX_QUESTIONS` domande (`buildExplainPrompt` in `explain.ts`). Riceve **solo la sezione del concetto** (`conceptSection` in `review.ts`, via `sectionText`), con ripiego sulla nota intera.
- `record`, `memory`, `intervals`, `calibration`, `sessions` (`history.ts`).

## Interfaccia
`src/renderer/src/review/` (`ReviewView.tsx`, `ExerciseView.tsx`, `exercises/`).

## Regole
- Le risposte non si cancellano né si riscrivono: si aggiungono righe.
- Le sessioni (`via: 'session'`) e la pratica scrivono nello stesso file con il loro `via`.

Collegate: [[Sessioni di studio]], [[Pratica ed esami]], [[Grafo dei concetti]].
