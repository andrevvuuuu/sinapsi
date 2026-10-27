# Fase 6 — Pratica Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Practice sessions: material selector (concepts from the graph with memory, sources from the notebooks, free topic or pasted exam problem), **Allenamento** (Learn Harness practice doctrine: problems posed with a hidden model solution, hint ladder R0–R5, honest verdicts, pause between problems, arc warm-up → interleaved body → retest) and **Simulazione d'esame** (timed sheet, no help, grade in thirtieths at the end), with **photo of the sheet** (Continuity Camera / image) read by Claude.

**Architecture:** Training is a Claude conversation (bridge.converse, task `teach`) like the learning session, with its own JSON turn protocol, event log `practice/<id>.jsonl` and reducer. The exam is two one-shot calls: generate the sheet (hidden solutions), grade the answers. Concluded problems and graded exam items append FSRS review lines (`via: 'practice'`) to the targets, so practice moves the graph's memory. Photos are saved in `practice/<id>/` and transcribed by a one-shot call allowed only the Read tool.

**Tech Stack:** existing; no new dependencies. Camera through `getUserMedia` (macOS lists the iPhone as a camera when Continuity Camera is available), `NSCameraUsageDescription` in the packaged app.

**Spec:** `docs/design.md` §2 "Pratica" (Allenamento o Simulazione d'esame, durata 30/60/90/a scelta, niente indizi, voto alla fine; selettore del materiale; foto del foglio con Continuity Camera), §4 step 6; approved prototypes `docs/prototipi/proto-pratica.html` and `materiale-v1.html`; method from `~/riferimenti/learnharness/src/agent/prompts/practice/{00-base,10-doctrine}.md` (read-only).

## Global Constraints

- Never write into the Obsidian vault; Learn Harness repo read-only; no API keys.
- Prompts and UI in Italian; LaTeX `$…$` / `$$…$$`.
- Problems are never announced by target; the model solution stays hidden until the problem is concluded (training) or the exam is graded.
- Hints: one rung per request, rungs R0–R5; none in exam mode, and no correction during the exam.
- Custom exam duration 5–300 min, step 5; presets 30/60/90.
- e2e uses fakes (`SINAPSI_FAKE_PRACTICE=1`); live tests in `tests/live/*-live.test.ts`.

## Review Focus

1. The app quits mid-turn or mid-exam — reopening shows "Riprova" for the turn, and the exam keeps its answers and its original end time (time spent away counts).
2. The exam timer reaches zero with the answers typed but not delivered — they are delivered automatically, exactly once.
3. A tutor turn that poses a problem while one is active, or concludes when none is active — rejected by validation and retried, never shown.
4. A photo that is not readable (blurred, not a sheet) — the transcription says so; nothing is sent until Andrea confirms the text.
5. Material with nothing in the graph (free topic only, or a pasted exam problem) — the session still starts and problems have no targets; nothing is written to memory.

---

### Task 1: Practice protocol

**Files:** Create `src/shared/practice-protocol.ts`; Test `tests/unit/practice-protocol.test.ts`

**Produces:**
- `PracticeTurnShape` = `{ phase: 'warmup'|'body'|'retest'|'done', blocks: {type:'text', md}[], problem?: { id, statement, mode: 'recall'|'discrimination'|'composition', targets: string[], modelSolution, lines?: string[] }, hint?: { rung: 0..5, md }, conclude?: { outcome: 'solved'|'solved_hints'|'surrendered', verdict, miss?: 'cue'|'discrimination'|'execution'|'careless'|'structural', retest: boolean }, summary?: { solved: string[], retest: string[], note: string } }`
- `PracticeTurnSchema` refinements: at most one of `problem` / `conclude` / `hint`; `summary` only with `done`; `lines` ≥ 2 when present. `practiceJsonSchema()` (no `$schema`).
- `checkTurnAgainst(state, turn)`: problem while one is active → error "c'è già un problema aperto"; conclude/hint with none active → error.
- `Submission = { kind: 'start'|'thinking'|'hint'|'next'|'ask'|'dismiss'; text?: string; line?: number; photoText?: string }` (zod `SubmissionSchema`, text ≤ 20 000) and `formatSubmission(s, problem?)` → the Italian line the tutor reads ("*Il tuo ragionamento*: …", "Chiede un indizio", "Prossimo problema", "Riga scelta: 3 «…»", "Dal foglio fotografato: …").

### Task 2: Events and reducer

**Files:** Create `src/main/practice/events.ts`; Test `tests/unit/practice-events.test.ts`

**Produces:** `PracticeEvent` = `created { id, mode:'train'|'exam', material: Material, durationMin?, at }` | `learner { submission, text, at }` | `tutor { turn, conversationId?, at }` | `error { message, at }` | `exam { sheet: ExamSheet, endsAt, at }` | `answers { answers: Record<string,string>, final: boolean, at }` | `graded { grade: ExamGrade, at }`; `reducePractice(events): PracticeState` with `items` (chat), `problems: { id, statement, mode, targets, lines?, status:'active'|'done', hints: number, maxRung: number|null, outcome?, verdict?, modelSolution? (only once done), phase }[]`, `active?: id`, `phase`, `awaiting: 'tutor'|'learner'|'retry'`, `paused` (true after a conclude until `next`), exam fields (`sheet` without solutions until graded, `endsAt`, `answers`, `grade`), `topic` (summary of material for lists). `PracticeSummary` for the home list.

### Task 3: Material

**Files:** Create `src/shared/practice-types.ts` (Material, Catalog types), `src/main/practice/material.ts`; Test `tests/unit/practice-material.test.ts`

**Produces:** `Material = { conceptIds: string[]; sourceIds: string[]; free: string }`; `catalog({ graph, memory, practiced, vault, notebooks })` → `{ subjects: { name, notes: { path, title, concepts: { id, name, R: number|null, due: boolean, practiced: boolean }[] }[] }[], sources: { id, title, kind, notebook, info }[], suggested: { id, name, why }[] }` — suggested: 2 due (lowest R, why `da ripassare · NN%`), 2 weakest not due (`NN% memoria`), 1 never practiced with R ≥ 0.4 (`mai praticato`); `matchConcepts(catalog, text)` (accent-insensitive word match on concept names and note titles, words > 2 chars, filler "tutto/la/il" dropped); `buildMaterialContext({ material, graph, readNote, notebookText })` → Italian text: picked concepts `id | nome | enunciato`, chains among them, birth-note text (each capped 12 000, total 40 000), source excerpts (total 40 000), free text as "Argomento o problema portato da Andrea"; `practiced` set derived from practice logs.

### Task 4: Training runner

**Files:** Create `src/main/practice/prompt.ts`, `src/main/practice/runner.ts`, `src/main/practice/fake-tutor.ts`; Modify `src/shared/memory-types.ts` (`via?: 'review'|'practice'` on ReviewLine); Test `tests/unit/practice-runner.test.ts`

**Produces:** `PRACTICE_SYSTEM_PROMPT` (Italian adaptation of LH 00-base + 10-doctrine, mapped to the JSON protocol: pose via `problem` with modelSolution solved before posing; one rung per hint request; claimed answers → verdict in blocks, no conclude until solved or surrendered; conclude ends the turn; pause until "Prossimo problema"; arc warm-up 1–3 recall → interleaved body → retest every miss/hint-heavy/surrendered in a fresh surface → `done` with summary; never announce the target; never beyond the material). `createPracticeRunner({ bridge, dir, material: (m) => Promise<string>, memory: MemoryStore, onUpdate, now?, uuid? })` → `{ create(material, mode:'train'), submit(id, s: Submission), retry(id), get(id), list() }` mirroring the session runner (serial per id, inflight → 'retry' on reload, fresh conversation id after a failed first turn); validates each turn with `checkTurnAgainst` (invalid → one corrective resume, then error); on `conclude` with targets appends a review line per target: solved → 3, solved_hints → 2 (maxRung ≤ 2) or 1 (≥ 3), surrendered/dismissed → 1, `via:'practice'`. `dismiss` is recorded as conclude outcome surrendered by the app. Fake tutor: scripted turns (pose with lines → hint R1 → conclude solved → next pose → done).

### Task 5: Exam

**Files:** Create `src/main/practice/exam.ts`; Test `tests/unit/practice-exam.test.ts`

**Produces:** `ExamSheetSchema` `{ title, problems: { id, statement, points, targets: string[], modelSolution }[] }` (points sum 30 → normalized), `ExamGradeSchema` `{ items: { id, points, comment, miss? }[], note }`; `createExam(...)` in the runner: `startExam(material, durationMin)` → one ask (task `teach`, timeout 300 000) with the material and duration → `exam` event with `endsAt = now + duration`; `saveAnswers(id, answers)` (draft, not final); `deliver(id, answers)` → final answers + one grade ask → `graded` (total = sum of points, rounded, out of 30; "30 e lode" when all full and total 30) + review lines for targets (full points → 3, ≥ half → 2, else 1); delivering twice is a no-op; a grading failure leaves the answers final with an error and Riprova.

### Task 6: Photo of the sheet

**Files:** Create `src/main/practice/photo.ts`; Modify `src/main/ai/engines.ts`, `src/main/ai/bridge.ts` (`readOnly?: boolean` → claude `--tools Read --allowedTools Read --strict-mcp-config --setting-sources ''`); Test `tests/unit/practice-photo.test.ts`

**Produces:** `transcribePhoto({ bridge, dir, bytes: Uint8Array, ext: 'jpg'|'png'|'heic' })` → saves `foglio-<n>.<ext>` in `dir`, asks (task `grade`, readOnly, cwd = dir, timeout 120 000) to transcribe the sheet in text + LaTeX, schema `{ readable: boolean, text: string }`; unreadable → error "Non riesco a leggere il foglio: rifai la foto più da vicino e con più luce."; size limit 15 MB.

### Task 7: IPC, preload, API

**Files:** Modify `src/shared/api.ts`, `src/preload/index.ts`, `src/main/ipc.ts`, `src/main/ipc-handlers.ts`, `electron-builder` config (`extendInfo.NSCameraUsageDescription`); Test `tests/unit/ipc-practice.test.ts`

**Produces:** channels `practice:catalog|create|submit|retry|get|list|exam-start|exam-save|exam-deliver|photo|updated`; `makePracticeHandlers` validating Material (≤ 200 concept ids, ≤ 100 source uuids, free ≤ 20 000), Submission, duration 5–300, answers (≤ 50 entries, ≤ 20 000 chars each), photo bytes ≤ 15 MB and ext. Camera permission requested in main (`systemPreferences.askForMediaAccess('camera')`) through `practice:camera`.

### Task 8: Interface

**Files:** Create `src/renderer/src/practice/{PracticeSetup,MaterialDialog,PracticeView,ProblemDock,ExamView,PhotoButton,Arc}.tsx`, `practice.css`; Modify `App.tsx`, `Home.tsx`, `Composer.tsx` (Pratica opens the setup with the typed text), `LeftPanel.tsx` (practice sessions in the list with the Pratica filter); Test `tests/unit/practice-view.test.tsx`

- Setup (prototype): "Su cosa ti alleni oggi?", Materiale head with summary (`N concetti · M fonti · ~X min`), Scelti chips with ×, Suggeriti per oggi with reasons (first two pre-selected), toast after free-text match, "Scegli…" dialog (tabs Concetti / Fonti, search, filters Più deboli / In scadenza / Mai praticati, tree materia → nota → concetti with memory bar and group checkboxes, Selezionati list, Svuota, Conferma, Esc restores), modes radiogroup Allenamento / Simulazione d'esame, exam options (30/60/90/Altro… with −/+ 5 and input 5–300; rules "niente indizi", "niente correzione durante"), free field, button "Inizia allenamento" / "Inizia simulazione · N min".
- Training: header with phase and Termina; chat log (tutor blocks, problem cards, hint messages with rung chip, verdicts, conclude card with outcome chip, verdict, Soluzione di riferimento, meta "Modo: … · aiuto massimo: R…"), dock: active problem → statement, lines (spot the error) as toggle buttons, "Il tuo ragionamento" textarea, Foto del foglio, Dammi un indizio, Invia (↵); pause → "Domande su questo problema?" + Prossimo problema; arc side panel (Riscaldamento / Corpo / Ritest with items and chips).
- Exam: timer (mm:ss, red under 5 min), problems with points, answer textarea + photo per problem, autosave every 10 s, Consegna (confirm), auto-deliver at 0; results: voto `NN/30` (or "30 e lode"), per problem points/comment/solution, "Ritesta gli errori in allenamento" (new training with the missed targets).
- PhotoButton: camera dialog (device list, iPhone first when present, Scatta), "Scegli un'immagine…", then the transcription in an editable field "Letto dal foglio — controlla e correggi", Usa questo testo.

### Task 9: e2e, live, README

`tests/e2e/practice.spec.ts` (fake tutor: setup → training problem → hint → solve → conclude card → next; exam 5 min → answers → deliver → grade); `tests/live/practice-live.test.ts` (real Claude: first training turn poses a problem with modelSolution and no target in the statement; hint request returns a rung; exam sheet + grading; photo transcription of a rendered sheet); README "Pratica".
