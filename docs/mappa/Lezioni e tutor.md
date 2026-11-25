# Lezioni e tutor

← [[Inizio]] · approfondimento: [ARCHITECTURE §4.9 e §4.11](../ARCHITECTURE.md)

## Registro lezioni
- `src/main/lessons/store.ts`: `lessons.jsonl` a eventi (`lesson-created`, `lesson-updated`, `digest-done`, `confusion-added`, `mastery-changed`, …).
- `reduceLessons()` / `pendingDigest()` in `reduce.ts`: ricostruiscono le lezioni (`LessonEntrySchema` in `src/shared/lesson-types.ts`): nucleo 80/20, tipo PACER, concetti, confusioni aperte, passi di digestione.
- `resolveLessonLaunch()` in `launch.ts`: da una lezione avvia pratica o ripasso dei suoi concetti.

## Tutor di Sinapsi
- `readTutorCalendar()` in `src/main/tutor/calendar.ts`: legge in sola lettura il tutor delle lezioni di Obsidian (`.antigravity/tutor/` nel vault): corsi, orario, esami.
- `createSinapsiTutorService()` / `buildTutorReport()` in `src/main/tutor/sinapsi-tutor.ts`: collega i concetti di ogni lezione a quelli estratti da Sinapsi e calcola la padronanza (media di R) con stati da `interiorizzato` a `scollegato`. Il giudizio del tutor di Obsidian viene ignorato.

## Suggerimenti
`suggest()` / `createSuggester()` in `src/main/suggest/suggest.ts`: i chip di studio della vista Oggi.

## Interfaccia
`src/renderer/src/lessons/` (`LessonLogView.tsx`, `LessonEditor.tsx`, `LessonDetail.tsx`, `LaunchButton.tsx`). La gestione esami nel Registro delega a `<ExamManager />` in `src/renderer/src/plan/ExamManager.tsx`.

Collegate: [[Memoria e ripasso]], [[Pratica ed esami]], [[Grafo dei concetti]].
