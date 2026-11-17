# Checking the algorithm and LLM proposals in the Gemini report "Ristrutturazione Neurocognitiva e Architetturale di Sinapsi"

Scope: the technical proposals (FSRS-6, ts-fsrs API, grade mapping, BKT, LLM-as-judge, Trace Forest/DeepTutor, state machine, context management) in `/Users/andreaantonelli/Downloads/gemini-Ristrutturazione Neurocognitiva e Architetturale d-20261117.md`. Research date: 2026-11-17.

How I gathered evidence: I read primary sources over HTTP (npm registry, GitHub API and raw wiki, arXiv, code.claude.com docs, the Anki manual source), checked the installed library source in `node_modules/ts-fsrs` (v5.4.2), and ran small local simulations with the installed ts-fsrs. I did not call any LLM.

Facts about the local project (read-only):
- `package.json` pins `"ts-fsrs": "5.4.2"`. The installed `dist/index.mjs` declares `FSRSVersion = "v5.4.2 using FSRS-6.0"`, uses 21 default weights, and sets `FSRS6_DEFAULT_DECAY = 0.1542`, `default_enable_short_term = true` and `default_learning_steps = ["1m","10m"]`. So **Sinapsi already runs FSRS-6** through `fsrs(generatorParameters({ enable_fuzz: false }))` in `src/main/memory/fsrs.ts`.
- The same file computes the displayed R with a hard-coded **FSRS-5 / FSRS-4.5 curve** (`DECAY = -0.5`, `FACTOR = 19/81`). The scheduler uses FSRS-6 (decay 0.1542, factor ≈ 0.98). That is an internal inconsistency the report never mentions (see Q1).
- The LLM engines are spawned as `claude -p <prompt> --output-format json [--resume id | --session-id id] ...`, plus an `agy -p ... --output-format json` engine (`src/main/ai/engines.ts`). Installed CLIs: Claude Code 2.1.326 and Gemini CLI 0.66.0.

---

## Q1. FSRS-6: the forgetting curve, w17/w18/w19/w20, ts-fsrs support and API names, logging same-day reviews

### Takeaway
The report's FSRS-6 curve is correct, and its description of w17–w19 as same-day stability parameters is broadly correct. Several other claims are wrong or out of date:
- ts-fsrs 6.0.0 (released 2026-10-28) makes **FSRS-7** the default model.
- The legacy `fsrs()` object in the installed 5.4.2 has **no `nextInterval()` and no `review()`**.
- Logging every in-session attempt is risky: with default weights, repeated same-day "Easy" ratings inflate stability about 1.5× per attempt.

### Cited Findings
**The curve and its parameters**
- FSRS-6 forgetting curve: `R(t,S) = (1 + factor · t/S)^(−w20)`, with `factor = 0.9^(−1/w20) − 1` so that R(S,S) = 90%. The decay w20 is trainable. The report's formula and its description of F match. — [awesome-fsrs wiki, The Algorithm (FSRS-6 section)](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm) (the old fsrs4anki wiki page now says "Page moved" to this URL: [fsrs4anki wiki](https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm))
- Default FSRS-6 weights: `[0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542]`, so w20 = 0.1542. — [awesome-fsrs wiki](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm); also visible in the installed `node_modules/ts-fsrs/dist/index.mjs` (v5.4.2)
- In FSRS-4.5 and FSRS-5 the decay was fixed: DECAY = −0.5 and FACTOR = 19/81 (FSRS v4 used −1 and 1/9). — [awesome-fsrs wiki](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm)
- FSRS-6 same-day stability: `S' = S · e^(w17·(G − 3 + w18)) · S^(−w19)`. The wiki says "S increases faster when it's small and slower when it's large. S will converge when SInc = 1", and "we should ensure SInc ≥ 1 when G ≥ 2". FSRS-5 had the same formula without the `S^(−w19)` term. — [awesome-fsrs wiki](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm)
- ts-fsrs 5.4.2 applies that formula only when `t === 0 && enable_short_term` (t counted in whole days). It masks the increment with `Math.max(sinc, 1)` for G ≥ Hard. On a lapse with short-term enabled, it also uses w17·w18 to set a minimum post-lapse stability: `next_s_min = s / exp(w17·w18)`. — installed source `node_modules/ts-fsrs/dist/index.mjs`, `next_short_term_stability` and `next_state`
- The report's mapping table names the wrong parameter for "Again". It attributes the post-lapse stability drop to **w6**. In FSRS-5/6, w6 drives the difficulty change (`ΔD(G) = −w6·(G − 3)`). Post-lapse stability uses **w11–w14**: `w11·D^(−w12)·((S+1)^w13 − 1)·e^((1−R)·w14)`. — [awesome-fsrs wiki, FSRS-5 section](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm); installed source `next_forget_stability`
- The report gets w15 (Hard penalty) and w16 (Easy bonus) right as multipliers in the recall-stability formula (FSRS-4.5+). It is wrong in two other places:
  - It calls the Good update "logarithmic". In fact S' = S·SInc, a multiplicative increase that shrinks with higher D and S and grows as R falls.
  - It ties difficulty "mean reversion" to Good. Mean reversion toward D0(4) applies on every review.
  - Sources: [awesome-fsrs wiki](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm), which states: "D''=w7·D0(4)+(1−w7)·D'". The multiplicative form appears in the FSRS-7 section: "S' = S·S_Inc … S_Inc >= 1".

**State of the art as of Nov 2026**
- **FSRS-7 exists and is now the ts-fsrs default.** ts-fsrs v6.0.0 (2026-10-28) states: "ts-fsrs v6 introduces FSRS-7, the default model for `DefaultScheduler`". Key changes:
  - FSRS-7 uses 34 weights, a `stabilityFast` memory field, and fractional-day intervals.
  - `fsrs()`, `FSRS` and `IFSRS` "remain exported but deprecated and use FSRS-6".
  - v6 requires Node.js 24 or later.
  - Sources: [ts-fsrs v6.0.0 release notes](https://github.com/open-spaced-repetition/ts-fsrs/releases/tag/v6.0.0); npm dist-tags `latest: 6.0.0`, with 5.4.2 published 2026-09-01 ([npm registry](https://registry.npmjs.org/ts-fsrs))
- FSRS-7 represents stability as S_long plus S_short, combined through a mixture of two forgetting curves. It optimizes all parameters jointly. — [awesome-fsrs wiki, FSRS-7 section](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm)
- The report calls FSRS-6 "lo stato dell'arte" ("the state of the art"). That is out of date as of November 2026.

**ts-fsrs API names**
- In the installed 5.4.2:
  - `fsrs().next(card, now, grade)` applies one rating and returns `{card, log}`.
  - `fsrs().repeat(card, now)` previews all four outcomes; Sinapsi uses it for `previewIntervals`.
  - Also available: `rollback`, `forget`, `reschedule` and `get_retrievability`.
  - `next_interval` exists only on the internal algorithm class, in snake_case.
  - A local runtime check of `fsrs(generatorParameters({}))` returns `typeof nextInterval === 'undefined'` and `typeof review === 'undefined'`.
  - Source: installed `node_modules/ts-fsrs/dist/index.mjs` plus a local node check.
- In v6.0.0:
  - The legacy facade's `next_state`, `next_interval` and `get_retrievability` "are removed".
  - The new async `DefaultScheduler(options)` "uses `newCard`, `preview`, `review`, `rollback`, `forget`, `retrievability`, and `nextInterval` … and `{ card, revlog }` review results".
  - Select FSRS-6 with `version: 'FSRS-6'`. Model-level operations live in `ts-fsrs/models/fsrs-6` etc. (`step`, `nextInterval`, `forgettingCurve`, `forward`).
  - `Reschedule` (at `ts-fsrs/reschedule`) replays review history.
  - `Card.elapsed_days` was removed: "derive elapsed time from actual review timestamps".
  - Source: [ts-fsrs v6.0.0 release notes](https://github.com/open-spaced-repetition/ts-fsrs/releases/tag/v6.0.0)
- Conclusion on the report's "`nextInterval` and `review()`": these names exist only in the **v6 `DefaultScheduler` API**, which defaults to FSRS-7. They do not exist on the `fsrs()` object Sinapsi uses. And `nextInterval` computes an interval; it does not record a review.
- Learning steps and short-term behaviour:
  - Both 5.4.2 and v6 support learning/relearning steps (defaults `['1m','10m']` and `['10m']`).
  - v6 adds `graduatingInterval` and `allowModelOverride`.
  - "Disabling explicit learning steps does not disable FSRS-7's intrinsic fast trace."
  - Sources: [ts-fsrs v6.0.0 release notes](https://github.com/open-spaced-repetition/ts-fsrs/releases/tag/v6.0.0); installed source defaults

**Migration guidance**
- "Upgrading the package and upgrading the model are separate operations. Keep FSRS-6 explicitly when migrating an existing FSRS-6 integration. To move learned cards to FSRS-7 … rebuild memory from complete review history … do not reuse FSRS-6 weights." — [ts-fsrs v6.0.0 release notes](https://github.com/open-spaced-repetition/ts-fsrs/releases/tag/v6.0.0)

**Same-day reviews: what the Anki manual says**
- "Evidence shows that repeating a card multiple times in a single day does not significantly contribute to long-term memory." The manual recommends keeping (re)learning steps under one day and few in number. Leaving the steps field empty to let FSRS handle short-term scheduling is "experimental". — [Anki manual, deck-options.md](https://github.com/ankitects/anki-manual/blob/main/src/deck-options.md) (FSRS > Learning and Relearning Steps)

**Local simulation (installed ts-fsrs 5.4.2, default weights, no fuzz)**
Setup: a new card rated the same grade 6 times, 15 minutes apart, on one day.

| Setting | Stability after each of the 6 ratings |
| --- | --- |
| Good, `enable_short_term=true` | stays at **2.31 d** (already above the convergence point ≈ 2.1 d computed from w17–w19); due date 3 d |
| **Easy, `enable_short_term=true`** | **8.30 → 13.05 → 19.91 → 29.57 → 42.77 → 60.38 d**; due date 60 d |
| Easy, `enable_short_term=false` | stays at 8.30 d (due date 8–10 d) |

Source: my own run of `fsrs().next` against `node_modules/ts-fsrs` (reproducible snippet below).

So the report's claim that same-day successes converge to a reasonable upper limit holds for Good, not for Easy. With default w17 = 0.5425 and w18 = 0.0912, the Easy increment is e^(0.5425·1.0912) ≈ 1.81 × S^(−0.0658). Its convergence point is thousands of days.

Reproducible snippet (run from the project root):
```js
const {fsrs,generatorParameters,createEmptyCard,Rating}=require('ts-fsrs');
const f=fsrs(generatorParameters({enable_fuzz:false,enable_short_term:true}));
let t=new Date('2026-11-17T09:00:00Z'), c=createEmptyCard(t);
for (let i=0;i<6;i++){ c=f.next(c,t,Rating.Easy).card; console.log(c.stability); t=new Date(+t+15*60000); }
```

### Inferences
- The report's "close the loop" idea (session results write to `reviews.jsonl`) is sound. Its specific advice is unsafe: log every validated retrieval and "use w17–w19" so in-chat repetitions build stability.
  - Safer policy: write **at most one FSRS review per concept per session/day**, normally the first graded cold retrieval of that concept, which is the most diagnostic.
  - Keep the other attempts as session telemetry (for the in-session mastery rule), not as FSRS reviews.
  - Alternatively keep all attempts but never map them to Easy.
  - This matches the Anki manual's evidence that same-day repetition adds little to long-term memory, and it avoids the Easy inflation shown above.
- Sinapsi replays the whole log through `scheduler.next` (`replay()` in `fsrs.ts`). So any same-day burst written to `reviews.jsonl` is replayed every time memory is computed. The logging policy therefore matters permanently, not just once.
- **Internal bug the report missed:** `displayedR` in `src/main/memory/fsrs.ts` uses the FSRS-5 curve (−0.5, 19/81) while the scheduler uses FSRS-6 (w20 = 0.1542, factor = 0.9^(−1/0.1542) − 1 ≈ 0.98, my calculation). Both curves give R = 0.9 at t = S, but they diverge elsewhere. My calculation at t = 3S: FSRS-6 gives R ≈ 0.81, FSRS-5 gives R ≈ 0.77. So the R shown in the UI is not the R the scheduler uses. If R feeds anything (for example the report's P(L0)), compute it with the same curve and weights as the scheduler.
- Upgrade path: stay on 5.4.2/FSRS-6, or move to ts-fsrs v6 with `DefaultScheduler({ version: 'FSRS-6' })` for API modernization. Adopting FSRS-7 is a separate decision; per the release notes it needs FSRS-7 weights and a full history replay. Sinapsi stores the full history (`reviews.jsonl`) and rebuilds cards from it, so a FSRS-7 replay is feasible in principle. v6 requires Node ≥ 24, so check the Electron version's bundled Node first.
- ts-fsrs 5.4.2 counts elapsed time in whole calendar days (`t === 0` triggers the short-term branch). A session that crosses midnight is therefore treated as a new day. The local code comment also notes the day rounding.

### Gaps
- I did not fetch the FSRS optimizer's exact rule for same-day reviews in training (whether fsrs-rs uses only the first review of each day for the long-term part, or trains w17–w19 on all same-day pairs). The FSRS-5/6 same-day formula implies same-day reviews are modelled, but I found no primary text on optimizer filtering. A personal-parameter optimization is unlikely to matter at Sinapsi's data volume.
- I did not read the ts-fsrs v6 migration guide page (https://open-spaced-repetition.github.io/ts-fsrs/guide/migration) or llms.txt beyond the release notes.
- I found no published benchmark comparing FSRS-7 with FSRS-6 accuracy. The srs-benchmark repo is referenced but I did not read it.

---

## Q2. Mapping LLM-graded open answers plus confidence to Again/Hard/Good/Easy

### Takeaway
The report's table gets the two most important rules right:
- a wrong or partial answer maps to Again;
- Hard is a passing grade.

But it mixes **confidence** into the FSRS grade, which FSRS does not model, and it assigns Easy from self-reported confidence. Easy is the most damaging grade to inflate: it applies the w16 bonus and, on same-day repeats, the inflation shown in Q1. Use correctness for pass/fail. Keep confidence as a separate calibration signal, not a grade multiplier.

### Cited Findings
- Anki manual: "FSRS can adapt to almost any habit, except for one: pressing 'Hard' instead of 'Again' when you forget the information. When you press 'Hard', FSRS assumes you have recalled the information correctly… If you press 'Hard' when you have failed to recall the information, all intervals will be unreasonably high." — [Anki manual, deck-options.md](https://github.com/ankitects/anki-manual/blob/main/src/deck-options.md)
- FSRS algorithm wiki: "Easy, Good, and Hard all count as 'success'; Again counts as a memory 'lapse'. That's why you shouldn't use Hard as a failing grade, only as a passing grade." — [awesome-fsrs wiki](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm)
- FSRS inputs are only (rating, timestamp) per review. Neither the FSRS-6 nor the FSRS-7 equations contain a confidence or response-time term. — [awesome-fsrs wiki](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm)
- The report's mapping of "Parzialmente errato" ("partially wrong") to Again agrees with the guidance above. Its "Corretto nella sostanza … fiducia marginale → Hard" ("substantially correct, marginal confidence") is consistent with Hard as a hesitant pass. — same sources
- Sinapsi's existing `misconception` flag (`correct === false && confidence >= 70`) already uses confidence orthogonally to the grade. — local `src/main/memory/fsrs.ts`

### Inferences
- Recommended mapping (an inference from the sources above):
  - Grader says incorrect or partial → **Again**, whatever the confidence. High confidence only sets a "misconception" flag that drives tutoring behaviour (the report's "VibeCheck"), not the FSRS update.
  - Grader says correct but needed hints, or the answer was incomplete or hesitant → **Hard**.
  - Grader says correct and unaided → **Good**.
  - **Easy** → use sparingly or never from automatic grading. Possibly allow it only on explicit student choice, or when the answer is correct, unaided, and the concept's prior review was also correct.
- Assigning Easy from "> 80% confidence" rewards overconfidence and inflates S. The report's thresholds also leave gaps: a correct answer at confidence < 60 with solid justification has no row, and a correct answer at exactly 80 matches both Good and Easy.
- Risks of LLM-graded reviews:
  - Grader false positives become Hard/Good passes, which is exactly the "intervals unreasonably high" failure the Anki manual warns about.
  - Grader noise over time contaminates any later parameter optimization.
  - Mitigations: reference-guided grading (Q4); a separate grader call; let the student contest or override a grade before it is written; tag each review line with `source: 'session-llm'` vs `source: 'review-manual'` so these reviews can be filtered from future optimization (Anki's "Ignore cards reviewed before" exists for a similar reason).
- Response time: FSRS ignores it. Some apps map fast correct answers to Easy, but I found no FSRS-official guidance endorsing that (see Gaps).

### Gaps
- I found no official FSRS or Anki document on "automatic grading" or on deriving grades from response time or confidence (the FSRS FAQ wiki page fetched empty). The claim that FSRS developers discourage automatic Easy is my inference, not a cited statement.

---

## Q3. Bayesian Knowledge Tracing within a session, alongside FSRS

### Takeaway
BKT as the report proposes it (four parameters, P(L0) taken from FSRS R, P(T) "modulated by tutor clarity", P(S) "by syntactic complexity", a 0.85 threshold) amounts to hand-set constants. It has no fitted basis for a single user. Within one session it largely duplicates FSRS plus a simple mastery rule. The DeepTutor paper, which the report cites as its model, explicitly avoids latent mastery scores. A simple, transparent mastery rule is more defensible.

### Cited Findings
- BKT is a two-state hidden Markov model estimating per-skill mastery from interaction logs (Corbett & Anderson 1995). Deep KT, DKVMN and others are neural successors. — summary in [DeepTutor paper, arXiv 2604.26962, §A.3](https://arxiv.org/abs/2604.26962)
- pyBKT describes BKT parameter learning as **EM fitting on tutor log datasets**, with "data generation, fitting, prediction, and cross-validation routines". In other words, the parameters are estimated from many students' logs. — [Badrinath et al., pyBKT, arXiv 2105.00385](https://arxiv.org/abs/2105.00385)
- DeepTutor grounds personalization "in observable trace evidence rather than coarse latent mastery scores". Its adaptive-learning plan keeps "mastery progress and tutoring history … coupled rather than tracked in a separate mastery model". Practice "is graded against a reference, updates the weak-concept inventory, and feeds a scheduler that decides what to revisit and when". — [DeepTutor, arXiv 2604.26962](https://arxiv.org/html/2604.26962)
- The report says DeepTutor-style architecture motivates BKT. The paper does not use BKT; it cites BKT only in related work. — [DeepTutor, arXiv 2604.26962](https://arxiv.org/html/2604.26962)

### Inferences
- With default or guessed parameters and only a handful of observations per concept per session (typically 1–4 probes), the BKT posterior is driven mostly by the priors you choose. The 0.85 threshold then reduces to a fixed number of consecutive correct answers. Example: with P(G) ≈ 0 and P(S) small for open answers, two or three correct answers push P(L) above 0.85 from almost any P(L0) > 0.3. So "N correct in a row" (the classic mastery-learning rule) is what BKT turns into here, without the illusion of statistical rigour.
- Initializing P(L0) from FSRS R conflates two quantities:
  - R is the probability of recalling a previously learned item now.
  - P(L0) is the probability the skill is known at all.
  - For never-reviewed concepts R is undefined; for lapsed concepts R is low even though relearning is fast.
  - It is a usable heuristic for ordering and scaffolding level, but not "principled". Also, Sinapsi's displayed R uses the wrong curve (Q1).
- Recommended alternative (inference):
  - A per-concept session state: unseen → explained → probed.
  - "Done" requires K consecutive grader-correct open answers (K = 2 for open recall, more for multiple choice, since guessing is high there), or one correct cold retrieval for concepts whose FSRS R is already high.
  - Pick the scaffold level from the last 1–2 outcomes plus FSRS state (new / review / lapsed).
  - This is deterministic, explainable in the UI, and needs no fitted parameters.
  - The report's real point stands: replace the `doneNodeIds` "focus moved" heuristic with grader-confirmed evidence keyed to real `Concept.id`s.

### Gaps
- I did not fetch primary sources for ASSISTments "skill builder" (N correct in a row) or Khan Academy mastery rules. Background knowledge suggests ASSISTments used 3 in a row, but this is unverified, so do not cite it as fact.
- I did not fetch literature on BKT identifiability or degenerate parameters (e.g. Beck & Chang 2007) or the 0.95 mastery threshold from Corbett & Anderson.

---

## Q4. LLM-as-judge self-preference, sycophancy, reference-guided grading

### Takeaway
The report's "self-bias" argument is misapplied. Self-preference bias concerns an LLM rating **its own generated text**. In Sinapsi the graded text is the **student's** answer, so the relevant risks are leniency and sycophancy, and grading without a reference. Mitigations that do help:
- a separate grader call with a rubric and a reference answer from the vault;
- no view of the tutor's conversational rapport;
- optionally a different model family as grader.

### Cited Findings
- Zheng et al. 2023 (MT-Bench), arXiv 2306.05685:
  - "GPT-4 favors itself with a 10% higher win rate; Claude-v1 favors itself with a 25% higher win rate. However, they also favor other models and GPT-3.5 does not favor itself. Due to limited data and small differences, our study cannot determine whether the models exhibit a self-enhancement bias."
  - On math grading, the judge's failure rate (judging an incorrect answer correct) was **14/20 with the default prompt, 6/20 with chain-of-thought, and 3/20 with reference-guided grading**.
  - GPT-4 judges reach "over 80% agreement" with humans.
  - Source: [Zheng et al., Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena, arXiv 2306.05685](https://arxiv.org/abs/2306.05685)
- Panickssery, Bowman & Feng 2024: LLMs "have non-trivial accuracy at distinguishing themselves from other LLMs and humans". Through fine-tuning they find "a linear correlation between self-recognition capability and the strength of self-preference bias", defined as "an LLM evaluator scores its own outputs higher than others' while human annotators consider them of equal quality". — [LLM Evaluators Recognize and Favor Their Own Generations, arXiv 2404.13076](https://arxiv.org/abs/2404.13076)
- Sharma et al. 2023: "five state-of-the-art AI assistants consistently exhibit sycophancy across four varied free-form text-generation tasks". Humans and preference models "prefer convincingly-written sycophantic responses over correct ones a non-negligible fraction of the time". — [Towards Understanding Sycophancy in Language Models, arXiv 2310.13548](https://arxiv.org/abs/2310.13548)
- Short-answer grading: GPT-4 "with basic few-shot prompting performed well (Kappa, 0.70) and, importantly, very close to human-level performance (0.75)" on real K-12 short answers in Science and History. — [Henkel et al., Can LLMs Make the Grade?, arXiv 2405.02985](https://arxiv.org/abs/2405.02985)
- GPT-4 was also evaluated on the SciEntsBank and Beetle benchmarks, "grading the alignment of the student answer with a reference answer". — [Kortemeyer, arXiv 2309.09338](https://arxiv.org/abs/2309.09338)
- Grade Guard (2025) notes LLM graders are inaccurate "in evaluating nuanced or partially correct answers". It proposes an uncertainty ("Indecisiveness") score alongside the grade. — [arXiv 2504.01253](https://arxiv.org/abs/2504.01253)
- Practice example: DeepTutor's evaluation used Gemini-3-Flash as tutor and student simulator, with **Claude Sonnet 4.6 as the judge** at temperature 0, scoring each transcript three times. That is a cross-family judge setup. The paper also cites Spiliopoulou et al. 2025 on measuring self-bias in LLM-as-a-judge (arXiv 2508.06709). — [DeepTutor, arXiv 2604.26962](https://arxiv.org/html/2604.26962)

### Inferences
- Splitting tutor and grader into separate calls with a strict JSON schema, a rubric and a vault-derived reference answer is well supported, mainly because reference guidance cuts false "correct" judgements (14/20 → 3/20 in MT-Bench math). The reason is not self-preference, since the model is not grading its own text.
- Using the same model in a separate stateless call removes conversational sycophancy pressure: rapport, and the student's phrasing of confidence in the chat. It does not remove model-level leniency.
- The Claude/Gemini engine switch (commit 28c2e34) enables cross-family grading, e.g. tutor on one engine, grader on the other. Evidence that cross-family helps is indirect, from DeepTutor's evaluation practice and Panickssery's self-recognition link.
- Have the grader output `correct | partial | incorrect`, plus `hintsUsed` and `confidence`. Store partial as Again (Q2). Show a short reason the student can contest.

### Gaps
- I found no study measuring LLM leniency specifically when grading student answers in a tutoring dialogue versus a stateless grader call. The benefit of the split is inferred.
- I did not verify current (2026) self-preference results for Claude or Gemini model families specifically.

---

## Q5. Do "Trace Forest" and "DeepTutor" exist, and does the report describe them accurately?

### Takeaway
Both exist. DeepTutor is an HKUDS open-source project and paper, and Trace Forest is its memory structure. The report **misdescribes** Trace Forest: it is a cross-session, embedding-indexed store of past tutoring traces queried via tools, not a three-tier prompt template of "summary / BKT map / last 3 turns". DeepTutor contains no BKT.

### Cited Findings
- GitHub repository [HKUDS/DeepTutor](https://github.com/HKUDS/DeepTutor): "DeepTutor: Lifelong Personalized Tutoring". Apache-2.0 licence; created 2025-12-28; about 60k stars; last push 2026-11-15. Latest release noted in the README: v1.6.2 (2026-08-31). — [GitHub API](https://api.github.com/repos/HKUDS/DeepTutor), [README](https://github.com/HKUDS/DeepTutor)
- Paper: "DeepTutor: Towards Agentic Personalized Tutoring", arXiv **2604.26962**. Authors: Bingxi Zhao, Jiahao Zhang, Xubin Ren, Zirui Guo, Tianzhe Chu, Yi Ma, Chao Huang. The README says it went live in April 2026. Reported results: +10.8% on personalized metrics and +29.4% on general agentic reasoning across five backbones. — [arXiv abs 2604.26962](https://arxiv.org/abs/2604.26962)
- The "Hybrid Personalization Engine" has two parts:
  - **Static Knowledge Grounding (SKG)**: course or knowledge-base retrieval, "deduplicated, and truncated to a context budget".
  - **Dynamic Personal Memory (DPM)**, centred on the **Trace Forest**: "each tree records one complete tutoring interaction as a multi-resolution, semantically searchable artifact". Level 1 is the session input and global summary; Level 2 is the planning units from task decomposition; Level 3 is execution records (tool outputs, evidence, validation outcomes). "Every node carries a dense embedding."
  - Source: [DeepTutor HTML, §2.1](https://arxiv.org/html/2604.26962)
- **TraceToolkit** offers `SearchTrace` (semantic ANN retrieval), `ListTraces` (filtered enumeration) and `ReadNodes` (full content plus ancestor paths). Three memory agents query it to build a profile: session history, an evidence-backed inventory of recurring confusions and knowledge gaps, and pedagogical self-reflections. — [DeepTutor HTML, §2.1.2](https://arxiv.org/html/2604.26962)
- **TutorBench** is "an interactive benchmark incorporating customized learner profiles grounded in university-level curricula across five domains". It uses an LLM-driven, profile-based student simulator for first-person evaluation. — [arXiv 2604.26962](https://arxiv.org/abs/2604.26962)
- The current open-source product uses a three-layer file-backed memory: "L1 traces, L2 facts, L3 synthesis… deliberately *not* a hidden vector store". It supports a linked **Obsidian** vault as a knowledge base, and can connect local Claude Code / Codex (v1.4.7). — [DeepTutor README](https://github.com/HKUDS/DeepTutor)

### Inferences
- What the report gets right: DeepTutor decomposes tutoring into staged agents (investigation, guided solving, writing, question generation with a critic). It also keeps a weakness/misconception inventory; the report's "Weakness Inventory" matches the paper's inventory of recurring confusions.
- What the report gets wrong:
  1. Trace Forest's levels are levels **within one past interaction's trace tree** (summary → plan units → execution records), not "global summary / BKT map / last n turns" of the current prompt.
  2. It is a cross-session retrieval store with embeddings, not a recipe for cutting per-turn latency.
  3. DeepTutor deliberately avoids latent mastery scores, so "Level 2 = BKT map" is invented.
  4. Calling it "formalized in literature" overstates things: it is one 2026 preprint's design.
- The useful takeaway for Sinapsi is the **weak-concept inventory**, persisted per `Concept.id`, plus grading against a reference. An embedding-indexed trace forest is overkill for one user and one vault.

### Gaps
- I did not verify whether arXiv 2604.26962 has been peer-reviewed or accepted at a venue.

---

## Q6. Explicit state-machine orchestration vs one long prompt; XState vs a hand-rolled reducer

### Takeaway
There is good evidence that LLMs degrade over long multi-turn contexts and with relevant information buried in the middle of a prompt. That supports moving phase control (measure → plan → teach → probe → grade) into code. A small typed reducer or discriminated-union state machine suffices for about 5–6 states; XState is optional, not required.

### Cited Findings
- "LLMs Get Lost In Multi-Turn Conversation" (Laban et al. 2025): "all the top open- and closed-weight LLMs we test exhibit significantly lower performance in multi-turn conversations than single-turn, with an average drop of 39% across six generation tasks". The authors attribute this mostly to "a significant increase in unreliability". — [arXiv 2505.06120](https://arxiv.org/abs/2505.06120)
- "Lost in the Middle" (Liu et al. 2023): performance "is often highest when relevant information occurs at the beginning or end of the input context, and significantly degrades when models must access relevant information in the middle of long contexts". — [arXiv 2307.03172](https://arxiv.org/abs/2307.03172)
- LearnLM (Google) treats pedagogy as "pedagogical instruction following": system-level instructions describe the desired pedagogy. This is a prompt/post-training approach, not a code state machine. — [LearnLM: Improving Gemini for Learning, arXiv 2412.16429](https://arxiv.org/abs/2412.16429)
- DeepTutor orchestrates fixed numbered stages (①–⑤) and a closed-loop cycle in code, with specialized agents per stage. — [DeepTutor HTML](https://arxiv.org/html/2604.26962)

### Inferences
- Phase transitions, plan IDs constrained to real `Concept.id`s, and the "done" rule should be code decisions. The LLM should be called per phase, with a phase-specific prompt and a JSON schema; Sinapsi already passes schemas to the CLIs (`engines.ts`). This answers the report's valid complaints: invented plan IDs and the `doneNodeIds` heuristic.
- For about 6 states, a TypeScript reducer `(state, event) => state` with a discriminated union is easy to test and serialize to disk. XState earns its place mainly with visual tooling, parallel or hierarchical states, or actor orchestration, and the report's flow does not need these. That is a judgement, not a cited fact.

### Gaps
- I did not fetch or verify primary documentation for Khanmigo, OpenAI "study mode", or Anthropic/Claude "learning mode" architecture. Their internal orchestration (prompt-only vs code-level state) is not public in sources I checked. Do not claim they use state machines.
- I found no controlled study directly comparing code state machines with monolithic prompts for tutoring.

---

## Q7. Context management: `--resume` vs summary plus last N turns, streaming, caching, Gemini CLI flags, RAG vs heading extraction

### Takeaway
The report's "O(n²) latency" claim is overstated for Claude:
- `--resume` resends the full history, but Claude Code's prompt caching serves the unchanged prefix from cache;
- under a Claude subscription the main-conversation cache TTL is one hour, so per-turn cost grows modestly.

Two of the report's claims are actually false: streaming **is** available in both CLIs (`stream-json`), so "JSON bloccante" ("blocking JSON") is a Sinapsi choice, not a CLI limit. Embedding RAG is unnecessary for a single note of ≤ 60k chars. Heading-based section extraction keyed to concepts is simpler and sufficient.

### Cited Findings
**Claude Code CLI**
- Claude Code docs: each turn "re-sends the full context: the system prompt, your project context, every prior message … Prompt caching is how th[is stays cheap]". The cache matches the request prefix exactly, and a system-prompt change invalidates everything after it. — [Claude Code docs, Prompt caching](https://code.claude.com/docs/en/prompt-caching.md)
- On resume: "Claude Code sends the whole conversation again, and the request reads from the cache whatever part of its prefix is unchanged and still within the cache lifetime". Different `--append-system-prompt` text on resume is a source of change. — [Prompt caching, "Resuming a session"](https://code.claude.com/docs/en/prompt-caching.md)
- Cache TTL: the main conversation, including "non-interactive `-p` runs", gets the **one-hour** TTL on a Claude subscription within plan usage, and **five minutes** with API key, usage credits or cloud providers. — [Prompt caching, "Cache lifetime"](https://code.claude.com/docs/en/prompt-caching.md)
- Streaming: "Use `--output-format stream-json` with `--verbose` and `--include-partial-messages` to receive tokens as they're generated… The last line of the stream is a `result` message with the final response text, cost, and session metadata." — [Claude Code docs, headless](https://code.claude.com/docs/en/headless.md)
- With `--output-format json` the payload includes `total_cost_usd`. With `--resume` it reports the conversation's whole total. — [headless](https://code.claude.com/docs/en/headless.md)
- `--bare` "reduce[s] startup time by skipping auto-discovery of hooks, skills… MCP servers, auto memory, and CLAUDE.md". It is "recommended for scripted and SDK calls", but in bare mode Claude Code "never reads OAuth credentials", so it **requires `ANTHROPIC_API_KEY`**, not the subscription login. — [headless, "Start faster with bare mode"](https://code.claude.com/docs/en/headless.md)
- The installed `claude --help` (2.1.326) lists `--output-format`, `--input-format` (stream-json), `--include-partial-messages`, `--resume`, `--session-id`, `--fork-session`, `--no-session-persistence`, `--system-prompt`/`--append-system-prompt` and `--exclude-dynamic-system-prompt-sections`. — local `claude --help`

**Gemini CLI**
- Installed `gemini --help` (0.66.0): `-p/--prompt` for headless mode, `-o/--output-format text|json|stream-json`, `-r/--resume` ("latest" or an index), `--session-id`, `--session-file`, `--list-sessions`, `-m/--model` and `--approval-mode` (including `plan` = read-only). — local `gemini --help`
- Gemini CLI headless docs: JSON output includes a `stats` object with token usage and latency. `stream-json` emits `init` (session id, model), `message` chunks, `tool_result` and a final `result` with aggregated per-model token usage. — [gemini-cli docs/cli/headless.md](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/headless.md)

### Inferences
- **Latency.** Per-turn latency is dominated by CLI cold start, the serialized `enqueue`, and output generation, not by quadratic re-reading. Cached prefix tokens are cheap and fast. Practical wins, in order:
  1. Switch to `stream-json` with partial messages and render tokens progressively.
  2. Allow the grader call to run in parallel with UI work rather than strictly queued.
  3. Keep the system prompt byte-identical across turns to preserve the cache (do not vary `--append-system-prompt` per turn).
  4. Consider `--bare` only if the user is willing to use an API key.
- **Summary plus last N turns vs `--resume`.** A per-phase, stateless call ("compact state + current concept's note section + last 2–3 turns") makes each call smaller and less exposed to multi-turn drift (Laban et al.). But each such call has a **new prefix**, so it misses the conversation cache except for a stable system prompt.
  - Hybrid recommendation: keep `--resume` for the tutor dialogue (cache-friendly continuity).
  - Make the planner and grader stateless calls with a fixed system prompt and minimal inputs.
- **Note text.** 60k chars is roughly 15k tokens, which fits easily in context and is cached after the first turn.
  - Reasons to narrow it per concept are focus ("lost in the middle") and grader precision, not capacity.
  - Sinapsi already has a concept graph from the vault, so mapping each `Concept.id` to its heading or section and passing that section (plus parents) is deterministic, cheap and auditable.
  - Embedding RAG adds an index, a model dependency and retrieval error for little benefit on one document.
  - DeepTutor's own README stresses traceable citations and offers a non-vector "PageIndex" engine, so even there vectors are optional. ([DeepTutor README](https://github.com/HKUDS/DeepTutor))

### Gaps
- I did not measure actual Claude CLI cold-start time or cache-hit ratios for Sinapsi's calls. Measure with `--output-format json` usage fields (cache read/creation tokens) before redesigning.
- I did not verify Gemini CLI's implicit or explicit context-caching behaviour for `--resume` sessions.
- I did not test the `agy` engine's streaming flags (its args in `engines.ts` use `--output-format json`).
