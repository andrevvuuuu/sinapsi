# Fase 10 — Divisori trascinabili e grafo delle sole note vive

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Spec (Andrea, 28/10):**
- "voglio poter spostare le righe che dividono ogni sezione della pagina home": up/down the line between note vive explorer and past sessions; up/down the line between notebooks and the Obsidian explorer; left/right the lines between the side panels and the graph.
- "il grafo dell'app deve essere solo sulle note vive, non su quelle di obsidian".

## Global Constraints
- Sizes persist across restarts (renderer localStorage, guarded); keyboard operable separators (role="separator", arrows, Home/End), ≥ 8 px hit area, limits so no section collapses; reduced motion respected.
- Never write to the vault.

## Review Focus
1. Window smaller than the saved sizes — panels clamp, the centre keeps at least 360 px.
2. Damaged or missing saved layout — defaults, no crash.
3. No nota viva yet — the graph says how it grows instead of an empty canvas.
4. A nota viva still generating or failed — not in the graph until ready.
5. Concepts extracted earlier from notes without a nota viva — hidden from the graph; background extraction no longer spends quota on them.

### Task 1: Splitter + layout
`src/renderer/src/home/Splitter.tsx` (pointer drag, keys ±16 px, Home/End to limits, aria-valuenow/min/max) and `useLayout()` (left, right, sessions, notebooks; clamp; localStorage `sinapsi.layout.v1`). Home uses them: grid columns from left/right; left panel sessions height; right panel notebooks height. Tests: Splitter keys and drag; Home restores and clamps.

### Task 2: Graph of note vive only
GraphView `livePaths` prop: graph and vault index reduced to the notes with a ready nota viva (concepts born there, their chains, note circles, wikilinks among them; no frontier). Empty state. Extraction: no longer on opening an Obsidian note or at the end of a session; only when a nota viva is ready, and background extraction only for notes with a nota viva (`eligible`). Tests: GraphView filter + empty state; backgroundTick eligibility; NotePicker no extraction.
