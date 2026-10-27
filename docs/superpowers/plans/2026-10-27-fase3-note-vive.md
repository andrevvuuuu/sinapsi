# Sinapsi Fase 3 — Note vive — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From an Obsidian note (and optionally a finished learning session) Gemini writes a *nota viva* as structured JSON; the app shows it as a full study page with interactive figures (sliders, draggable points, "diventa verde", "Mostra i punti"), scroll-driven proofs, quizzes, flashcards, "Prima prova tu", exercises, glossary, flags and session annotations.

**Architecture:** Generation is one `bridge.ask` call (task `note`, engine `agy`) whose prompt describes the format in TypeScript-like text (spike 27/10: `agy --json-schema` is **not** enforced and makes the agent try tools; a format described in the prompt is followed exactly, 6 s with flash-low). The reply is parsed **leniently**: each block is validated on its own and invalid ones are dropped (counted), so one bad figure never loses the note. Figures are declarative: expressions in a tiny safe expression language compiled by the app (never `eval`), drawn by the app's SVG figure engine. Notes are stored as `notes/<id>.json`; generation runs in the background with status pushed to the window.

**Tech Stack:** existing (Electron, React 19, zod 4, marked + DOMPurify + KaTeX via `RichText`, vitest, Playwright). No new dependencies.

**Spec:** `docs/design.md` (§2 "Dopo la sessione", "Nota viva"; §3 "Nota viva: formato") and the approved prototype `docs/prototipi/nota-v7.html` (built from the real note "Teorema di Lagrange del Valor Medio"; user: "tutto perfetto", plus the "Mostra i punti" button on every figure where something turns green).

## Global Constraints

- All UI copy and all generated content in Italian. Math `$…$` / `$$…$$` rendered with KaTeX through the existing `RichText` (sanitized). No model-provided HTML is ever executed.
- The nota viva is based on the Obsidian note: **same sections, same order, same titles**; content is never silently corrected — doubtful points become `flag` blocks ("Segnalato, non cambiato"). The app never writes into the vault; "Copia la correzione" copies text to the clipboard.
- Obsidian note text in the prompt capped at 60 000 chars with `[…nota troncata]` (same as phase 2).
- Task `note` default engine becomes `{ engine: 'agy', model: 'gemini-3.8-flash-medium' }` (Task 9 live run may change the model by ruling). agy calls always add `--disable-slash-commands`; `--print-timeout` = `max(30, floor(timeoutMs/1000) − 10)` s; cwd = `<dataDir>/ai-work` (empty folder, so the agent has nothing to read). Note generation timeout 480 000 ms.
- Figures: every slider, draggable point and button reachable by keyboard; draggable points are `role="slider"` with arrow keys; 44 px targets; captions in `aria-live="polite"`; no animation when `prefers-reduced-motion`.
- Visual language from the prototype (`bezel` cards, Instrument Serif headings with `<em>`, tokens from `styles/tokens.css`; colours `accent`, `good` = green, `warn`, `bad`, `muted`, `ink`). Copy the needed CSS from the prototype into `src/renderer/src/nota/nota.css`, adapted to the tokens.
- Test seam: env `SINAPSI_FAKE_NOTE=1` makes main use a scripted fake generator (e2e only).
- Ids: note id = UUID v4; stored at `<dataDir>/notes/<id>.json`.

## Review Focus

1. **Gemini returns a block of unknown type, or a figure with an expression that does not compile** → that block is dropped, the rest of the note renders, provenance shows "N blocchi scartati". Test in Task 2.
2. **Expressions that blow up** (`1/x` at 0, `ln(x)` for x ≤ 0, `sqrt` of negatives, `tan` asymptotes) → curve breaks into pieces, no vertical line joining the asymptote, readouts show "—", nothing throws. Test in Task 6.
3. **App quit while a note is generating** → on restart the note shows "Generazione interrotta" with "Riprova", no infinite spinner. Test in Task 5.
4. **IPC asks to generate from a path not in the vault index** (or an iCloud placeholder) → rejected with a clear error; no arbitrary file is read. Test in Task 5.
5. **A figure whose "Mostra i punti" condition has no root, or roots at the range ends / tangency (double roots)** → "Nessun punto in questo intervallo" or the tangency found via sign-free minimum search; buttons jump the slider to each point. Test in Task 6.

---

### Task 1: Safe expression language

**Files:** Create `src/shared/expr.ts`; Test `tests/unit/expr.test.ts`.

**Interfaces — Produces:**
- `compileExpr(src: string, known: { vars: string[]; fns: string[] }): CompiledExpr` — throws `ExprError` (Italian message with position) on syntax errors or unknown identifiers.
- `CompiledExpr = { eval(scope: Scope): number; src: string }`; `Scope = { vars: Record<string, number>; fns: Record<string, (x: number) => number> }`.
- Grammar: numbers (`1.5`, `2e-3`), identifiers, `+ - * / ^` (right-assoc `^`, unary minus binds looser than `^`: `-x^2 = -(x^2)`), parentheses, implicit multiplication **not** supported, comparison not supported. Built-ins: `sin cos tan asin acos atan exp ln log` (log = base 10) `sqrt abs sign floor min max` (min/max 2 args), constants `pi`, `e`. User functions from `known.fns` are callable as `f(expr)` and their derivative as `f'(expr)` (central difference, h = 1e-5).
- Evaluation never throws: domain errors give `NaN`/`±Infinity`.

- [ ] Step 1: Failing tests — `x^3/4 - x + 3/2` at x=2 → 1.5; `-x^2` at 3 → −9; `2^3^2` → 512; `f'(1)` with f = x² → 2 (±1e-6); `max(1, x)`; `pi`; `ln(-1)` → NaN; `1/0` → Infinity; unknown `y` → ExprError mentioning "y"; `2x` → ExprError; `sin(` → ExprError; `constructor`, `__proto__`, `process` rejected as unknown.
- [ ] Step 2: `npm test -- expr` → FAIL. Step 3: implement (recursive-descent parser → closure tree). Step 4: PASS. Step 5: commit `feat(nota): safe expression language`.

### Task 2: Nota viva format and lenient parsing

**Files:** Create `src/shared/nota-schema.ts`; Test `tests/unit/nota-schema.test.ts`.

**Interfaces — Consumes:** `compileExpr` (Task 1). **Produces** (zod schemas + inferred types):
- `Color = 'accent'|'good'|'warn'|'bad'|'muted'|'ink'`.
- `FigParam = { id; label; min; max; step; value }` (0–3 per figure; label may contain `$…$`).
- `FigElement` (field `kind`): `curve {fn, color?, label?, dashed?}` · `point {x, y, color?, label?, drag?: paramId}` · `segment {x1, y1, x2, y2, color?, dashed?}` · `line {x, y, slope, color?, dashed?}` (through (x,y)) · `vline {x, color?}` · `hline {y, color?}` · `label {x, y, text}`; any element may have `greenWhen?: expr` (≈ 0 ⇒ drawn in `good`) and `steps?: number[]` (proof steps where it is visible). All coordinates are expression strings.
- `Figure = { type:'figure'; title; caption?; x: [min,max]; y: [min,max]; functions: Record<name, expr in x>; params: FigParam[]; elements: FigElement[]; readouts?: {label, expr}[]; points?: { label; param; expr; at?: fnName }; stepParams?: Record<paramId, number>[] }`.
- `Block` (field `type`): `prose {md, sources?: string[]}` · `theorem {label, md}` · `decode {formal, read, meaning}` · `proof {steps: {kicker?, title, md, tryPrompt?}[] (1–12), figure?: Figure}` · `figure` · `quiz {prompt, options (2–6), correct, why (same length), fromNote?: boolean}` · `flashcard {q, a}` · `tryit {prompt, solution}` · `exercise {level: 'svolto'|'completa'|'solo'|'esame', title, steps: string[]}` (in `completa` steps, `{{a|*b|c}}` is an inline choice, `*` marks the right one) · `glossary {rows: {symbol, read, meaning}[]}` · `flag {md, correction?}` · `session {kind: 'previsione'|'parole'|'errore', md}` · `why {title, md}` · `tabs {tabs: {label, blocks: Block[] (no nested tabs)}[]}`.
- `Section = { id; num; title; titleEm?; blocks: Block[] }`; `Nota = { title; titleEm?; eyebrow; aka: string[]; lede; tldr: string[] (1–4); provenance: { fromNote: string[]; added: string[]; flagged: string[] }; sections: Section[] (1–30); recap: { ideas: string[]; formulas: {label, tex}[] } }`.
- `parseNota(raw: unknown): { nota: Nota; dropped: number }` — throws `ZodError` only when the top level (title, sections array…) is unusable; each block is validated alone (blocks inside `tabs` too), figures additionally checked: every expression compiles against `vars = ['x', ...param ids]`, `fns = function names`; `drag`, `points.param` and `stepParams` keys name existing params; `points.at` names a function; invalid blocks are dropped and counted; a section left with zero blocks is kept (title only). Section ids are re-slugged to unique `s1…sN` when missing or duplicated.
- `NOTA_FORMAT: string` — the TypeScript-like description of the format used in the prompt (Task 4), kept next to the schema so they change together; `NotaSchema` is used by `bridge.ask` with `parseNota` as a `z.custom` wrapper.

- [ ] Step 1: Failing tests — fixture `tests/fixtures/nota-min.json` (2 sections: prose, theorem, quiz, figure with param + draggable point + `points`, proof with figure `stepParams`) parses with `dropped: 0`; a block `{type:'video'}` dropped → `dropped: 1` and the other blocks kept; a figure with `functions.f = "x^^2"` dropped; a figure whose point `drag: 'q'` names no param dropped; quiz with `why` shorter than options dropped; nested tabs dropped; missing `sections` throws; duplicate section ids become unique.
- [ ] Step 2: FAIL. Step 3: implement. Step 4: PASS. Step 5: commit `feat(nota): nota viva format and lenient parsing`.

### Task 3: Bridge options for long generation

**Files:** Modify `src/main/ai/engines.ts`, `src/main/ai/bridge.ts`, `src/shared/settings-schema.ts`; Test `tests/unit/ai-bridge.test.ts` (add cases).

**Interfaces — Produces:**
- `CallOptions` gains `timeoutMs?: number`; agy args: `--print-timeout <max(30, floor(timeoutMs/1000) − 10)>s` (default 180 000 → `170s`, unchanged) and always `--disable-slash-commands`.
- `AskRequest` gains `cwd?: string` (passed to spawn).
- `DEFAULT_ENGINES.note = { engine: 'agy', model: 'gemini-3.8-flash-medium' }`.

- [ ] Step 1: Failing tests — ask with `timeoutMs: 480000` on agy → args contain `--print-timeout`, `470s` and `--disable-slash-commands`; default timeout keeps `170s`; `cwd` reaches the fake spawn; `DEFAULT_ENGINES.note.model === 'gemini-3.8-flash-medium'`.
- [ ] Step 2: FAIL. Step 3: implement. Step 4: whole suite PASS. Step 5: commit `feat(ai): long generation options for agy`.

### Task 4: Note prompt and session digest

**Files:** Create `src/main/notes/prompt.ts`; Test `tests/unit/note-prompt.test.ts`. Modify `src/main/session/events.ts` (`SessionState.notePath?: string`, set from `created`).

**Interfaces — Consumes:** `NOTA_FORMAT` (Task 2), `SessionState`. **Produces:**
- `sessionDigest(s: SessionState): string` — Italian lines for the session layer: topic; each answered question as `previsione` (role predict) / `errore` (choice wrong with confidence ≥ 70, or teacher said wrong for open) / `parole` (learner free text and "Il tuo ragionamento", max 300 chars each); final summary (Hai imparato / Ancora incerto / Misconcezioni). Max 8 000 chars.
- `buildNotePrompt(input: { noteTitle: string; noteText: string; session?: SessionState }): string` — sections in order: role ("Sei l'autore delle note vive di Sinapsi per Andrea…"), rules (keep the note's sections/order/titles; don't correct silently → `flag` with `correction`; turn the note's own quizzes/flashcards ("Palestra") into `quiz`/`flashcard` placed next to the right section with `fromNote: true`; a figure only where it helps understanding, at most one per section, with `points` whenever something turns green; proofs as `proof` with `tryPrompt` on steps; exercises in increasing difficulty svolto → completa → solo; session annotations only from the digest, never invented; Italian; LaTeX), `NOTA_FORMAT`, the note text (capped 60 000 with marker), the digest if any, and the final instruction "Non usare strumenti né file. Rispondi solo con l'oggetto JSON."

- [ ] Step 1: Failing tests — prompt contains the note title, `NOTA_FORMAT`, "Non usare strumenti"; 70 000-char note truncated with `[…nota troncata]`; without session no "Sessione" section; digest on a fake SessionState: wrong choice at confidence 80 → line starting `errore:`, predict answer → `previsione:`, reasoning text → `parole:`, summary lists present; digest capped at 8 000.
- [ ] Step 2: FAIL. Step 3: implement. Step 4: PASS. Step 5: commit `feat(nota): generation prompt and session digest`.

### Task 5: Notes store, generator jobs, IPC

**Files:** Create `src/main/notes/store.ts`, `src/main/notes/generator.ts`, `src/main/notes/fake-note.ts`; Modify `src/main/ipc.ts`, `src/main/ipc-handlers.ts`, `src/shared/api.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`; Test `tests/unit/notes-generator.test.ts`, `tests/unit/ipc-notes.test.ts`.

**Interfaces — Consumes:** `Bridge.ask`, `parseNota`, `buildNotePrompt`, runner `get(id)`. **Produces:**
- Stored file `StoredNote = { id; createdAt; updatedAt; status: 'generating'|'ready'|'error'; error?: string; sourcePath: string; sourceTitle: string; sessionId?: string; engine?: Engine; dropped?: number; nota?: Nota }`; written atomically (tmp + rename).
- `NoteMeta = Omit<StoredNote, 'nota'> & { title: string }` (title = nota title or sourceTitle).
- `createNoteGenerator(deps: { bridge: Pick<Bridge,'ask'>; dir: string; workDir: string; vault: () => Promise<VaultIndex|null>; readNote: (p: string) => Promise<string>; session: (id: string) => Promise<SessionState|null>; onUpdate: (m: NoteMeta) => void })` → `{ create(req: { sourcePath?: string; sessionId?: string }): Promise<string>; retry(id): Promise<void>; list(): Promise<NoteMeta[]>; get(id): Promise<StoredNote> }`.
  - `create`: `sourcePath` given → must equal the `path` of an **available** note in the vault index, else throws "Nota non trovata nel vault"; only `sessionId` → uses the session's `notePath`, else throws "La sessione non è collegata a una nota del vault". Writes `generating`, returns id, generation runs in background (`ask({ task:'note', prompt, schema: NotaSchema, timeoutMs: 480000, cwd: workDir })`), then `ready` (+ `dropped`) or `error` with the friendly messages used by the session runner.
  - `list`: newest first; a `generating` file with no running job in this process is reported (and rewritten) as `error: 'Generazione interrotta. Riprova.'`.
  - `retry(id)`: re-runs generation for an `error` note with the same source/session.
- `fakeNoteBridge()` (fake-note.ts): `ask` returns the content of `tests/fixtures/nota-min.json` shape embedded as a constant after 300 ms.
- IPC `CH.notesCreate 'notes:create'`, `notesList`, `notesGet`, `notesRetry`, `notesUpdated 'notes:updated'`; preload `notes: { create(req); list(); get(id); retry(id); onUpdate(cb) }`; handlers validate `sourcePath` string ≤ 1024, `sessionId`/`id` UUID.

- [ ] Step 1: Failing tests (temp dir, fake bridge) — create from a vault note → file `generating` then `ready` with `nota.title`; ask called with task `note`, timeout 480000, cwd = workDir; path not in index → rejects "Nota non trovata nel vault"; unavailable note rejected; from session without notePath rejects; bridge throws `AiTimeoutError` → status `error`, message mentions "tempo"; stale `generating` file → list reports "Generazione interrotta. Riprova."; retry turns error into ready; `onUpdate` called for each status; IPC handlers reject non-UUID ids.
- [ ] Step 2: FAIL. Step 3: implement + wire IPC (`SINAPSI_FAKE_NOTE=1` → `fakeNoteBridge()`). Step 4: PASS + typecheck. Step 5: commit `feat(nota): note store and background generation`.

### Task 6: Figure engine

**Files:** Create `src/renderer/src/nota/figure/plot.ts` (pure), `src/renderer/src/nota/figure/FigureView.tsx`; Test `tests/unit/plot.test.ts`, `tests/unit/figure-view.test.tsx`.

**Interfaces — Consumes:** `Figure`, `compileExpr`. **Produces:**
- `makeScope(fig: Figure, params: Record<string, number>): Scope` (compiled functions closed over params).
- `samplePath(fn, [x0,x1], [y0,y1], toPx, n = 400): string` — SVG path `M…L…`; starts a new subpath when a value is non-finite or when two consecutive samples jump more than 2× the y-range (asymptote).
- `findRoots(g, [a,b], n = 400): number[]` — sign changes refined by bisection (1e-9) **plus** local minima of |g| below 1e-6·scale (tangency), deduplicated within (b−a)/n, sorted.
- `fmt(v: number, d = 2): string` — Italian decimal comma, `−` minus, non-finite → "—".
- `FigureView({ fig, step? }: { fig: Figure; step?: number })` — SVG 640×300 viewBox with axes; renders elements (hidden when `steps` excludes `step`); sliders per param (`<input type=range>` labelled with `RichText`); draggable points (pointer drag maps to param, `role="slider"`, `aria-valuenow`, arrow keys move by `step`); `greenWhen` recolours to `good` and the caption announces "Diventa verde"; readouts with `fmt`; when `points` exists a chip "Mostra i punti" (aria-pressed) showing found values as buttons (`x ≈ 0,58`) that set the param, or "Nessun punto in questo intervallo"; `stepParams[step]` animates params (300 ms, instant with reduced motion).

- [ ] Step 1: Failing tests — `samplePath` of `1/x` on [−2,2] contains two `M`; `ln(x)` on [−1,2] starts at x>0; `findRoots(x²−1)` → [−1, 1]; `findRoots((x−1)²)` → [1] (tangency); no roots → []; `fmt(-0.5)` → "−0,50", `fmt(NaN)` → "—"; FigureView: slider change updates readout text; ArrowRight on the draggable point increases `aria-valuenow` by step; a `greenWhen` met at the initial value gives the element class `good`; "Mostra i punti" lists `x ≈ 1,00` and clicking it moves the slider value to 1.
- [ ] Step 2: FAIL. Step 3: implement. Step 4: PASS. Step 5: commit `feat(nota): declarative figure engine`.

### Task 7: Block components and scroll-driven proof

**Files:** Create `src/renderer/src/nota/blocks/*.tsx` (one file per family: `TextBlocks.tsx` for prose/theorem/why/flag/session, `Decode.tsx`, `Proof.tsx`, `Quiz.tsx` (quiz + flashcard), `Practice.tsx` (tryit + exercise), `Glossary.tsx`, `Tabs.tsx`), `src/renderer/src/nota/BlockView.tsx` (switch on `type`), `src/renderer/src/nota/nota.css`; Test `tests/unit/nota-blocks.test.tsx`.

**Interfaces — Consumes:** `Block`, `FigureView`, `RichText`. **Produces:** `BlockView({ block, mode }: { block: Block; mode: 'leggi'|'prova' })`; `NotaContext = { layers: { sessione: boolean; quiz: boolean; fonti: boolean } }`.
- Quiz: options `A…F` buttons; wrong → that option disabled + its `why`; right → all disabled + `why`, feedback `role="status"`. Flashcard: "Mostra risposta" then "Lo sapevo" / "Non lo sapevo" (local only in this phase). TryIt / proof steps with `tryPrompt` / exercise `solo`: in mode `prova` the solution is covered by a textarea + "Ho provato, mostra"; in `leggi` it is shown (tryit/proof) — exercise `solo` is always covered. Exercise `completa`: `{{…}}` rendered as `<select>` with "…" placeholder; feedback "Giusto" / "Rivedi questo passo" per select. Glossary: "Copri i significati e prova a dirli" toggle hides the meaning column (cells focusable to reveal). Flag: "Copia la correzione per Obsidian" → `navigator.clipboard.writeText(correction ?? md)` + "Copiata" status. Session blocks hidden when layer `sessione` off; quiz/flashcard hidden when `quiz` off; `sources` chips hidden when `fonti` off. Decode and Tabs: ARIA tabs with arrow-key navigation.
- Proof: steps as articles; an IntersectionObserver (threshold 0.6, injectable for tests via `observe` prop) sets the active step; sticky figure `FigureView step={active}`; chain buttons under the figure jump (scrollIntoView) to a step and show `aria-current`.

- [ ] Step 1: Failing tests — quiz wrong then right flow and messages; flashcard reveal; tryit covered in `prova`, revealed after click; `completa` select right/wrong feedback; glossary cover toggle; flag copy calls clipboard with `correction`; session block absent when layer off; tabs ArrowRight moves selection; proof: simulated active step 2 marks chain button 3 `aria-current="step"` and passes `step=2` to the figure; prose with `<script>` rendered inert.
- [ ] Step 2: FAIL. Step 3: implement. Step 4: PASS. Step 5: commit `feat(nota): interactive blocks and scroll-driven proof`.

### Task 8: Nota page and entry points

**Files:** Create `src/renderer/src/nota/NotaView.tsx`, `src/renderer/src/nota/NotePicker.tsx` (state for an Obsidian note: list its notes vive, "Crea la nota viva", "Apri in Obsidian"); Modify `App.tsx` (views `nota {id}` and `source {path}`), `home/Home.tsx` + `LeftPanel.tsx` (clicking a tree note opens `source`; new list "Note vive" under sessions, max 8, with status dot), `session/SessionView.tsx` (summary card button "Crea la nota viva" when the session has `notePath`, then opens the note); Test `tests/unit/nota-view.test.tsx`.

**Interfaces — Consumes:** `api.notes.*`, `BlockView`. **Produces:** `NotaView({ id, onBack })`:
- generating → "Sto scrivendo la nota viva…" with source title and elapsed time; error → message + "Riprova"; ready → top bar (← Home, mode segmented "Leggi" / "Prova da solo", layer chips Sessione/Quiz/Fonti with aria-pressed), hero (eyebrow, h1 with `<em>`, aka chips, lede, origin chips: Obsidian note, session date if any), provenance `<details>` "Come è nata questa nota" (3 columns + "N blocchi scartati" when `dropped > 0`), "In tre righe", sticky TOC (desktop) / collapsible TOC (narrow), sections, recap ("Cosa ricordare": ideas, formulario).
- `NotePicker({ path, onOpenNota, onBack })`: title of the Obsidian note, its existing notes vive (newest first), primary "Crea la nota viva" (→ create → open), secondary "Apri in Obsidian".

- [ ] Step 1: Failing tests (mock `window.api`) — ready note renders title, tldr, all section headings in TOC, provenance "1 blocco scartato"; toggling "Prova da solo" covers a tryit; layer "Quiz" off hides quizzes; generating state text; error state "Riprova" calls `notes.retry`; NotePicker "Crea la nota viva" calls `notes.create({ sourcePath })` and opens the returned id; session summary shows the button only with `notePath`.
- [ ] Step 2: FAIL. Step 3: implement. Step 4: PASS + typecheck. Step 5: commit `feat(ui): nota viva page and entry points`.

### Task 9: End-to-end, live generation, packaging

**Files:** Create `tests/e2e/nota.spec.ts`; Modify `tests/live/ai-live.test.ts`; `README.md` (section "Note vive").

- [ ] Step 1: e2e (`SINAPSI_FAKE_NOTE=1`, fixture vault): open "Teorema di Rolle" from the tree → "Crea la nota viva" → page shows the fake note title, a figure slider changes a readout, "Mostra i punti" lists a point, quiz answer gives feedback, "Prova da solo" covers a step. Run `npm run build && npm run test:e2e` → PASS.
- [ ] Step 2: Live (`LIVE_AI=1`): generate a nota viva from the real vault note "Teorema di Lagrange del Valor Medio" through the real bridge; assert `parseNota` succeeds with ≥ 5 sections, section titles follow the Obsidian `##` headings in order, ≥ 1 figure and ≥ 1 quiz survive, `dropped` ≤ 20 % of blocks; record time and tokens in the ledger. If the model fails these, try `gemini-3.8-flash-high` then rule.
- [ ] Step 3: Save the live note into the real data dir and look at it in the built app (screenshot through Playwright of the packaged app) — figures render, no overlapping labels, both themes.
- [ ] Step 4: `npm test`, `npm run typecheck`, `npm run build:unpack`, packaged e2e → PASS. Commit `test(nota): e2e and live generation`.
