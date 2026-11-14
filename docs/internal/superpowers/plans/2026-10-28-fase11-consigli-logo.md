# Fase 11 — Consigli nel riquadro e nuovo logo

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Spec (Andrea, 28/10):**
- "nel coso al centro per scrivere cosa voglio studiare/ripassare/fare pratica ci siano dei tasti per le cose consigliate … consigli sensati, argomenti consigliati per linearità di studio, facilità nella comprensione del resto, etc … prima di iniziare ad usare l'app devo creare tutte le note su obsidian, perciò questa funzione esisterà solo quando tutte le note saranno create".
- "migliorare il logo dell'app (mantienilo minimal, esteticamente appagante e che rispetti lo stile e il concetto dell'applicazione)".

**Design (no AI, no quota, every chip says why):**
- Course order = the order in which a MOC links its notes (MOCs are written as roadmaps). Studied = a nota viva exists or a learning session on the note is done.
- Apprendimento (max 3): an unfinished session ("riprendi"); per course being studied, the next existing note after the last studied one, or first its unmet prerequisite (a note it links to, not studied yet: "serve per capire «X»"); an unstudied note many notes build on ("base di N note"); a course not started → its first note ("primo passo di …").
- Ripasso (max 3): concepts due ("N concetti in scadenza"); a weak foundation (premise of ≥ 2 chains, R < 0.6: "base di N concetti · NN%"); a misconception ("sbagliato con sicurezza").
- Pratica (max 3): a studied nota viva whose concepts were never practiced; a course with ≥ 3 studied notes → exam simulation; a half-remembered concept (0.5 ≤ R < 0.8).
- Shown only when there is something to suggest; nothing new to configure.

## Review Focus
1. A vault without MOCs or links — no crash, sensible or no chips.
2. MOC links to notes that don't exist yet — skipped (they are the frontier).
3. Cycles in links (A↔B) — no infinite prerequisite walk.
4. A suggestion for a note studied in the meantime — gone after refresh (on focus / after a session).
5. Long titles — chips truncate, reason still visible.

### Task 1: Suggestions
`src/main/suggest/suggest.ts` `suggest(input) → { learn: Chip[]; review: Chip[]; practice: Chip[] }`, `Chip = { label; reason; action: {kind:'learn'; topic} | {kind:'review'; conceptIds} | {kind:'practice'; text} }`; IPC `suggest:get`; Composer chips for the selected mode; Home wires actions. Tests: unit for each rule, cycles, missing notes; RTL Composer chips.

### Task 2: Logo
A minimal synapse mark (two nodes, the gap between them, the accent at the junction) as an SVG component for the app header and as the app icon (icon.icns / icon.png regenerated from the SVG). Check in both themes.
