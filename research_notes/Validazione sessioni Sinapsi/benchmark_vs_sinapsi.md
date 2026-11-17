# Benchmark patterns (Obsidian note + DeepTutor/TutorBench) vs Sinapsi codebase

Scope: the note `Obsidian Vault/Psicologia/funzionamento delle sessioni di apprendimento.md` (sections 1–4 = a pedagogical doctrine; sections 5–6 = the DeepTutor framework) mapped against the Sinapsi repo at branch `feat/ui-fixes-r5` (`b389b16`, plus uncommitted changes). All code references are `path:line` in `/Users/andreaantonelli/Progetti/Sinapsi`. Repo and vault were read only. No AI CLI was run. Latency numbers come from the app's own local log `~/Library/Application Support/Sinapsi/ai-usage.jsonl` and `sessions/*.jsonl`, read locally.

Method note: no web-search tool was available. External checks were done with direct fetches of the GitHub API, the arXiv API and the arXiv HTML (v1, v2, v3) of 2604.26962.

---

## Q0. Pattern-by-pattern comparison (core objective)

### Takeaway
Most of the doctrine in sections 1–4 is **already in Sinapsi's tutor system prompt**, nearly word for word (`src/main/session/prompt.ts:23-40`). The real gaps are elsewhere. Nothing in code grounds or enforces the doctrine: the plan is not tied to the concept graph, the session never writes evidence back to memory, and no cross-session weakness profile exists. DeepTutor's useful core is a closed loop: weaknesses feed practice, and outcomes feed the profile. Sinapsi can get that with zero extra LLM calls. DeepTutor's multi-agent pipelines, vector stores and memory agents would multiply CLI calls and should be rejected.

### Cited Findings (comparison table)

Gap size: **0** = already done, **S** = small, **M** = medium, **L** = large.

| # | Benchmark pattern | (a) What it prescribes | (b) What Sinapsi does (evidence) | (c) Gap | (d) Verdict |
|---|---|---|---|---|---|
| 1 | Current vs Goal Understanding + Probing phase | Probe both the frontier of what is known and the goal before teaching (note §1). | The prompt has "Obiettivo" (goal question) and "Misura" phases: binary search per strand, enter high, misconceptions first (`prompt.ts:30-31`). The FSRS prior comes from `memoryBrief` (`session/memory-brief.ts:24-35`, wired at `ipc.ts:171-176`). In the one completed local session, the tutor spent 1 goal turn + 5 probe turns before the plan (17 turns total). | S–M | **ADAPT**: seed the probe from graph structure (ancestors of the goal concept with R/S), and cap probing at about 3 turns in the prompt. Skip concepts with "la sai" and S of weeks (the prompt already says this at `prompt.ts:50`, but only for the note's own concepts). |
| 2 | Autoevidence ("feels obviously true") as the terminal condition | The session ends when the goal *feels* self-evident to the learner (note §1, "Condizione Terminale"). | Termination is model-declared `done` after a free-recall `recall` (`prompt.ts:39-40`). Schema only checks that `done` implies `summary` (`shared/teacher-protocol.ts:76`). Calibration (confidence vs outcome) is measured in `shared/score.ts` (per `session_analysis.md` §4.3). | n/a | **REJECT as terminal condition.** It is a subjective state, prone to fluency illusions, and can't be checked. At most, collect a one-tap "ti sembra ovvio?" signal *alongside* an objective transfer check. Calibration data already exists to catch "feels obvious but wrong". |
| 3 | "The click": loose facts collapse into a few generators | Aim for restructuring around a few generating principles (note §1). | Named explicitly in the prompt (`prompt.ts:24`). Extraction is told to find "idee centrali… come tutto deriva dalle fondamenta" (`graph/extract-prompt.ts:9`). | S | **ADAPT** at no cost: in consolidation, add a "generators" recall ("da quali 2–3 basi segue tutto quello di oggi?"), or an `order`/`match` game linking derived facts to their base. No extra calls. |
| 4 | Knowledge = graph; derivation edges are facts themselves | Propositions are nodes, derivations are directed edges, and edges are teachable and checkable (note §2). | The graph is exactly this. Concepts are true propositions; chains are premise sets ⇒ conclusion (`graph/derive.ts:27-37`, `shared/graph-types.ts:4,49`). `spot`/`order` games test chains (`teacher-protocol.ts:22-23`). | 0 | **ADOPT (already done).** |
| 5 | Atomic step: one reasoning step at a time | Every new proposition attaches by exactly one inferential edge (note §2). | In the prompt only: "Un passo di ragionamento alla volta" (`prompt.ts:27`), "Un passo, un fatto" (`prompt.ts:35`). Not enforced or measured in code. | S (doctrine) / n/a (enforcement) | **ADAPT, don't harden.** One step per LLM turn at a p50 of ~9.5 s per turn (see Q5) inflates turn count. Let one turn carry 1–3 micro-steps, sized by learner state: bigger chunks where R is high or checks passed with confidence, single steps after an error or misconception. Step size should be adaptive, not fixed. |
| 6 | Foundations vs Derivations | Nodes not derivable from the learner's current state are stated as unconditional (ideally motivated) truths; everything else is derived (note §2). | The prompt says "Verità incondizionate prima" (`prompt.ts:25`) and "verità incondizionate in basso" in the plan (`prompt.ts:32`). The graph has `depth` (longest premise path, Tarjan SCC; `derive.ts:48-99`): depth 0 = no premises *in the graph*. Plan nodes carry only `known/todo/goal` (`teacher-protocol.ts:14`), not foundation/derivation. | M | **ADAPT**: compute *learner-relative* foundations in code. These are nodes of the pruned subgraph (see #8) whose premises are neither known nor in the tree. Pass them to the tutor labelled `base` vs `derivata`. Graph depth alone is absolute, not learner-relative. |
| 7 | Optimization 1: effort allocation (zero logistics for the learner) | The system absorbs planning, ordering, source finding and fact-checking (note §3). | Largely done: auto note matching (`session/note-match.ts`), week planner (`planner/plan.ts:184-204`), suggestions (`suggest/suggest.ts:104-107`), correctness-callout warning (`prompt.ts:3-9`). Weak spot: fragile title/alias-only matching with no in-session correction (`session_analysis.md` §5.3). | S | **ADOPT (mostly done).** Remaining fix: a wrong or missing note match is pure logistics cost. Show and allow changing the matched note before the first turn. |
| 8 | Optimization 2: Minimal Dependency Tree | The smallest subtree linking current state to goal: prune what's known, no detours, plan computed up front (note §3). | **Not grounded.** The plan is LLM-invented with free ids (`teacher-protocol.ts:14-17`, `prompt.ts:69`). `ancestors()` exists (`graph/derive.ts:101-115`) but is used only by the renderer's `GraphView.tsx`, not by the session. The session sees only the note's concepts as a flat list sorted by depth, capped at 40, with no ids and no chains (`memory-brief.ts:26-33`). The practice context *does* pass chains (`practice/material.ts:64-65`). The week planner works on courses and lessons, not concepts (`planner/plan.ts:35-55`). | **L** | **ADOPT** (deterministic, zero LLM calls). Steps: resolve goal concept(s), compute `ancestors(goal)`, prune by R ≥ 0.85 with S above a threshold, emit the subtree with ids, chains and R per node. Require `PlanNode.id` ∈ concept ids, or `new:` for nodes the LLM proposes. Caveat: extracted chains may be sparse or noisy, so treat the tree as a *prior* the tutor can amend, not a hard constraint. |
| 9 | Double resolution: macro map vs micro-steps | The visible plan is low-resolution; actual teaching is micro-steps that don't map 1:1 to plan nodes (note §3). | Already the case. `PlanMap` shows plan nodes, turns carry a `nodeId`, and many turns can sit on one node (`session/events.ts:70-74`). | 0–S | **ADOPT (already done).** The only defect is progress tracking (`doneNodeIds` heuristic, `events.ts:48-51,72`), which ignores open checks and never marks the last node. |
| 10 | Remove meta-narrative noise | No "ora ti dimostrerò A, poi B…" choreography; every sentence installs meaning (note §4). | The voice rules ban enthusiasm, compliments and preaching (`prompt.ts:16-20`), and plan presentation must not repeat the map (`prompt.ts:32`). There is no explicit ban on narrating what comes next. | S | **ADAPT**: add one prompt line. Trivial, no cost. |
| 11 | Check after every step | Every micro-step ends with a graded check; repair before advancing (note §4). | Prompt cycle predict → explain → check; error → diagnose, repair, reinforce (`prompt.ts:33-37`). Local completed session: 9 `teach` turns, 6 `check` + 3 `predict` questions. The check is hidden behind an extra click (`renderer/src/session/QuestionDock.tsx:19,119-126`). Only *choice* checks or games ≥70% count toward progress (`events.ts:48-51`). | S | **ADAPT**: check per *chunk*, not per atomic step (see #5). Make open checks count. Keep the hidden-check friction only for `check`, which is justified. A check is one learner turn plus one ~10 s LLM turn, so a check on every atomic step roughly doubles session length. |
| 12 | Static Knowledge Grounding (LightRAG graph + dense index + RRF) | Dual-index retrieval over course PDFs with reciprocal rank fusion (note §5). | Whole note injected once, capped at 60k characters (`prompt.ts:1,8-9`, `runner.ts:113`). No embeddings. Concepts already store the note `sections` where they are stated (`derive.ts:19,23`). | M (context cost), L (vs DeepTutor) | **REJECT** LightRAG, vector index and RRF: heavy infrastructure, an embedding API, and second-order gains for one user's own notes. **ADAPT**: graph-keyed retrieval. Send the note sections of minimal-tree concepts plus the birth notes of cross-note prerequisites (`Concept.birth`, `derive.ts:19`), instead of 60k of one note. |
| 13 | Dynamic Personal Memory: Trace Forest (3 levels, embedded nodes) + TraceToolkit (Search/List/Read) | Hierarchical per-session traces, ANN search, tool access for agents (note §5). | Per-session JSONL event logs (`session/events.ts:3-7`), practice logs (`practice/events.ts`), global FSRS log `memory/reviews.jsonl`. Effectively L1 = `created` + final `summary`, L2 = `plan`, L3 = turns. No index, no embeddings, no cross-session retrieval into the tutor. | M | **REJECT** embeddings, ANN and agent toolkit. **ADAPT**: a compact per-session summary line (topic, goal concept ids, misconceptions, shaky items) appended at `done`, so the next session can read it without reloading full logs. `list()` already re-reduces every file (`runner.ts:164-173`), which is an O(n) cost to avoid. |
| 14 | Tripartite profile D = (D_s history, D_w weakness inventory, D_r pedagogical reflections), kept by 3 memory agents | Evidence-backed, active/resolved weaknesses and "what works for this learner" (note §5). | D_s ≈ session list + reviews. D_w is fragmented: `Memory.misconception` is a boolean per concept (last answer wrong with confidence ≥70; `shared/memory-types.ts:38-39`). Practice's error taxonomy `miss` ∈ {cue, discrimination, execution, careless, structural} (`practice/prompt.ts:58`, `shared/practice-protocol.ts:30`) stays in the practice log and **is not copied to `ReviewLine`** (`memory-types.ts:8-25`). The session's `summary.misconceptions` is free text used only for the live note (`notes/prompt.ts:29`). D_r does not exist. The learner profile is hardcoded in the prompt (`prompt.ts:13-14`; also `practice/prompt.ts:5`, `graph/extract-prompt.ts:8`). | **L** (D_w), M (D_r) | **ADOPT D_w, simplified**: `weaknesses.jsonl` in the app data dir (see Q3), fed by already-structured outputs, with evidence-gated resolution. **ADAPT D_r**: an editable "Come imparo" profile in Settings replacing the hardcoded block, plus an optional one-line `reflection` field in the `done` summary. **REJECT** 3 memory agents. |
| 15 | Role-specific profile routing (planner ← D_s+D_w, writer ← D_r, question generator ← D_w) | Each agent gets the profile slice it needs (note §5). | One monolithic tutor gets everything in the first message (`prompt.ts:75-83`). Variant generation gets no learner data (`memory/variants.ts:67-94`). The practice prompt *claims* "la memoria è nel materiale" (`practice/prompt.ts:30`), but `buildMaterialContext` sends no R or misconception data (`practice/material.ts:50-93`, wired at `ipc.ts:407-418`). | M | **ADAPT**: route D_w slices by string injection: topic weaknesses to the session's first message, target weaknesses to the practice material, concept weaknesses to the variants prompt. Fixes the practice prompt/data mismatch. Zero calls. |
| 16 | Problem Tutoring in 3 stages (Investigate+Plan → step-by-step ReAct solving with replan → evidence-based writing) | Separate planner, solver and writer agents per query (note §6). | One call per turn, structured JSON (`runner.ts:80-89`, `ai/bridge.ts:137-150`). Practice already makes the tutor solve first and store `modelSolution` within the same call (`practice/prompt.ts:35-36`). | n/a | **REJECT** for the interactive loop: ≥3 sequential CLI calls per turn (plus ReAct iterations). Note also that DeepTutor's 3 stages produce **one written answer per query**: the "step-by-step" is the *agent's* internal solving, not learner micro-steps with checks. It does not implement note §4. |
| 17 | Personalized practice generation in 2 stages (D_w-driven idea generation → critic-guided generation + independent validator/sandbox) | Questions target diagnosed gaps; independent validation (note §6). | Variants: 4–5 per concept from note text only (`variants.ts:72-93`), lenient parse (`variants.ts:13-34`), no validator. Review picks misconception concepts (`memory/review.ts:149`) and new concepts by depth (`review.ts:153-157`, `NEW_PER_SESSION=5` at `review.ts:38`). Session self-grades: `correct`/`why` written in the same turn as the question (`teacher-protocol.ts:35-36,58-59`). | M | **ADAPT**: (1) inject D_w (misconception text + `miss` type) into the variants and practice prompts, so stage 1 folds into the existing call. (2) Run an independent validator **only off the critical path** (background variant generation, which already takes minutes). **REJECT** sandbox code execution except for numeric `estimate` items. |
| 18 | Algorithm 1: closed loop (every trace updates the profile; the profile conditions the next interaction) | `F(j)=F(j-1)∪T_j; D(j)=MemoryUpdate(...)` (note §6). | **Broken loop.** Sessions read FSRS but never write it: `via` ∈ {review, practice} only (`memory-types.ts:19`). The session runner has no memory store dependency (`runner.ts:35-46`). Practice does write (`practice/runner.ts:79-80`). | **L** | **ADOPT**: write session evidence (`via:'session'`, choice checks + confidence, games, graded recall) to `reviews.jsonl`, keyed by concept id (requires #8). Zero LLM calls. Highest value per line of code. |
| 19 | Algorithm 2: TutorBot runtime (message bus, ReAct tool loop, consolidation under context pressure) | Multi-channel persistent agent; distil old messages when tokens > W (note §6). | `--resume` replays the full transcript every turn; no compaction (`session_analysis.md` §5.5, `runner.ts:75-85`). `ai-usage.jsonl` records tokens and ms (`bridge.ts:131`) but nothing acts on them. | M (consolidation only) | **REJECT** runtime, bus, channels and heartbeats (irrelevant to a desktop app). **ADAPT** consolidation: past a token threshold, open a fresh CLI conversation seeded with a compact digest (plan + D_w + last N turns) instead of resuming. |
| 20 | TutorBench evaluation (simulated students from gap profiles, LLM judge, 10 rubric dimensions) | Offline interactive evaluation (note §6). | No pedagogical evaluation or telemetry (`session_analysis.md` §5.14, §6.7). | M | **ADAPT** (dev-only, offline): replay existing session JSONL through an LLM judge on 3–4 rubric dimensions (Personalization, Logical Depth, Answer Quality of check items, Fitness). Optionally use a simulated student seeded from real D_w. Never in the app's runtime. |

### Inferences
- The highest-leverage moves are deterministic plumbing, not new AI stages: #18 (write session evidence), #8 (grounded minimal tree), #14/15 (persistent D_w routed into every generator). Together they reproduce the paper's reported ablation result (removing DPM hurts Personalization and Fitness most) at roughly zero added latency.
- Sinapsi's tutor prompt already *is* the note's doctrine. Adding more doctrine text to the prompt has low marginal value. The bottleneck is the missing structured inputs and outputs, so the doctrine can only be followed by the model's goodwill (`session_analysis.md` §5.4).

### Gaps
- The original source of the note's §1–4 doctrine (current/goal understanding, "safe to lock in", minimal tree, double resolution) is not identified in the note. The note attributes it loosely to Wood/Bruner/Ross, Black & Wiliam and Corbett & Anderson. Sinapsi's prompts cite "Learn Harness" (`graph/extract-prompt.ts:4`, `practice/prompt.ts:1`), which may be the same lineage. Not verified.
- Only one completed session exists in the local logs (16 session files, most abandoned at goal/probe). Turn-composition numbers are anecdotal.

---

## Q1. Does the knowledge graph already provide a minimal dependency tree / foundations vs derivations usable by the planner? Is the session plan grounded in it?

### Takeaway
The data structure is there (true propositions + premise⇒conclusion chains + inference depth + `ancestors()`). But neither the session plan nor the week planner uses it. The session plan is an LLM-invented graph with free ids, and the planner works on courses and lessons.

### Cited Findings
- The graph is rebuilt from ledgers. Concepts have `id, name, statement, birth, notes, sections, depth`. Chains are deduplicated premise sets ⇒ conclusion, dropped if they reference unknown ids — `src/main/graph/derive.ts:4-46`.
- `depth` = longest premise path, cycles collapsed by Tarjan SCC (depth 0 = no premise in the graph = graph-absolute foundation) — `src/main/graph/derive.ts:48-99`.
- `ancestors(g, id)` returns every concept the given one transitively rests on. This is exactly the un-pruned dependency tree. Its only consumer is `src/renderer/src/graph/GraphView.tsx` (grep across `src/`) — `src/main/graph/derive.ts:101-115`.
- The extraction prompt asks for central ideas and chains "fino a una base su cui il resto poggia", and only implicational links count — `src/main/graph/extract-prompt.ts:9-10`.
- Session input from the graph: concepts of the matched note only, sorted by depth, max 40, as `name — state · R · S` lines with no ids or chains — `src/main/session/memory-brief.ts:24-35`.
- Session plan schema: `{id, title, status: known|todo|goal}` with free ids and validated edges, with no link to `Concept.id` — `src/shared/teacher-protocol.ts:14-17,72-75`; prompt: "Id brevi in minuscolo con trattini" — `src/main/session/prompt.ts:69`.
- Week planner: scores courses from exam proximity, pending lesson digests and lesson-level `masteryLevel`. Concept ids appear only as a flat list for exam simulations — `src/main/planner/plan.ts:35-55,116-119`. Readiness uses concepts only as aggregate ratios — `src/main/planner/readiness.ts:15-81`.
- Contrast: Practice *does* pass chains among picked concepts to its tutor — `src/main/practice/material.ts:64-65`.

### Inferences
- A learner-relative minimal tree can be computed in TypeScript in milliseconds: `T = ancestors(goal) ∪ {goal}`, minus nodes with R ≥ 0.85 and adequate S (FSRS `memoryOf`). Foundations = nodes of T none of whose premises are in T (or none of whose premises exist). Derivations = nodes with ≥1 chain fully inside T ∪ Known. Passing T with ids and edges and requiring `PlanNode.id ⊆ T ∪ {new:*}` grounds the plan. It also unlocks attributing check results to concepts (prerequisite for Q3/#18).
- Goal resolution is the weak point. Topic → note is title/alias word overlap (`session/note-match.ts`, per `session_analysis.md` §5.3), and there is no topic → concept mapping. Simple fallback: the goal set = the note's max-depth concepts.
- Graph quality is LLM-extracted. Missing chains make the tree too small, spurious ones too large. So use it as a prior the tutor may amend (with `new:` nodes logged), not as a hard constraint.

### Gaps
- Typical chain density per note in the user's real graph was not measured (the graph ledger was not inspected), so how useful `ancestors()` is in practice is unquantified.

---

## Q2. Does the session check understanding after every step? How are steps sized?

### Takeaway
A check after each explained step is prescribed **in the prompt only**. Step size is entirely the model's call ("un passo, un fatto"). Code enforces neither, and progress credit is skewed toward multiple-choice.

### Cited Findings
- Teaching cycle predict → explanation → check; check must be solvable by reasoning, preferring transfer to a new case; wrong options map to specific wrong mental models; error → diagnose, repair, reinforce, "mai costruire su un passo non dimostrato" — `src/main/session/prompt.ts:33-37`.
- Step sizing: "Un passo di ragionamento alla volta… con una sola mossa motivata" — `src/main/session/prompt.ts:27`; "Un passo, un fatto" — `prompt.ts:35`.
- The schema validates only form (options count, `correct`, `why`, edges, `done` ⇒ summary), not the sequence (no check required after teach) — `src/shared/teacher-protocol.ts:52-77`.
- Progress: a node becomes "done" only if a *choice* check or a game ≥70% on it succeeded **and** the tutor moves to another node. Open checks never count — `src/main/session/events.ts:46-51,70-74`.
- Check prompts are hidden until "Verifica la tua comprensione" is clicked — `src/renderer/src/session/QuestionDock.tsx:19,119-126`. The confidence slider defaults to 50 — `QuestionDock.tsx:22`.
- Local evidence (only completed session, 17 tutor turns): phases probe 5, plan 1, teach 9, consolidate 1, done 1; question roles check 6, predict 3, probe 4, goal 1, plan 1, recall 1 (computed from `~/Library/Application Support/Sinapsi/sessions/*.jsonl`).

### Inferences
- "Check after *every* atomic step" (note §4) with one LLM round-trip per check means each atomic step costs ≥2 turns (explain+check), or 3 with predict. At a ~10 s p50 per tutor turn plus learner time, a 10-step tree costs 20–30 turns. Recommendation: check per **chunk**. Chunk size adapts: 1 step after errors or misconceptions, 2–3 steps when prior checks were correct with confidence ≥70 or R is high. Instruct the tutor accordingly. This keeps the note's error-localization benefit where it matters (fragile zones) and saves turns where the learner is solid.
- Cheap alternative to more turns: let a single turn hold a short explanation plus its check (already allowed). The "predict" before every step is the more expensive ritual. Consider requiring predict only for derivation steps with a non-obvious move, not for foundations (foundations "non può essere dimostrato", note §2, so predicting them is mostly guessing).

### Gaps
- No data on check discrimination quality (whether `correct` is right, distractor quality). Self-grading risk is documented in `session_analysis.md` §5.9 but unmeasured.

---

## Q3. Is there a persistent learner profile (misconceptions, weaknesses, preferences) across sessions akin to DPM? Where should it live?

### Takeaway
Only a thin, scattered proxy exists: a FSRS memory per concept with a boolean `misconception`, a hardcoded biography in prompts, and rich error data (practice `miss` taxonomy, session `summary.misconceptions`) that is generated and then discarded. A simplified D_w (weakness inventory) is the single most valuable DeepTutor idea for Sinapsi. It should live in the app data dir as append-only JSONL, beside `reviews.jsonl`.

### Cited Findings
- `Memory.misconception` = "The last answer was wrong and given with confidence ≥ 70" (boolean; overwritten by the next answer) — `src/shared/memory-types.ts:38-39`.
- `ReviewLine` has `misconception?`, `confidence?`, `type?`, `rung?`, and `via` ∈ {review, practice} — no `miss` type, no `session` source — `src/shared/memory-types.ts:8-25`.
- Practice error taxonomy `miss` ∈ cue / discrimination / execution / careless / structural — `src/main/practice/prompt.ts:58`, schema `src/shared/practice-protocol.ts:30`. It is persisted only in the practice event log (`src/main/practice/events.ts:34,133`). Practice's FSRS write omits it — `src/main/practice/runner.ts:79-80`.
- Session `summary.misconceptions` (free text) is consumed only by the live-note prompt — `src/main/notes/prompt.ts:29`. The digest is truncated at 8,000 characters — `src/main/notes/prompt.ts:6,33`.
- Consumers of the boolean: Review's "misconceptions" mode — `src/main/memory/review.ts:149`; suggestions — `src/main/suggest/suggest.ts:167`; readiness "Errori chiariti" — `src/main/planner/readiness.ts:20,40-47`.
- Learner preferences are hardcoded in prompts ("Chi è Andrea… rileggendo o ricopiando…") — `src/main/session/prompt.ts:13-14`; also `src/main/practice/prompt.ts:5`, `src/main/graph/extract-prompt.ts:8`.
- Lesson "confusion questions" (open/resolved) exist per lesson — `src/main/lessons/reduce.ts:17-22`, used in readiness `planner/readiness.ts:31,70-79`.
- DeepTutor's D_w: "evidence-backed inventory of recurring confusions, wrong-answer patterns, and active or resolved knowledge gaps". Resolution is "evidence-gated rather than governed by numeric confidence thresholds… resolved when the user answers correctly on the topic in recent sessions and stops re-asking about it" — [arXiv 2604.26962v3](https://arxiv.org/html/2604.26962v3) (§2.1.2, App. D.6).
- DeepTutor's ablation: removing DPM makes "Personalization and Fitness decline most sharply" — [arXiv 2604.26962v3](https://arxiv.org/html/2604.26962v3) (§5.4).

### Inferences
- Proposed minimal D_w: `dataDir()/memory/weaknesses.jsonl`, append-only and event-sourced like the rest of the app (`store/jsonl.ts`). Line fields: `{id, conceptId?, text, kind: misconception|gap|execution|discrimination, source: session|practice|review, ref, at, status: active|resolved}`.
  - Writers (no new LLM calls): session `done.summary.misconceptions` and `shaky`; choice checks wrong with confidence ≥70; practice `conclude.miss` ∈ {structural, discrimination}.
  - Resolution rule, evidence-gated: a later correct answer with confidence ≥70 on the same concept, in a different session or form.
  - Readers: session first message (weaknesses for minimal-tree concepts), practice material, variants prompt, suggestions.
- Why the app data dir rather than the vault: it is machine-written and high-churn, it must stay consistent with `reviews.jsonl`, and sessions are deliberately vault-read-only (`session_analysis.md` §2.1). If the user wants visibility, a read-only rendered export or an in-app panel is preferable to writing into notes.
- D_r ("what works for him") is best as a user-editable profile in Settings, replacing the three hardcoded bios. An optional `reflection` string in the `done` summary can propose edits. Automating D_r with an agent is low-value for a single user who can just state preferences.

### Gaps
- Whether free-text misconceptions can be reliably attached to `conceptId` without an extra call depends on #8 (concept-id-grounded plan nodes). Without it, the `nodeId → conceptId` mapping is unavailable.

---

## Q4. Does practice/question generation use learner history (DeepTutor's personalized 2-stage flow)?

### Takeaway
Only weakly, through FSRS-based *target selection*. Content generation never sees learner history: variants are generated from the note alone, and the Practice tutor's context omits memory state even though its prompt claims to have it.

### Cited Findings
- Variants prompt inputs: note title and text, concepts (id|name|statement), types, optional `depth` flag. No misconceptions, past errors or `miss` types — `src/main/memory/variants.ts:67-94`. The `depth` flag comes from the lesson PACER type, not learner errors — `src/main/memory/review.ts:110`.
- Review selection uses history: misconception mode picks `misconception` concepts sorted by R — `src/main/memory/review.ts:149`; new concepts by graph depth, 5 per session — `review.ts:38,153-157`.
- Practice catalog suggests targets by due/low R/never practiced — `src/main/practice/material.ts:35-39`.
- Practice tutor prompt: "Bersaglio: prima il più debole (la memoria è nel materiale)" — `src/main/practice/prompt.ts:30`. But `buildMaterialContext` emits concepts, chains, notes, sources and free text only, with no R, state or misconception — `src/main/practice/material.ts:50-93`, wired at `src/main/ipc.ts:407-418`. **Prompt/data inconsistency.**
- The practice tutor self-validates by solving first and checking for shortcuts in the same call — `src/main/practice/prompt.ts:34-37`. There is no independent validator anywhere. The session's `correct` is generated with the question — `src/shared/teacher-protocol.ts:35-36`.
- DeepTutor flow: an idea agent filters the concept space via D_w into templates; then a generator → validator loop with "LLM-based verification… while computational questions undergo additional sandboxed code execution… because the validator shares no reasoning chain with the generator" — [arXiv 2604.26962v3](https://arxiv.org/html/2604.26962v3) (§2.3); agents idea/evaluator/generator/validator listed in App. D.5.

### Inferences
- Stage 1 (personalized ideation) collapses into the existing single call. Prepend "Errori e misconcezioni già osservati su questi concetti: …" from D_w to the variants and practice prompts, and ask for at least one exercise per active weakness that discriminates the wrong model from the right one. Zero added calls.
- Stage 2's independent validator is worth it **only off the critical path**: variant generation already runs in the background on Gemini (130–175 s per call in the local log). A second background validation call is acceptable there and fixes self-confirming errors. It is not acceptable in live session turns.
- Fix the practice prompt/data mismatch either way: pass a `STATO DI MEMORIA` block (reuse `memoryBrief`-style lines with ids) in `buildMaterialContext`.

### Gaps
- No measurement of how often current variants or session `correct` fields are wrong; the value of a validator is unquantified for this corpus.

---

## Q5. Which benchmark ideas would multiply LLM calls per turn, and what is the latency budget given CLI subprocess calls?

### Takeaway
The live tutor turn today is 1 CLI call: p50 9.5 s, p90 15.1 s (n=56, Claude Sonnet), plus a full second round-trip on invalid JSON. Every engine has a single serialized queue shared with background jobs. DeepTutor's per-query pipeline (investigate → plan → ReAct solve with replan → write, plus 3 memory agents per trace) would put interactive turns at roughly 3–6× today's latency. Only zero-call or off-critical-path adaptations are compatible.

### Cited Findings
- Local measurements from `~/Library/Application Support/Sinapsi/ai-usage.jsonl` (field `ms`):
  - `teach/claude/sonnet`: n=56, p50 9.5 s, p90 15.1 s. One outlier of 3,588 s, likely a stuck process or sleep.
  - `extract/agy/gemini-3.8-flash-high`: n=13, p50 294 s.
  - `note/agy/flash-high`: n=8, p50 394 s.
  - `variants/agy/flash-high`: n=2, 86–174 s.
- Learner→tutor gap per session in the session logs: medians 4–22 s, one 129 s.
- One call at a time per engine; every job waits on the previous one in the same queue — `src/main/ai/bridge.ts:81-86`. Default timeout 180 s — `bridge.ts:63`. `converse` retries once in the same conversation on validation failure — `bridge.ts:137-150`.
- Every tutor turn spawns a CLI process and resumes the conversation; system prompt + note travel in turn 1 only — `src/main/session/runner.ts:75-89`; `session_analysis.md` §1.3, §5.6.
- DeepTutor per-module agents: Solve = planner, solver, writer; Question = idea, evaluator, generator, validator; Personalization = summary, weakness, reflection (Table 8). Memory agents "actively query the TraceToolkit to retrieve related prior sessions… before updating D". Limitations: "the multi-stage pipeline trades additional inference cost for stronger controllability and personalization" — [arXiv 2604.26962v3](https://arxiv.org/html/2604.26962v3) (§2.1.2, App. D.5, Limitations).

### Inferences
Call multipliers per interactive turn:

| Idea | Extra CLI calls | Where | Verdict |
|---|---|---|---|
| 3-stage problem tutoring (investigate/plan, ReAct solve w/ replan, write) | +2 to +5 sequential per turn | critical path | REJECT |
| Critic/validator on each generated check | +1 per question turn | critical path | REJECT live; ADAPT background |
| 3 memory agents (summary/weakness/reflection) | +3 (each tool-looping) per session end | post-session | REJECT; write D_w deterministically from structured outputs |
| Investigate stage with RAG + trace search | +1–2 + embedding API | session start | REJECT; replace with deterministic minimal tree + D_w lookup |
| Context consolidation (Alg. 2) | +1 occasionally (when tokens > W) | between turns | ADAPT; can run after a turn completes, cheap |
| Check after every atomic step | +1 turn per step (≈ +10 s each + learner time) | turn count | ADAPT to per-chunk |
| Minimal tree, D_w injection, FSRS write-back, profile routing | 0 | n/a | ADOPT |

- Budget arithmetic: at p50 9.5 s per call, a 3-call stage pipeline means about 28 s per turn, and about 45 s at p90, before queue contention. Over a 17-turn session that adds roughly 5–8 minutes of pure waiting. Background Gemini jobs (extraction p50 ~5 min) contend for the same queue whenever `teach` is moved to agy (`bridge.ts:81-86`). So any extra live stage also needs priority queues, a separate fix.
- Even single-call quality gains are bounded by the existing JSON-retry tax (a failed validation costs a full second round-trip, `bridge.ts:142-147`).

### Gaps
- The JSON-retry rate per turn is not logged separately in `ai-usage.jsonl`, so the retry tax could not be quantified.
- Token growth per turn under `--resume` was not computed (the input tokens field exists but was not analysed per session).

---

## Q6. Are DeepTutor (HKUDS) and TutorBench real, and does the note describe them faithfully?

### Takeaway
Both are real: an Apache-2.0 repo with about 60k stars and arXiv 2604.26962 (v3, 9 Jul 2026; Bingxi Zhao et al.). The note's §5–6 architecture description (SKG with LightRAG + dense + RRF, Trace Forest 3 levels, TraceToolkit, D=(D_s,D_w,D_r), role routing, 3-stage tutoring, 2-stage question generation, Algorithms 1–2) is broadly faithful. But the **TutorBench section contains errors**: wrong disciplines, invented metric names, and an overstated result claim. It also blends DeepTutor with a separate pedagogical doctrine (§1–4) that DeepTutor neither states nor implements.

### Cited Findings
- Repo `HKUDS/DeepTutor`: "DeepTutor: Lifelong Personalized Tutoring", ~59,983 stars, Apache-2.0, created 2025-12-28, last push 2026-11-15, homepage arXiv 2604.26962 — [GitHub API](https://api.github.com/repos/HKUDS/DeepTutor) / [github.com/HKUDS/DeepTutor](https://github.com/HKUDS/DeepTutor).
- Paper: "DeepTutor: Towards Agentic Personalized Tutoring", Zhao, Zhang, Ren, Guo, Chu, Ma, Huang; first version 2026-04-10; v3 09 Jul 2026; "Tech Report, work in progress"; claims +10.8% on personalized metrics and +29.4% general agentic reasoning across five backbones — [arXiv abs 2604.26962](http://arxiv.org/abs/2604.26962). The note's image filenames `lezione_260426962v3_*` match v3.
- Faithful: RRF fusion of the graph (LightRAG) and dense index — [arXiv v3 §2.1.1](https://arxiv.org/html/2604.26962v3). But `text-embedding-3-large` is one of three configurable options (also Cohere embed-v4.0 and Jina v3), not *the* model as the note implies — [arXiv v3 App. D.6](https://arxiv.org/html/2604.26962v3). The constant 60 in the note's formula is the standard RRF k (Cormack et al. 2009, cited by the paper). I did not find an explicit "60" in the extracted text: unverified.
- Faithful: TraceToolkit = SearchTrace (ANN), ListTraces, ReadNodes with ancestor paths. Three memory agents update D=(D_s,D_w,D_r). Role-specific profile excerpting — [arXiv v3 §2.1.2](https://arxiv.org/html/2604.26962v3). Implementation detail the note omits: trace retrieval top_k=3 (SearchTrace default 5), trace views truncated to 6,000 characters — [arXiv v3 App. D.6](https://arxiv.org/html/2604.26962v3).
- **Unfaithful: disciplines.** The note says TutorBench covers "Informatica, Matematica, Fisica, Chimica e Biologia". The paper says "30 knowledge bases spanning five broad disciplines, covering humanities, sciences, engineering, business, and frontier research", 3 profiles per KB → 90 profiles → 270 tasks, each with 3 source-grounded gaps, human-reviewed — [arXiv v3 §4](https://arxiv.org/html/2604.26962v3).
- **Unfaithful: metrics.** The note lists P1 Guidance, P2 Scaffolding, P3 Student Modeling, P4 Tone, P5 Adaptivity, A1 Correctness, A2 Completeness, A3 Grounding, G1 Difficulty Calibration, G2 Gap Alignment. The paper's ten 1–5 dimensions are: tutoring side Source Faithfulness, Personalization, Applicability, Vividness, Logical Depth; practice side Fitness, Groundedness, Diversity, Cross Concept, Answer Quality — [arXiv v3 §5.1, App. D.1.2](https://arxiv.org/html/2604.26962v3). A text search of v1 and v2 HTML found zero occurrences of "Guidance", "Scaffolding", "Student Modeling", "Gap Alignment", "Difficulty Calibration", "Chemistry" or "Biology" — [v1](https://arxiv.org/html/2604.26962v1), [v2](https://arxiv.org/html/2604.26962v2). The note's metric list appears fabricated, likely by the AI that drafted the note.
- **Overstated result.** The note says results show reduced hallucinations. The paper reports +10.76% overall on LLM-judged rubrics, with Source Faithfulness and Applicability "remain[ing] competitive" (not markedly improved). It has no dedicated hallucination metric — [arXiv v3 §5.1 Results](https://arxiv.org/html/2604.26962v3).
- **Omitted caveats.** Evaluation "relies on LLM-powered student simulators and rubric-based assessors, and therefore inherits the usual gap between controlled simulation and real learner behavior". The multi-stage pipeline "trades additional inference cost". Book Engine/Partners effects "require longitudinal human studies" — [arXiv v3 Limitations](https://arxiv.org/html/2604.26962v3). The simulator is told to resist and "only signal completion after sufficient scaffolded explanation" — [arXiv v3 App. D.1.1](https://arxiv.org/html/2604.26962v3).
- **Conflation.** DeepTutor's Stage ② is the *agent* solving sub-goals with tools and self-notes, with replanning. Stage ③ writes one consolidated answer — [arXiv v3 §2.2](https://arxiv.org/html/2604.26962v3). That is not "one reasoning step per learner turn with a check after each". The note's §7 claim of a seamless unification between the §1–4 doctrine and DeepTutor is the note author's synthesis, not the paper's.
- Algorithm 2 is real but concerns the "TutorBot" persistent multi-channel agent (heartbeats, channels, skills), an extension the paper does not validate on TutorBench — [arXiv v3 §3.3, App. B.2, Limitations](https://arxiv.org/html/2604.26962v3).

### Inferences
- Critique of the note's §1–4 mechanics, by reasoning only (no external sources fetched for these claims):
  1. "Autoevidence as terminal condition" makes a subjective feeling the success criterion. Feelings of fluency are a known unreliable proxy for learning, and Sinapsi's own calibration metric exists precisely because confidence and correctness diverge. Use objective transfer or recall instead.
  2. The "deterministic transition" and "geometric precision" language, plus the neurobiological box (the note itself admits no anatomical sources), are rhetorical, not evidential.
  3. "Never re-explain anything known" assumes the probe is accurate. With noisy probes, a brief confirmation is cheaper than a wrong prune, which is what Sinapsi's prompt already does ("Al massimo una domanda di conferma", `prompt.ts:50`).
  4. "Coverage is the enemy" is fine for a session, but exam preparation has real coverage constraints, which Sinapsi's planner/readiness legitimately models (`planner/readiness.ts`).
  5. Rigid one-step-per-turn plus check-every-step maximizes turn count under ~10 s CLI latency. Adaptive chunking keeps most of the benefit.
- The paper's evidence is LLM-simulated students scored by an LLM judge, with no human learning outcomes. Its +10.8% supports "better rubric scores", not "better learning". This is weak support for adopting heavy machinery in Sinapsi.

### Gaps
- Could not determine where the note's fabricated TutorBench metric names came from (possibly a different paper or hallucination). Searches limited to the DeepTutor v1–v3 HTML.
- Did not inspect the DeepTutor repository code to check whether the open-source implementation matches the paper (e.g., whether memory agents run per trace by default).
