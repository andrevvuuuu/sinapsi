# Fase 7 — Formule nelle note vive e nuova home

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** (1) Math-only fields of the nota viva (glossary symbol, decode formal, recap formula) always render as math, also in notes already generated; (2) the home follows Andrea's wireframe of 27/10 (screenshot in the conversation).

**Spec (Andrea, 27/10):**
- Left panel: logo + close; a slider to see past sessions — Pratica / Apprendimento / Ripasso / Tutte — and below a button to search a past session by typing; an explorer of the note vive in folders by topic; at the bottom the app settings button.
- Center: the graph; a round button top-left that opens, with a smooth animation, the current graph-view menu; at the bottom a small slider Pratica / Apprendimento / Ripasso, centered and detached from the field where to write what to study.
- Right panel: close + "Importa fonti"; the NotebookLM-like section with the list of notebooks; an explorer of the Obsidian notes with folders by topic; at the bottom the button to choose the Obsidian vault folder.
- LaTeX example from the Lagrange note: `(a, b) \text{ oppure } ]a, b[`, `f \in C^0([a, b])`, `\frac{f(b) - f(a)}{b - a}`, `\forall f \in C^0([a, b]), \, f \text{ derivabile in } (a, b) \implies …` shown as raw text.

## Global Constraints
- Never write to the vault; no API keys; Italian UI; existing tokens/themes (Lavagna/Trattato); targets ≥ 44 px where new; `prefers-reduced-motion` respected.
- Existing e2e must keep passing (update selectors that move).

## Review Focus
1. A formula field that already contains `$…$`, or plain words with no LaTeX — rendered unchanged (no double `$`).
2. Ripasso history with reviews hours apart — separate sessions; reviews from Pratica are not Ripasso sessions.
3. "Importa fonti" with no notebook yet — creates one and imports.
4. The graph menu closed: search, lenses and status are still reachable by keyboard (button has aria-expanded, Esc closes, focus returns).
5. Settings: changing an engine or a limit persists and survives a restart; an invalid value is refused with a message.

### Task 1: Math fields
`src/renderer/src/nota/math.ts` `asMath(s: string, display?: boolean): string` — unchanged when it contains `$`; wrapped in `$…$` (or `$$…$$`) when it looks like LaTeX (a `\command`, `^`, `_`, `{`); plain words unchanged. Use in Glossary symbol (+ `plain()` aria text), Decode formal (display), recap formulas (replaces the hard-coded `$${f.tex}$`). NOTA_FORMAT: glossary symbol and decode formal "in LaTeX tra $…$". Tests: `tests/unit/nota-math.test.tsx` (helper cases + Glossary/Decode render `.katex`).

### Task 2: Ripasso history and session list
Main: `reviewSessions(lines, names)` in `src/main/memory/history.ts` — review lines without `via:'practice'`, sorted, split when the gap > 30 min → `{ id: 'r'+firstAt, at, count, conceptIds, topic }` (topic: first 3 names + "e altri N"). IPC `review:sessions`. Left panel: segmented `Tutte / Apprendimento / Pratica / Ripasso`, "Cerca una sessione" button that reveals a search field (filters by topic, accent-insensitive), list of up to 30 rows; Ripasso row opens Ripasso on its concepts. Tests: history unit + LeftPanel RTL.

### Task 3: Note vive explorer and settings
Left panel: "Note vive" as folders by subject (from the vault note of each nota; "Altro" when none), open by default when ≤ 2 folders. Bottom: gear "Impostazioni" opens a modal: Tema; Motori AI (per task: Gemini/Claude + model text), Estrazione in background (on/off, note al giorno 0–50), Ripasso (domande per sessione 1–20); Salva → `settings.set`; errors shown. Tests: RTL.

### Task 4: Right panel
Header: close + "Importa fonti" (popover: notebooks list + "Nuovo notebook…" → chooseFiles → open that notebook). Sections: Notebook (list + "+ Nuovo"), Note di Obsidian (NoteTree moved from the left panel, scrollable), footer: vault folder name + "Cambia cartella del vault". Tests: RTL.

### Task 5: Center
Graph controls behind a 44 px round button top-left ("Vista del grafo", aria-expanded); panel opens with a transform-origin top-left scale+fade (220 ms ease-out), Esc/outside click closes and returns focus; Composer: mode slider in its own pill centered above the input shell. Tests: RTL + e2e updates; screenshots checked.
