# Pratica ed esami

← [[Inizio]] · approfondimento: [ARCHITECTURE §4.8 e §4.10](../ARCHITECTURE.md)

## Pratica (problemi con indizi)
- `createPracticeRunner()` in `src/main/practice/runner.ts`: un allenamento è una sequenza di problemi (modi `recall`, `discrimination`, `composition`), condotta dal tutor via `converse()` con `practiceSystemPrompt()` (`prompt.ts`) e il protocollo di `src/shared/practice-protocol.ts`.
- Scala di sei indizi e cancello `hintGate`: niente indizi senza un tentativo; dopo il primo serve la «bussola» (dove ci si è bloccati).
- Materiale: `buildCatalog` / `buildMaterialContext` in `material.ts` (concetti, catene, note, fonti, parole dello studente).
- Correzione: `gradePracticeProblem()` in `grade.ts` (motore «altro»). Ogni problema chiuso diventa una riga di memoria.

## Esame
- `createExamService()` in `src/main/practice/exam.ts`: foglio generato (task `teach`), a tempo, senza aiuti, salvataggio continuo, voto in trentesimi corretto dal motore «altro». Anche **su carta** con autovalutazione.
- `transcribePhoto()` in `photo.ts`: foto del foglio trascritta da Claude con il solo strumento `Read` (unica chiamata `readOnly`, → [[AI e motori]]).

## Esami, piano, prontezza
- `src/main/exams/` (`exams.jsonl`, `reduceExams`).
- `buildWeekPlan()` in `src/main/planner/plan.ts`: piano settimanale sulle ore di studio (`studyHours`, `planBuffer`).
- `readinessFor()` in `src/main/planner/readiness.ts`: prontezza per un esame da cinque segnali.

## Interfaccia
`src/renderer/src/practice/` (`PracticeView.tsx`, `PracticeSetup.tsx`, `ExamView.tsx`, `PaperExam.tsx`, `PhotoButton.tsx`), `src/renderer/src/plan/`.

## Dati
`practice/` nella cartella dati. → [[Dati su disco]]

Collegate: [[Memoria e ripasso]], [[Lezioni e tutor]].
