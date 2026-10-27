# Sinapsi Fase 4a — Concetti e grafo unito — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gemini extracts the core concepts (propositions) and reasoning chains from Andrea's Obsidian notes, progressively, into append-only ledgers; the home centre shows the approved union graph (Obsidian notes + Learn Harness concepts) with regions, depth, chains, frontier, search and detail cards.

**Architecture:** Learn Harness pipeline adapted to a headless CLI: the extractor and the identity auditor become **one** `agy` call per note (tools are unavailable headless, and every call costs ~13–33k tokens of overhead): the prompt carries the candidate existing concepts (this note's, its linked notes', same-subject lexical matches) and the model either mints a new proposition or references an existing id. A deterministic merger appends to `propositions.jsonl` / `chains.jsonl` / `extractions.jsonl`; the graph is derived on read. Extraction is progressive: on demand, after studying a note, and in the background when the Mac is idle (limited per day). The renderer ports `docs/prototipi/grafo-v2.html` (canvas + d3-force + d3-zoom) to React, fed by real data.

**Tech Stack:** existing + `d3-force`, `d3-zoom`, `d3-selection`, `d3-transition`, `d3-polygon` (+ `@types/*`).

**Spec:** `docs/design.md` §2 rows "Grafo" and "Estrazione dei concetti", §3 data files; approved prototype `docs/prototipi/grafo-v2.html` (user: "perfetto"); LH reference (read-only) `~/riferimenti/learnharness/src/agent/subagents/extraction.ts` (EXTRACTION_CORE, auditor equivalence bias), `src/core/contracts/graph.ts`, `src/core/graph.ts`.

## Global Constraints

- The vault is read only. All graph data lives in `<dataDir>/graph/`: `propositions.jsonl`, `chains.jsonl`, `extractions.jsonl`, `positions.json`.
- A proposition is a TRUE, self-contained statement in Italian (never about Andrea or the session); `name` is a short handle (≤ 6 words). Chains: premises that JOINTLY entail the conclusion; independent arguments are separate chains.
- Node ids `n_` + 12 hex; chain ids `arg_` + 12 hex; minted by the merger, never by the model.
- Task `extract` default engine becomes `{ engine: 'agy', model: 'gemini-3.8-flash-medium' }` (phase 3 spike: flash-high ~3 min for a tiny reply). agy cwd = `<dataDir>/ai-work`, timeout 300 000 ms.
- Background extraction: only when `powerMonitor.getSystemIdleTime() ≥ 300` s, checked every 10 min; at most `dailyExtractionLimit` (setting, default 6) background notes per local day; on-demand extractions do not count. Setting `backgroundExtraction` (default true).
- Note text in the extraction prompt capped at 60 000 chars (`capNote`); candidates list capped at 150 concepts.
- Test seam: `SINAPSI_FAKE_EXTRACT=1` → scripted extractor (e2e).
- UI copy Italian; graph controls keyboard-reachable; the canvas has an accessible alternative (search listbox + detail card); `prefers-reduced-motion` disables animated transitions.

## Review Focus

1. **Model output references an id that does not exist, a chain with no premises, a chain whose conclusion is one of its premises, or a cycle across chains** → bad chains dropped; cycles do not crash depth (SCC condensation). Test in Tasks 1–2.
2. **The same note re-extracted after edits** → its existing concepts are offered back and reused; no duplicate nodes for unchanged ideas; unchanged notes (same content hash) are never re-extracted. Test in Task 2–3.
3. **Two extractions racing** (button + background) → one job per note at a time, queue serial; ledger lines never interleave. Test in Task 3.
4. **A vault with no extracted notes, or notes the index marks unavailable (iCloud)** → graph still shows Obsidian notes, wikilinks and frontier; unavailable notes are never extracted. Test in Tasks 3–4.
5. **positions.json missing, corrupt, or listing ids that no longer exist** → layout falls back to seeding; no crash. Test in Task 5.

---

### Task 1: Graph ledgers and derivation

**Files:** Create `src/shared/graph-types.ts`, `src/main/graph/store.ts`, `src/main/graph/derive.ts`; Test `tests/unit/graph-derive.test.ts`.

**Interfaces — Produces:**
- Ledger lines: `PropLine = { id: string; name: string; statement: string; notePath: string; section?: string; at: number }` (first line for an id defines name/statement/birth note; later lines for the same id are re-encounters: their `notePath` joins `notes`, a different `statement` joins `aliases`). `ChainLine = { id: string; premises: string[]; conclusion: string; notePath: string; at: number }`. `ExtractionLine = { notePath: string; hash: string; at: number; reason: 'manual'|'study'|'background'; nodes: number; chains: number; dropped: number; ok: boolean; error?: string }`.
- `GraphData = { concepts: Concept[]; chains: Chain[]; extracted: Record<notePath, { hash: string; at: number }> }`; `Concept = { id; name; statement; aliases: string[]; birth: string /*notePath*/; notes: string[] /*birth first, unique*/; sections: Record<notePath, string>; depth: number }`; `Chain = { id; premises: string[]; conclusion: string; notes: string[] }`.
- `graphStore(dir)` → `{ append(kind: 'prop'|'chain'|'extraction', line): Promise<void>; read(): Promise<{ props: PropLine[]; chains: ChainLine[]; extractions: ExtractionLine[] }> }` (uses `appendJsonl`/`readJsonl` with zod line schemas).
- `deriveGraph(lines): GraphData` — merges by id; chains merged by key `sorted(premises)+'>'+conclusion` (first id wins, notes unioned); drops chains referencing unknown ids, with empty premises, or with the conclusion among premises; `depth` = longest premise path over the SCC condensation (a cycle's members share a depth); `extracted` keeps the latest `ok` line per note.
- `ancestors(g: GraphData, id: string): Set<string>` (transitive premises).

- [ ] Step 1: Failing tests — two lines for one id: name from the first, `notes` = [birth, other], differing statement in `aliases`; duplicate chain lines merge (one chain, notes unioned); chain with unknown premise dropped; self-concluding chain dropped; depths: a→b, (b,c)→d gives a 0, b 1, c 0, d 2; a 2-cycle a→b→a plus b→c gives a=b depth and c deeper, no throw; `ancestors(d)` = {a,b,c}; `extracted` keeps last ok line, ignores failed.
- [ ] Step 2: FAIL. Step 3: implement. Step 4: PASS. Step 5: commit `feat(graph): ledgers and derivation`.

### Task 2: Extraction prompt, parsing and merge

**Files:** Create `src/main/graph/extract-prompt.ts`, `src/main/graph/extract.ts`; Test `tests/unit/graph-extract.test.ts`.

**Interfaces — Consumes:** `GraphData`, `capNote`, `VaultIndex`. **Produces:**
- `ExtractReply` (zod, lenient like `parseNota`): `{ propositions: ({ id: string /* "p1"… */; name: string; statement: string; section?: string } | { ref: string /* existing "n_…" */; section?: string })[]; chains: { premises: string[]; conclusion: string }[] }` — invalid items dropped and counted.
- `pickCandidates(g: GraphData, index: VaultIndex, notePath: string, text: string, max = 150): Concept[]` — order: concepts already in this note; concepts born in notes this note links to or that link to it; same-subject concepts ranked by shared words (≥ 4 letters) between their name+statement and the note text; then cut to `max`.
- `buildExtractPrompt({ noteTitle, noteText, candidates }): string` — Italian adaptation of LH `EXTRACTION_CORE` (goal: core ideas and the chains deriving them from the foundations; entailment only; true statements about the world, never about the learner; load-bearing ideas only, no notation glosses, no numbering scaffolding; ≤ 6-word names; each statement self-contained at full precision) + LH auditor equivalence bias ("se un concetto qui sotto dice la stessa cosa, anche con altre parole o un'altra precisione, NON crearne uno nuovo: usa {ref}") + the candidates as lines `n_… | nome | enunciato` + exact JSON format + "Non usare strumenti né file. Rispondi solo con l'oggetto JSON." + note text (capNote).
- `mergeExtraction(reply, ctx: { notePath: string; known: Set<string>; mint: () => string; mintChain: () => string; now: number }): { props: PropLine[]; chains: ChainLine[]; dropped: number }` — local ids minted to `n_` ids; `ref` to an unknown id dropped (counted); re-encounter lines written for refs (so the note joins `notes`); chain ends resolved (local or ref or known id), unresolvable chains dropped; dedupe identical chains in one reply.

- [ ] Step 1: Failing tests — reply with p1,p2 and chain p1⇒p2 → 2 props with `n_` ids, 1 chain using them; `{ref:'n_known'}` → a re-encounter line with this notePath; `{ref:'n_ghost'}` dropped; chain to `n_known` premise kept; chain with an undefined local id dropped; a duplicated chain merged; `pickCandidates`: own-note concepts first, linked-note next, a same-subject concept sharing words before an unrelated one, cap respected; prompt contains "JSON", "Non usare strumenti", the candidate line format and the note text.
- [ ] Step 2: FAIL. Step 3: implement. Step 4: PASS. Step 5: commit `feat(graph): extraction prompt, parsing and merge`.

### Task 3: Extraction jobs, scheduler, IPC

**Files:** Create `src/main/graph/jobs.ts`, `src/main/graph/fake-extract.ts`; Modify `src/shared/settings-schema.ts` (`extract` default flash-medium; `backgroundExtraction: boolean` default true; `dailyExtractionLimit: number` default 6), `src/shared/api.ts`, `src/preload/index.ts`, `src/main/ipc.ts`, `src/main/ipc-handlers.ts`, `src/main/notes/generator.ts` + `src/main/session/runner.ts` (hook: after a nota viva is ready / a session reaches `done` with a note → `extractor.request(path, 'study')`); Test `tests/unit/graph-jobs.test.ts`.

**Interfaces — Produces:**
- `createExtractor(deps: { bridge: Pick<Bridge,'ask'>; store: GraphStore; vault: () => Promise<VaultIndex|null>; readNote: (p) => Promise<string>; workDir: string; now?: () => number; onChange: (s: ExtractorStatus) => void })` → `{ request(path: string, reason: 'manual'|'study'): Promise<void>; backgroundTick(opts: { idleSeconds: number; enabled: boolean; dailyLimit: number }): Promise<string|null>; status(): ExtractorStatus; graph(): Promise<GraphData> }`.
- `ExtractorStatus = { running?: string /*notePath*/; queued: string[]; lastError?: { notePath: string; message: string } }`.
- Rules: one serial queue; a path already running or queued is not queued twice; the note must be `available` in the index, else `request` rejects "Nota non trovata nel vault"; content hash (sha256) equal to the last ok extraction → skipped (no AI call) unless reason `manual`; failures write an `ok: false` extraction line with the friendly message. `backgroundTick` returns the path it extracted or null: needs `enabled`, idle ≥ 300, today's background count < limit; picks the first not-extracted-or-changed available note by priority: notes of subjects with a session or nota viva (passed in via `deps.priorities?: () => Promise<string[]>` subject ids), notes linked from extracted notes, the rest alphabetically; never `Prompts`/excluded (index already excludes).
- IPC: `CH.graphGet 'graph:get'` → `GraphData`; `graphExtract 'graph:extract'` (path) → void (background); `graphStatus`, `graphChanged 'graph:changed'` (broadcast `{ status, graph }` after each merge), `graphPositions` get/set (`Record<id, [x,y]>`, validated: ≤ 20 000 entries, finite numbers). Preload `graph: { get(); extract(path); status(); onChange(cb); positions(); savePositions(p) }`. Main runs `backgroundTick` every 10 min with `powerMonitor.getSystemIdleTime()`.
- `fakeExtractBridge()`: returns for "Teorema di Rolle" 3 propositions + 1 chain, for "Teorema di Lagrange" 2 propositions with one `ref` to a Rolle concept found in the candidates (parses the prompt) + 1 chain.

- [ ] Step 1: Failing tests (temp dir, fake bridge, fake clock) — request extracts and appends lines, `graph()` shows the concepts; a second request with unchanged content makes no AI call; `manual` re-extracts; same path requested twice concurrently → one call; unavailable note rejects; bridge error → `ok:false` line and `lastError`; `backgroundTick` does nothing when idle < 300 or disabled or limit reached (two background lines today with limit 2), and picks a priority-subject note before others; settings defaults.
- [ ] Step 2: FAIL. Step 3: implement + wire IPC, hooks, timer. Step 4: PASS + typecheck. Step 5: commit `feat(graph): progressive extraction jobs`.

### Task 4: Graph view model

**Files:** Create `src/renderer/src/graph/model.ts`; Test `tests/unit/graph-model.test.ts`.

**Interfaces — Consumes:** `GraphData`, `VaultIndex`. **Produces:** `buildModel(g: GraphData, index: VaultIndex): GraphModel` with
- `regions: Region[]` — one per note with extracted concepts `{ notePath; title; subject; hue: string /* stable from the path hash, HSL */; concepts: string[] }`;
- `concepts: VConcept[]` (`Concept` + `region`), `junctions: { id: chainId; premises; conclusion; depth }[]` for chains with ≥ 2 premises, `arrows: { from; to; chain; head: boolean }[]` (premise→junction headless, junction→conclusion head; single-premise chain = one headed arrow);
- `notes: { path; title; subject; moc: boolean; extracted: boolean }[]` for vault notes without concepts (Obsidian-style nodes), `wikilinks: [pathA, pathB][]` (resolved links, deduped, both kinds), `frontier: { name; course: string /* MOC title */ }[]` (unresolved links from MOC notes: `type` includes "MOC" or title ends with "MOC"), `subjects` (from index);
- `maxDepth`, `parents`/`kids` maps, `search(q: string, limit = 8): SearchHit[]` over concept names/statements, region titles, note titles (case/accents-insensitive).

- [ ] Step 1: Failing tests — fixture vault index + graph: regions only for extracted notes, a concept in two notes belongs to its birth region and lists both; 2-premise chain gives a junction and 3 arrows; frontier lists unresolved MOC links only; wikilinks deduped; search "lagr" finds the region and its concept, "teorema" limited to 8; hue stable across calls.
- [ ] Step 2: FAIL. Step 3: implement. Step 4: PASS. Step 5: commit `feat(graph): view model`.

### Task 5: Layout

**Files:** Create `src/renderer/src/graph/layout.ts`; `npm i d3-force d3-zoom d3-selection d3-transition d3-polygon` and `-D @types/d3-force @types/d3-zoom @types/d3-selection @types/d3-transition @types/d3-polygon`; Test `tests/unit/graph-layout.test.ts`.

**Interfaces — Produces:** `createLayout(model: GraphModel, opts: { mode: 'radial'|'vertical'|'free'; saved?: Record<string,[number,number]> })` → `{ nodes: SimNode[]; links; tick(n: number): void; setMode(m): void; positions(): Record<string,[number,number]>; byId: Map<string, SimNode> }` — forces as in the prototype (link, charge by kind, cluster pull to region centroid, depth anchoring radial `r = 90 + depth·62` at the region angle / vertical `y = 260 − depth·77`, subject centres for Obsidian notes, frontier on the rim, collide); saved positions seed nodes (ids not in the model ignored; non-finite ignored) and then only 60 ticks run instead of 400.

- [ ] Step 1: Failing tests (node env, real d3-force) — radial: after ticks the mean radius grows with depth; vertical: mean y decreases with depth; saved positions are used as start and unknown/garbage entries ignored without throwing; `positions()` round-trips.
- [ ] Step 2: FAIL. Step 3: implement. Step 4: PASS. Step 5: commit `feat(graph): force layout`.

### Task 6: Graph view (canvas, controls, card, search)

**Files:** Create `src/renderer/src/graph/GraphView.tsx` (React shell: canvas, overlay panel, card, search), `src/renderer/src/graph/draw.ts` (pure-ish draw(ctx, state) ported from the prototype: depth rings + "limite di ciò che sai", blurred regions, hulls, frontier, wikilinks between region centroids, chains with junctions and arrowheads, Obsidian notes, concepts — dashed ring when in more notes —, three-level label cross-fade Materie › Note › Concetti), `src/renderer/src/graph/graph.css`; Test `tests/unit/graph-view.test.tsx`.

**Interfaces — Consumes:** `buildModel`, `createLayout`, `api.graph`, `api.vault`. **Produces:** `GraphView({ index, onStudy(title), onOpenNote(path) })`:
- overlay panel (top-left of the centre): title "Il tuo grafo", meta line (`N concetti da M note · K catene · J in più note`), search (`role="combobox"` + `listbox`, arrows/Enter), Disposizione segmented (Radiale / A piani / Libera) with hint text, toggles Regioni / Link di Obsidian / Frontiera (aria-pressed), status line ("Sto estraendo «X»…", queued count, last error with Riprova), zoom buttons (Avvicina / Allontana / Mostra tutto).
- detail card (`role="dialog"`, `aria-label="Dettagli"`, Esc closes): concept → name, statement, "livello N", where it appears (notes), "Segue da" / "Porta a" lists (buttons selecting those concepts), actions "Cosa serve per capirlo (n)" (path highlight + fit), "Apri la nota" (onOpenNote birth path); region → title, concepts list, Obsidian links, actions "Studia questa nota" (onStudy title), "Apri la nota", "Estrai di nuovo"; Obsidian note → "Non ancora estratta", action "Estrai i concetti" (api.graph.extract), "Apri la nota".
- interaction: hover/select focus dimming, click picking, wheel/drag zoom (d3-zoom), positions saved 2 s after the simulation settles; redraw on theme change.

- [ ] Step 1: Failing tests (jsdom; `HTMLCanvasElement.prototype.getContext` stubbed to a no-op 2d context) — meta line counts; typing "rolle" lists a concept and the region, Enter selects → card shows statement, "Segue da"/"Porta a"; "Cosa serve per capirlo (2)" label from ancestors; Obsidian-note card "Estrai i concetti" calls `api.graph.extract(path)`; layout buttons toggle aria-pressed; Esc closes the card; status line shows the running note.
- [ ] Step 2: FAIL. Step 3: implement. Step 4: PASS + typecheck. Step 5: commit `feat(graph): union graph view`.

### Task 7: Home integration, e2e, live extraction, packaging

**Files:** Modify `src/renderer/src/home/Home.tsx` (centre shows `GraphView` when the vault index loaded; placeholder kept only for an empty vault), `App.tsx` (onStudy → session.start(title)), `NotePicker.tsx` (button "Estrai i concetti" + count of concepts of this note), `README.md` (section "Grafo"); Create `tests/e2e/graph.spec.ts`; Modify `tests/live/` (new `graph-live.test.ts`).

- [ ] Step 1: e2e (`SINAPSI_FAKE_EXTRACT=1`, fixture vault): home shows "Il tuo grafo"; open "Teorema di Rolle" note page → "Estrai i concetti" → back home: meta line counts 3 concepts; search "Weierstrass" → card statement; extract Lagrange → its concept that referenced Rolle shows "Compare in 2 note". `npm run build && npm run test:e2e` PASS.
- [ ] Step 2: Live (`LIVE_AI=1`): extract the real notes "Teorema di Fermat sui Punti Stazionari", "Teorema di Rolle", "Teorema di Lagrange del Valor Medio" in that order through the real bridge into a temp graph dir; assert each ≥ 5 concepts and ≥ 3 chains, nothing about "Andrea"/"studente" in statements, and at least one concept of Lagrange's extraction is a `ref` to a Rolle or Fermat concept (identity across notes); log counts, time, tokens; screenshot the graph built from it (light + dark).
- [ ] Step 3: `npm test`, typecheck, `npm run build:unpack`, packaged e2e → PASS. Commit `test(graph): e2e and live extraction`.
