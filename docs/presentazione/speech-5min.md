# Sinapsi — 5-minute presentation (7 slides)

Spoken text is in blockquotes (`>`). Everything outside the quotes is for you, not for the audience.
Target pace: about 140 words per minute, so roughly 700 spoken words in 5:00.

| # | Slide | Time |
| --- | --- | --- |
| 1 | Hook and title | 0:00 – 0:35 |
| 2 | The problem: two ways to fail | 0:35 – 1:05 |
| 3 | What Sinapsi is | 1:05 – 1:40 |
| 4 | Walkthrough 1: study session and living note | 1:40 – 2:30 |
| 5 | Walkthrough 2: concept graph, memory, confidence | 2:30 – 3:20 |
| 6 | Thinking enforced in code | 3:20 – 4:05 |
| 7 | The three honest answers, and the close | 4:05 – 5:00 |

---

## Slide 1 — Hook (0:00 – 0:35)

**On the slide:** "Sinapsi" · *Start from what you already know. Master what comes next.* · two glowing nodes, "known" → "new".

> Look around this room: about two hundred people. Imagine I teach all of you Calculus, with the same words, at the same speed. Some of you are bored. Others are lost by step two. Not because you aren't smart, but because you missed one prerequisite three weeks ago.
>
> That is university: one explanation, hundreds of students.
>
> We are first-year AI and Math students at Sapienza, and we built Sinapsi. Like a synapse, it connects what you have already consolidated to what you need to learn next.

*Delivery:* pause after "three weeks ago". Adapt "two hundred" to the real room.

---

## Slide 2 — The problem (0:35 – 1:05)

**On the slide:** headline "Two ways to fail". Two cards:
1. **One lecture for everyone.** Ignores what you already know.
2. **A chatbot that thinks for you.** Practice +48% · real exam −17%. *(Bastani et al., 2024, high-school students)*

Small line under card 2: "With a guardrailed tutor: practice +127%, no exam penalty."

> Students have two options today, and both fail. The lecture ignores what you know. And if you hand your notes to a chatbot, it does the thinking for you.
>
> In a 2024 randomized study with high-school students, those with unrestricted GPT improved by 48% in practice, and then scored 17% worse on the real exam. The group with a tutor that held back answers gained 127% in practice, with no exam penalty.
>
> So the question isn't whether to use AI. It's how it is built.

*Delivery:* say the three numbers slowly, once. Don't add more statistics.

---

## Slide 3 — What Sinapsi is (1:05 – 1:40)

**On the slide:** flow "Your notes (read-only) → Concept graph → Memory (FSRS-5) → Socratic practice → Exam readiness". Under it, three short cards: **Read-only** · **Attempt first** · **Measured mastery**. Footer: "Builds on LearnHarness and DeepTutor."

> Sinapsi is a Mac study companion that works on the notes you already keep. Three rules.
>
> It never touches your notes: they are read-only. The tutor never gives the answer before you have tried. And mastery is measured, not ticked: it is the probability of recall that FSRS-5 estimates from your answers.
>
> We openly build on guided-tutoring projects like LearnHarness and DeepTutor. What we add is everything after the lesson: a concept graph, spaced repetition per concept, notes that flag mistakes, and an exam-readiness index.

---

## Slide 4 — Walkthrough 1: session and living note (1:40 – 2:30)

**On the slide:** two real screenshots side by side (the UI is in Italian, so add small English captions).
Left: study session, "predict → explain → verify". Right: living note with the three-level decoding and a flagged error.

> Within 24 hours of a lecture, you open Sinapsi. In a study session, the tutor first checks which prerequisites you actually remember. Then it teaches one step at a time: you predict, it explains, you verify. It ends with a closed-book brain dump: write everything you remember.
>
> Then comes the living note. Your note becomes an interactive page: every theorem decoded as formula, plain language and intuition, with figures you can drag, and proofs hidden until you have tried.
>
> And if your own notes contain a mistake, Sinapsi flags it and prepares the correction, instead of quietly working around it.

*Tip:* a 10-second screen recording of dragging a figure is more convincing than a still image.

---

## Slide 5 — Walkthrough 2: graph, memory, confidence (2:30 – 3:20)

**On the slide:** the concept map, nodes coloured by memory (Rolle → Lagrange highlighted), and a review card with the confidence slider.
Three tags: **Deductive graph** · **FSRS-5, 11 question formats** · **Confidence before answering**.

> Isolated facts are fragile; connected knowledge lasts. Sinapsi extracts atomic concepts from your notes and builds a deductive graph. Rolle's theorem is a premise of Lagrange's, and every node traces back to the note it came from.
>
> Each node is coloured by its recall probability today. Reviews run on FSRS-5, which needs 20 to 30% fewer reviews than the older algorithm behind classic flashcards, across eleven question formats.
>
> And before every answer, you declare how sure you are. Wrong at 80% confidence is not a gap, it is a misconception. Sinapsi flags it and brings it back for a targeted review.

---

## Slide 6 — Thinking enforced in code (3:20 – 4:05)

**On the slide:** headline "Guardrails in code, not in prompts". Three visuals: the six-rung hint ladder with a lock · "Exam simulation: timed, no help, /30" · "Readiness: 5 signals".
Footer strip: `Electron · React 19 · TypeScript · ts-fsrs · D3 · Zod → Gemini + Claude (your own CLI subscriptions) → append-only JSONL`

> This is where "think, don't think for me" is enforced. The hint ladder has six rungs, from a nudge to a worked step. The code won't unlock a rung until you have submitted an attempt and said where you are stuck, and a tutor reply that skips the ladder is rejected before you ever see it.
>
> Grading is strict too. BrokenMath, a 2025 benchmark, found that a frontier model will "prove" a false theorem 29% of the time. So our grader compares with a reference solution and points to the first unjustified step.
>
> Before the exam: a timed simulation, no hints, graded out of thirty, even on paper. And a readiness index from five hard signals, not from how you feel.

---

## Slide 7 — Three honest answers, and the close (4:05 – 5:00)

**On the slide:** three columns, each one a question the jury asked.
**Is it new?** The full loop after the lesson, per concept, measured.
**Does it make you think?** Rules in code, not wishes in a prompt.
**Who benefits, who is left out?** Benefits: any student building cumulative knowledge. Left out today: no Mac, no Claude or Gemini subscription, notes not in Markdown.
Bottom line: *Sinapsi — AI that helps you think, never thinks for you.*

> So, is it new? The idea of a guided tutor isn't, and we credit those who proved it. What is new is the whole loop after the lesson, per concept, and measured.
>
> Does it make you think? The guardrails are rules in code, not wishes in a prompt.
>
> Who benefits? Any student building cumulative knowledge, from middle school to university. Who is left out? Today it is a Mac app, it needs a Claude or Gemini subscription, and it assumes Markdown notes. Your notes are never modified, and your graph, schedule and prepared questions live on your Mac.
>
> We haven't run a classroom trial, so we won't invent numbers. What we can show is a graph where prerequisites turn solid and unlock the next step.
>
> Sinapsi doesn't replace the student's brain. It builds the connections inside it. Thank you.

---

# 60-second pitch (no slides)

> Picture a lecture hall with two hundred students and one professor explaining Calculus the same way to everyone, whatever each of them already knows. Now picture the fix most students reach for: a chatbot. A 2024 study found that students with unrestricted GPT scored 17% worse on the real exam. The AI had done their thinking.
>
> Sinapsi is the opposite. Within 24 hours of a lecture, you open it on your real notes. It maps them into a graph of concepts, Rolle's theorem leading to Lagrange's, and tracks the probability you will still remember each one. A Socratic tutor starts from what you already know and teaches one step at a time. Hints stay locked, in code, until you have tried. If your notes contain a mistake, Sinapsi flags it.
>
> Sinapsi: AI that helps you think, never thinks for you.

---

# Q&A cheat sheet

**1. Is this really new, or just faster?**
> It is not faster, it deliberately slows the student down where it matters. We build on the guided-tutoring philosophy of LearnHarness and DeepTutor, and we add what happens after the lesson: concept-level spaced repetition, notes that flag their own errors, confidence calibration and a measured readiness index, all on a deductive graph of the student's own notes.

**2. Does it help students think, or think for them?**
> The rules that matter are in code. Hints unlock only after an attempt and after the student says where they are stuck. Tutor replies that break the rules are rejected. Help fades once a concept is solved twice without hints on different days. Exam simulations run with no help at all.

**3. Who benefits and who gets left out?**
> Any student who needs to build knowledge step by step, from middle school to university. Left out today: students without a Mac, without a Claude or Gemini subscription, or who don't keep notes yet. The interface is also in Italian for now. We prefer to say it than hide it.

**Likely follow-ups**

*How do you know it works?*
> We don't have a classroom trial yet, and we say so. The design rests on published results: attempt before help, spaced retrieval, strict grading. Measuring it with real students is the next step.

*What if the AI is wrong?*
> It can be. That is why every concept traces back to the note it came from, why grading looks for the first unjustified step against a reference solution, and why a mistake in your notes is flagged instead of silently absorbed. The graph is extracted by AI, so we treat it as a strong draft the student can check, not as truth.

*What if the internet drops the night before the exam?*
> Your graph, your schedule and the questions already prepared are on your Mac. The AI is needed only to generate new material and to grade open answers.

*What about privacy?*
> Sinapsi never writes to your notes. The text it processes goes only to the AI tools you already use with your own accounts. We don't run a server and we don't hold API keys.

---

# Note di verifica (in italiano, solo per te)

**Corretto rispetto alla versione originale**

- **OpenRouter: sbagliato.** Nel progetto non esiste nessun riferimento a OpenRouter. Sinapsi chiama le CLI `agy` (Gemini: estrazione, note vive, domande di ripasso) e `claude` (Claude: tutor e correzione) con gli abbonamenti dello studente, senza chiavi API. Per questo ho cambiato anche «requires internet/API access» in «needs a Claude or Gemini subscription».
- **Bastani et al. 2024:** il +127% riguarda l'esercitazione, non l'esame. Il gruppo con tutor «guardrail» non ha avuto danni all'esame, mentre il −17% è del GPT libero. Il testo originale metteva −17% e +127% sulla stessa riga, come se fossero entrambi voti d'esame. Lo studio è su liceali, quindi dico «high-school students» (lo conferma `docs/ricerca/revisione.md`).
- **BrokenMath:** misura che GPT-5 «dimostra» teoremi falsi nel 29% dei casi, non che «valida prove false». Ho riformulato di conseguenza e l'ho legato al correttore che cerca il primo passaggio non giustificato (`src/main/ai/rigor.ts`).
- **«Tarjan in D3»:** Tarjan sta nel main process (`src/main/graph/derive.ts`), D3 serve solo per la disposizione grafica. Nelle slide l'ho tolto: i dettagli algoritmici non servono in 5 minuti.
- **«Repairs the broken prerequisite in your graph»:** il codice non ripara il grafo. Una risposta sbagliata con sicurezza ≥ 70% segna una possibile misconcezione, che torna in un ripasso mirato. Ho scritto questo.
- **«Zod rejects any response violating pedagogical rules»:** l'insieme è Zod (struttura) più `checkTurnAgainst` e `hintGate` (regole). Ora dico «typed schemas and rules» e porto l'esempio dell'indizio saltato.
- **«Your notes stay local»:** il testo delle note viene mandato a Gemini e Claude tramite le CLI. Ora dico che le note non vengono mai modificate e che grafo, calendario e domande preparate stanno sul Mac.
- **Tempo:** la versione originale era circa 1.000 parole, cioè oltre 6 minuti. Questa è intorno a 700. Ho unito le vecchie slide 6 e 7 e ho dato alla slide finale la forma delle tre domande della giuria.

**Da confermare tu**

- **«Generalized beyond Mac/Obsidian»:** nel repo l'app è solo macOS e legge un vault Obsidian (il percorso è configurabile, quindi una cartella di Markdown dovrebbe funzionare, ma non l'ho verificato). Nello speech dico solo ciò che è vero oggi. Se hai una build diversa per il concorso, rimettilo.
- **DeepTutor:** nel repo si trova solo LearnHarness (`~/riferimenti/learnharness`). Ho lasciato DeepTutor perché lo citi tu.
- **Interfaccia in italiano:** se la giuria è internazionale, aggiungi didascalie in inglese sugli screenshot, come indicato nelle slide 4 e 5.
- **FSRS «20–30% in meno»:** è il confronto con SM-2 del benchmark open-spaced-repetition (confermato in `docs/ricerca/revisione.md`), non con «le flashcard» in generale.
