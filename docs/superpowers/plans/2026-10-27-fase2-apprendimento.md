# Sinapsi Fase 2 — Sessione di Apprendimento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From the home composer ("Apprendimento" + topic) open a chat-style learning session where Claude probes, presents a plan map, teaches with predict → explain → check cycles, and closes with a "svuota la testa" recall; sessions persist and can be resumed.

**Architecture:** The teacher is a multi-turn Claude Code conversation (`claude -p --session-id/--resume`, `--system-prompt`, `--json-schema`). Every teacher turn is a validated JSON `TeacherTurn` (blocks + optional plan + at most one question). Sessions are append-only JSONL event logs in `sessions/<id>.jsonl`; the UI state is derived by a pure reducer. If the topic matches an Obsidian note, its text is given to the teacher as Andrea's own material.

**Tech Stack:** existing (Electron, React, zod, vitest, Playwright) + `marked`, `dompurify`, `katex`.

**Spec:** `docs/design.md` (§2 "Sessione di Apprendimento", §3) and `docs/prototipi/proto-A-chat.html` (approved UI). Teaching doctrine adapted from Learn Harness prompts (`~/riferimenti/learnharness/src/agent/prompts/{prober,teacher,shared}`), read-only reference.

## Global Constraints

- All UI copy and all teacher output in Italian. Teacher voice: no praise, no hype, wrong answers named plainly (LH `10-voice.md`).
- One question per teacher turn, at most. Question roles: `goal` (ask what he wants), `probe`, `plan` (approve/modify plan), `predict` (shown open, before teaching), `check` (shown collapsed behind "Verifica la tua comprensione", after teaching), `recall` ("svuota la testa").
- Choice questions carry `correct` (index) and `why` (one explanation per option) so the UI grades instantly; open questions are graded by the teacher in the next turn.
- Every choice answer carries confidence 0–100 (step 10) or "Non lo so"; every answer may carry "Il tuo ragionamento".
- Math in teacher text: `$…$` inline, `$$…$$` display, rendered with KaTeX; markdown sanitized with DOMPurify. No raw HTML from the model is ever executed.
- Teacher engine = task `teach` from settings; default changes to `{ engine: 'claude', model: 'sonnet' }` (quota). Claude flags: `--disallowedTools "Bash Edit Write Read Glob Grep WebFetch WebSearch Task NotebookEdit"`, `--setting-sources ""`, cwd = `<dataDir>/sessions`.
- Sessions folder: `<dataDir>/sessions/<id>.jsonl`; `id` = UUID v4 (also used as the Claude session id).
- Obsidian note text sent to the teacher is capped at 60 000 characters.
- Test seam: env `SINAPSI_FAKE_TEACHER=1` makes main use a scripted fake teacher (for e2e only).

## Review Focus

1. **Teacher reply fails validation twice or the CLI errors mid-session** → an error message appears in the chat with a "Riprova" button that re-sends the same learner input; the session is not corrupted. Test in Task 4.
2. **App closed during a pending turn, then reopened** → session loads with the last learner input marked unanswered and "Riprova" available; no duplicated events. Test in Task 4.
3. **Model output containing HTML/script** (`<img onerror>`, `<script>`) → rendered inert. Test in Task 6.
4. **Choice question with `correct` out of range or `why` length mismatch** → turn rejected by the schema (retry path), never shown broken. Test in Task 1.
5. **Topic matching no note, or several notes** → no note (teacher proceeds without), or the best match by score; never a random pick. Test in Task 3.

---

### Task 1: Teacher protocol (schema + learner reply format)

**Files:** Create `src/shared/teacher-protocol.ts`; Test `tests/unit/teacher-protocol.test.ts`.

**Interfaces — Produces:**
- `Block = { type: 'text'; md: string }` (phase 2 has text only; figures arrive in phase 3).
- `PlanNode = { id: string; title: string; status: 'known' | 'todo' | 'goal' }`; `Plan = { nodes: PlanNode[]; edges: [string, string][] }` (`[from, to]` = from is needed for to).
- `Question = { id: string; role: 'goal'|'probe'|'plan'|'predict'|'check'|'recall'; kind: 'choice'|'open'; prompt: string; options?: string[]; correct?: number; why?: string[]; nodeId?: string }`.
- `TeacherTurn = { phase: 'probe'|'plan'|'teach'|'consolidate'|'done'; blocks: Block[]; plan?: Plan; question?: Question; summary?: { learned: string[]; shaky: string[]; misconceptions: string[] } }`.
- `TeacherTurnSchema` (zod) with refinements: choice ⇒ 2–6 options, `correct` in range, `why.length === options.length`; open ⇒ no options; `plan.edges` reference existing node ids; `phase: 'done'` ⇒ `summary` present and no question.
- `teacherJsonSchema(): object` — JSON Schema for the CLI `--json-schema` (from `z.toJSONSchema`, structural only).
- `LearnerAnswer = { questionId: string; choice?: number; dontKnow?: boolean; confidence?: number; text?: string; thoughts?: string }`.
- `formatLearnerReply(q: Question, a: LearnerAnswer): string` — Italian, e.g. `Risposta alla domanda q3 (verifica): B «…» — sbagliata (giusta: A) — fiducia 80% — ragionamento: … — pensieri durante la lettura: …`; role names: goal "obiettivo", probe "misura", plan "piano", predict "previsione", check "verifica", recall "svuota la testa".

- [ ] Step 1: Failing tests — valid probe turn parses; choice with `correct: 4` and 4 options rejected; `why` length mismatch rejected; edge to unknown node rejected; `done` without summary rejected; `teacherJsonSchema()` has `type: 'object'` and `properties.blocks`; `formatLearnerReply` exact strings for a correct choice with confidence, a "Non lo so", and an open answer with thoughts.
- [ ] Step 2: `npm test` → FAIL. Step 3: implement. Step 4: `npm test` → PASS. Step 5: commit `feat(session): teacher protocol`.

### Task 2: Conversation support in the AI bridge

**Files:** Modify `src/main/ai/engines.ts`, `src/main/ai/bridge.ts`, `src/shared/settings-schema.ts` (teach default `{engine:'claude', model:'sonnet'}`); Test `tests/unit/ai-converse.test.ts`.

**Interfaces — Produces:**
- `buildArgs(engine, prompt, opts: { model?: string; conversation?: { id: string; resume: boolean }; systemPrompt?: string; jsonSchema?: object })`:
  - claude: `-p prompt --output-format json [--model m] [--session-id id | --resume id] [--system-prompt s] [--json-schema JSON] --disallowedTools "<list from Global Constraints>" --setting-sources ""` (the last two only when `conversation` is set).
  - agy: `-p (systemPrompt ? systemPrompt + "\n\n" + prompt : prompt) --output-format json --print-timeout 170s [--model m] [--conversation id when resume] [--json-schema JSON]`.
- `parseOutput` additionally returns `conversationId?: string` (claude `session_id`, agy `conversation_id`) and, for claude, prefers `structured_output` (stringified) over `result` when present.
- `Bridge.converse<T>(req: { task: Task; conversationId: string; resume: boolean; systemPrompt?: string; prompt: string; schema: z.ZodType<T>; jsonSchema: object; cwd?: string; timeoutMs?: number }): Promise<{ data: T; conversationId: string; engine: Engine }>` — same queue, auth/timeout/usage handling and one schema retry as `ask` (retry uses `resume: true`), never cached. `SpawnFn` opts gain optional `cwd`.

- [ ] Step 1: Failing tests (fake spawn): first turn args contain `--session-id <id>`, `--system-prompt`, `--json-schema`, `--disallowedTools`; resumed turn contains `--resume <id>` and no `--system-prompt`; claude `structured_output` object is returned validated; agy resume uses `--conversation`; invalid first reply → retry sent with `--resume`; teach default model is `sonnet`.
- [ ] Step 2: FAIL. Step 3: implement. Step 4: PASS (whole suite). Step 5: live check `LIVE_AI=1` — add a live test doing two turns with a tiny schema; PASS. Step 6: commit `feat(ai): multi-turn conversations`.

### Task 3: Teacher prompt and note grounding

**Files:** Create `src/main/session/prompt.ts`, `src/main/session/note-match.ts`; Test `tests/unit/session-prompt.test.ts`.

**Interfaces — Produces:**
- `TEACHER_SYSTEM_PROMPT: string` — Italian adaptation of LH doctrine, sections: Chi è Andrea (studente di Scienze matematiche per l'IA; bodybuilding: fisiologia, nutrizione), Voce (from `10-voice.md`), Metodo (two principles from `05-method.md`), Fasi (goal → probe with binary search per strand → plan map presented and confirmed → teach predict/teach/check, one step at a time, repair on miss → consolidate with one `recall` question "scrivi tutto quello che ricordi, senza guardare" → done with summary), Domande (question principles + confidence reading from `30-question-principles.md`, `25-confidence.md`), Protocollo (exactly one JSON TeacherTurn per reply; at most one question; plan updates by re-sending `plan`; math in `$…$`; never repeat the plan in prose; Italian).
- `firstMessage(topic: string, note?: { title: string; text: string }): string` — topic + (if note) `Materiale di Andrea dalla sua nota Obsidian «title»:` + text capped at 60 000 chars with `[…nota troncata]` marker.
- `matchNote(index: VaultIndex, topic: string): VaultNote | null` — score = number of topic words (≥ 3 letters, lowercased, accents kept) found in title/aliases, exact title or alias match wins; ties broken by fewer words in title; returns null when best score is 0; ignores `available: false`.

- [ ] Step 1: Failing tests — `matchNote` on a fake index: "teorema di lagrange" → "Teorema di Lagrange del Valor Medio"; "Rolle" via alias; "fotosintesi" → null; unavailable notes ignored; `firstMessage` truncates a 70 000-char note with the marker; system prompt mentions the six roles and "JSON".
- [ ] Step 2: FAIL. Step 3: implement. Step 4: PASS. Step 5: commit `feat(session): teacher prompt and note grounding`.

### Task 4: Session store and runner

**Files:** Create `src/main/session/events.ts` (event types + `reduceSession`), `src/main/session/runner.ts`, `src/main/session/fake-teacher.ts`; Test `tests/unit/session-runner.test.ts`.

**Interfaces — Produces:**
- `SessionEvent = { t: 'created'; id; topic; noteTitle?: string; at } | { t: 'learner'; text: string; answer?: LearnerAnswer; at } | { t: 'teacher'; turn: TeacherTurn; at } | { t: 'error'; message: string; at }`.
- `SessionState = { id; topic; noteTitle?; phase; plan?: Plan; currentNodeId?: string; doneNodeIds: string[]; items: ChatItem[]; pendingQuestion?: Question; awaiting: 'teacher' | 'learner' | 'retry'; summary?; createdAt; updatedAt }` where `ChatItem = { kind: 'learner'; text: string; answer?: LearnerAnswer; question?: Question } | { kind: 'teacher'; turn: TeacherTurn } | { kind: 'error'; message: string }`.
- `reduceSession(events: SessionEvent[]): SessionState` — pure; `currentNodeId` = last question's `nodeId`; a node becomes done when a later question targets another node after a correct `check` on it; `awaiting` = `'teacher'` after a learner event with no later teacher/error, `'retry'` after an error, else `'learner'`.
- `createSessionRunner(deps: { bridge: Pick<Bridge,'converse'>; dir: string; vault: () => Promise<VaultIndex | null>; readNote: (path: string) => Promise<string>; onUpdate: (s: SessionState) => void; uuid?: () => string })` with `start(topic): Promise<string>`, `answer(id, a: LearnerAnswer): Promise<void>`, `say(id, text): Promise<void>` (free message, allowed only when no pending question or role is `plan`), `retry(id): Promise<void>`, `get(id): Promise<SessionState>`, `list(): Promise<{ id; topic; phase; updatedAt }[]>` (newest first). Turn flow: append learner event → `onUpdate` (awaiting teacher) → `converse` (first turn `resume:false` with system prompt; later `resume:true`) → append teacher or error event → `onUpdate`. Concurrent calls on the same session are serialized.
- `fakeTeacher`: a `converse` implementation returning a scripted sequence (goal → probe choice → plan → predict → teach + check → recall → done) used when `SINAPSI_FAKE_TEACHER=1`.

- [ ] Step 1: Failing tests — `reduceSession` derives phase, plan, pending question, done nodes, awaiting; runner with a fake bridge: `start` writes `created` + `learner` + `teacher`, first converse call has `resume:false` and the system prompt, second has `resume:true`; topic matching a vault note puts its title in `created` and its text in the first prompt; bridge rejecting → `error` event, `awaiting:'retry'`, then `retry` re-sends the same learner text and succeeds; reopening a log whose last event is `learner` gives `awaiting:'teacher'`→ treated as retry-able (`retry` works); two `answer` calls fired together produce ordered, non-interleaved events; `list` sorts by `updatedAt`.
- [ ] Step 2: FAIL. Step 3: implement. Step 4: PASS. Step 5: commit `feat(session): event log and runner`.

### Task 5: IPC for sessions

**Files:** Modify `src/shared/api.ts`, `src/main/ipc.ts`, `src/main/ipc-handlers.ts`, `src/preload/index.ts`; Test `tests/unit/ipc-session.test.ts`.

**Interfaces — Produces:** `SinapsiApi.session = { start(topic): Promise<string>; list(): Promise<SessionSummary[]>; get(id): Promise<SessionState>; answer(id, a): Promise<void>; say(id, text): Promise<void>; retry(id): Promise<void>; onUpdate(cb: (s: SessionState) => void): () => void }`. Handlers validate: topic 1–500 chars, id UUID, `LearnerAnswer` via zod (confidence 0–100), text 1–5000 chars. Runner wired in `registerIpc` (fake teacher when `SINAPSI_FAKE_TEACHER=1`); `runner` work is not awaited by the handler beyond appending the learner event (UI gets progress via `onUpdate`).

- [ ] Step 1: Failing tests — invalid id, empty topic, confidence 120 rejected; valid start returns an id. Step 2: FAIL. Step 3: implement. Step 4: PASS. Step 5: commit `feat(ipc): session API`.

### Task 6: Rich text rendering

**Files:** Create `src/renderer/src/session/RichText.tsx`, `src/renderer/src/session/render-md.ts`; add deps `marked dompurify katex`; Test `tests/unit/render-md.test.ts` (jsdom).

**Interfaces — Produces:** `renderMd(md: string): string` (math extracted first so markdown does not mangle it: `$$…$$` → KaTeX display, `$…$` → inline, `throwOnError:false`; then `marked`; then DOMPurify with KaTeX's tags/attrs allowed); `<RichText md={…} />` sets the sanitized HTML. KaTeX CSS imported from `katex/dist/katex.min.css`.

- [ ] Step 1: Failing tests — `$f'(c)=0$` produces `class="katex"`; `$$\int_a^b$$` produces `katex-display`; `**grassetto**` → `<strong>`; `<img src=x onerror=alert(1)>` and `<script>` are removed; underscores inside math are not turned into `<em>`. Step 2: FAIL. Step 3: implement. Step 4: PASS. Step 5: commit `feat(ui): markdown and math rendering`.

### Task 7: Session screen

Reference: `docs/prototipi/proto-A-chat.html` (layout, dock, invite, plan map, answer cards, typing indicator).

**Files:** Create `src/renderer/src/session/SessionView.tsx`, `QuestionDock.tsx`, `CheckInvite.tsx`, `PlanMap.tsx`, `AnswerCard.tsx`, `session.css`; Modify `src/renderer/src/App.tsx` (view state `{ view: 'home' } | { view: 'session'; id }`), `home/Home.tsx` (composer "Apprendimento" → `session.start` → open session; other modes keep the toast), `home/LeftPanel.tsx` (session list from `session.list`, filter Apprendimento/Entrambe shows them, click opens); Test `tests/unit/question-dock.test.tsx`, `tests/unit/session-view.test.tsx`.

**UI pinned by the prototype:** top bar (← Home, topic, phase chip Obiettivo/Misura/Piano/Insegnamento/Consolidamento/Conclusa, note chip "Dalla tua nota: …"); chat column (learner bubbles right, teacher blocks via RichText, answer cards with verdict chip Corretto/Sbagliato/Non lo so + fiducia + ragionamento + "Perché" details using `why`); typing indicator "Il tutor sta pensando…" while `awaiting:'teacher'`; error item with "Riprova"; right panel "Il piano" (nodes known = filled good, todo = hollow, goal = accent, current = "adesso", done = check); dock: `predict`/`probe`/`goal`/`recall` questions open; `check` questions behind the invite card ("Pensieri mentre leggi" textarea + button "Verifica la tua comprensione"); `plan` question = textarea + buttons "Approva il piano" (sends "Approvo il piano.") and "Chiedi una modifica"; choice = options A–F + "Non lo so" + Fiducia slider 0–100 step 10 + "Il tuo ragionamento"; open = textarea; Enter sends, Shift+Enter newline; when no question and not awaiting: free composer "Fai una domanda al tutor"; phase `done` shows the summary card (Hai imparato / Ancora incerto / Misconcezioni) and "Torna alla home".

- [ ] Step 1: Failing tests — QuestionDock choice: send disabled until an option is picked, "Non lo so" sends `{dontKnow:true}` without confidence, slider value sent as confidence; open question sends text; check question first shows the invite and only after clicking shows options, sending `thoughts`; SessionView with a reduced state renders teacher text, plan nodes, the error "Riprova" calls `session.retry`, typing indicator when awaiting teacher.
- [ ] Step 2: FAIL. Step 3: implement. Step 4: PASS. Step 5: commit `feat(ui): learning session screen`.

### Task 8: End-to-end and live run

**Files:** Create `tests/e2e/session.spec.ts`; Modify `tests/live/ai-live.test.ts`.

- [ ] Step 1: E2E with `SINAPSI_FAKE_TEACHER=1`: home → type "Teorema di Lagrange" with Apprendimento → session opens with chip "Dalla tua nota: Teorema di Lagrange" (fixture vault) → answer goal (open) → probe (choice + confidence) → approve plan (plan map shows nodes) → predict → open invite, answer check → recall → summary visible → back home lists the session; screenshot `test-results/session.png`. `npm run build && npx playwright test` → PASS.
- [ ] Step 2: Live (`LIVE_AI=1`): real runner with Claude on topic "Teorema di Rolle" for two turns (start + answer the first question); both teacher turns validate against `TeacherTurnSchema`. PASS.
- [ ] Step 3: `npm run dist`; packaged e2e (home spec) PASS. Commit `test: session e2e and live run`.
