# Fase 8 — Giochini nell'Apprendimento

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make learning sessions more fun without trading away learning: the tutor can propose short mini-games in place of a plain check, and the session keeps a light score (points, streak, calibration) shown in the header and in the final summary.

**Spec (Andrea, 27/10):** "aggiungere anche dei giochini nelle fasi di apprendimento per rendere lo studio più divertente". Design decisions delegated ("mi affido a te").

**Design (learning first):** every game is a retrieval or discrimination task with immediate feedback, short (≤ 90 s), and the result goes back to the tutor like an answer, so the tutor reacts to it.
- **Lampo** (`speed`): 5–8 true/false statements, 8 s each, streak multiplier — fast retrieval of facts just taught.
- **Coppie** (`match`): memory cards, flip two to pair a concept with its statement/symbol/example — association.
- **Ricomponi** (`order`): put the steps of an argument in order (drag or ↑/↓) — chain composition.
- **Trova l'intruso** (`spot`): one line of a derivation is wrong; tap it and say why — discrimination.
- **Tabù** (`taboo`): explain a concept without the forbidden words (live check blocks sending while one is used); the tutor judges the explanation — Feynman/elaboration.
- **Score layer:** points per correct answer and per game, streak of consecutive correct checks, **calibrazione** (how well confidence matched correctness: 100 − mean |confidence − correct|). Header pill "★ 120 · serie 4"; the end summary adds "Punti, serie migliore, calibrazione".
- **Setting:** "Giochi nelle sessioni" (on by default) in Impostazioni; when off the tutor is told not to propose games.

## Global Constraints
- Italian UI; LaTeX in all game texts (`$…$`); targets ≥ 44 px; `prefers-reduced-motion`; keyboard playable (no drag-only).
- Games never block the session: "Salta il gioco" always available, sends "Ho saltato il gioco".
- The tutor protocol stays one question per turn: a game is a question of kind `game`.
- e2e with the fake teacher.

## Review Focus
1. A game payload the UI cannot play (pairs < 2, order with duplicate steps, spot index out of range, taboo without words) — rejected by validation and retried, never shown broken.
2. The 8-second timer with reduced motion or a backgrounded window — answers still counted correctly, no double scoring.
3. Reloading a session mid-game — the game is shown again (it is the pending question), score unchanged.
4. Calibration with no confidence data — not shown instead of a fake 100.
5. Games off in settings — the prompt says so and the fake/real tutor turns without games still work.

### Task 1: Protocol
`src/shared/teacher-protocol.ts`: `GameSchema` discriminated union (`speed {items:{statement,true:boolean,why}[] 3–10}`, `match {pairs:[a,b][] 2–8}`, `order {steps:string[] 3–8 unique}`, `spot {lines:string[] 2–10, wrong:int, why}`, `taboo {concept, forbidden:string[] 2–8}`); Question gains kind `game` with `game`; refinements; `LearnerAnswer.game?: {score:number,total:number,detail:string}`; `formatLearnerReply` for games ("Gioco «Lampo»: 6/8 giuste — sbagliate: …"). Tests.

### Task 2: Prompt and setting
Teacher prompt section "Giochi" (when: after 2–3 explained steps as an alternative to a check, `match`/`speed` in consolidation; at most one game every three turns; content only from what was taught; always LaTeX); `settings.gamesInSessions` (default true) in schema + Patch; session runner adds "(Giochi disattivati: non proporre giochi.)" to the first message when off. Tests.

### Task 3: Score
`src/shared/score.ts` `sessionScore(items)` → `{points, streak, bestStreak, calibration|null, games}` from answers (choice correct: 10 + 5 if confidence ≥ 70 and right; game: score×5; streak counts consecutive correct checks/games ≥ 70%). Tests.

### Task 4: Game UI
`src/renderer/src/session/games/{Speed,Match,Order,Spot,Taboo,GameDock}.tsx` + css: each plays, shows feedback, then "Continua" sends the answer; "Salta il gioco". Header score pill + summary block. Tests (RTL, fake timers).

### Task 5: Fake teacher, e2e, live
Fake teacher proposes a `match` and a `speed`; e2e plays both; live run asks the real tutor for a session and checks it proposes a valid game within the first teach turns (logged, not asserted strictly). README.
