# Sessioni di studio (tutor socratico)

← [[Inizio]] · approfondimento: [docs/STUDY_SESSIONS.md](../STUDY_SESSIONS.md)

## Flusso
1. `createSessionRunner()` in `src/main/session/runner.ts`: avvio, scelta della nota (`matchNote` in `note-match.ts`), albero dei concetti da coprire (`minimalTree` / `treeBrief` in `minimal-tree.ts`), stato della memoria (`memoryBrief` in `memory-brief.ts`).
2. Primo messaggio: `firstMessage()` in `src/main/session/prompt.ts`, con **solo le sezioni pertinenti** della nota (`sectionText`).
3. Ogni turno del tutor: `bridge.converse()` (task `teach`, Claude) con `teacherSystemPrompt()` e lo schema del protocollo (`src/shared/teacher-protocol.ts`). Lo streaming mostra il testo mentre arriva.
4. L'app governa le fasi: `stageInstruction()` aggiunge lo stato a ogni messaggio, `checkTurnAgainst()` rifiuta i turni che non lo rispettano (un retry). Tutto in `src/main/session/events.ts`, dove `reduceSession()` ricostruisce lo stato dagli eventi.
5. Risposte aperte corrette da `gradeOpenAnswer()`, chiavi delle scelte multiple verificate a fine sessione da `validateChoices()` (`src/main/session/grade.ts`, motore «altro»).
6. Fine: `fsrsEvidence()` → righe in `memory/reviews.jsonl`, debolezze, riepilogo in `sessions/index.jsonl`.

## Dati
`sessions/<id>.jsonl` (eventi). → [[Dati su disco]]

## Interfaccia
`src/renderer/src/session/` (`SessionView.tsx`, `QuestionDock.tsx`, `PlanMap.tsx`, `games/`).

## Regole
- Il tutor non ha strumenti (conversazione isolata).
- Padronanza solo con evidenza generativa (risposta aperta corretta o Tabù); scelte multiple e giochi non bastano.

Collegate: [[AI e motori]], [[Memoria e ripasso]], [[Note vive]].
