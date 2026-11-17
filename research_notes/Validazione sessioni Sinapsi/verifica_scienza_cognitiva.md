# Fact-check of the cognitive-science and neuroscience claims in the Gemini report "Ristrutturazione Neurocognitiva e Architetturale del Motore Educativo Sinapsi"

Scope: the scientific claims only. Engineering claims (state machine, Trace Forest, BKT parameters, FSRS w17-w19) are covered elsewhere and only touched on where they rest on a cognitive claim. Sources were checked against Crossref, OpenAlex, arXiv and the OSF/PsyArXiv full text on 2026-11-17. Effect sizes marked "(from the full paper, not re-checked this session)" come from my knowledge of the paper. I could not re-read those papers' text this session, so treat them as needing a second check.

Verdict legend: SUPPORTED / PARTLY SUPPORTED (direction correct, but details or scope are wrong) / MISAPPLIED (real concept, wrong application) / OVERREACH (rhetoric that goes past the evidence) / NOT FOUND (likely invented).

---

## 1. "Tri-System Theory" (Shaw & Nave 2026), "cognitive surrender", and related evidence on over-reliance on AI in learning

### Takeaway
The paper is real, and both headline numbers (73% and -15 pp) appear in it. But Gemini misstates the setting. The paper is a non-peer-reviewed preprint about adults solving Cognitive Reflection Test (CRT) puzzles with a GPT-4o chatbot. It does not study an "AI tutor", students, or learning. Its most useful finding for Sinapsi is the one Gemini leaves out: per-item feedback plus incentives cut surrender from 73% to 58%. The solid evidence on learning comes from Bastani et al. (PNAS 2025). There, unrestricted GPT-4 help improved practice performance but lowered later unassisted exam scores by 17%. A tutor with guardrails largely removed that harm.

### Cited Findings
**Existence, venue and method**
- Exact title: "Thinking—Fast, Slow, and Artificial: How AI is Reshaping Human Reasoning and the Rise of Cognitive Surrender", by Steven D. Shaw and Gideon Nave (Wharton, U. Pennsylvania). It is a preprint, posted on SSRN (DOI 10.2139/ssrn.6097646) and PsyArXiv (DOI 10.31234/osf.io/yk25n_v1, posted 2026-01-12). I found no journal version as of Nov 2026. — [SSRN via Crossref](https://doi.org/10.2139/ssrn.6097646); [PsyArXiv](https://doi.org/10.31234/osf.io/yk25n_v1)
- Method: three preregistered experiments, N = 1,372 and 9,593 trials. Participants solved seven open-ended CRT items adapted from Manfredi & Nave (2022). A GPT-4o assistant was embedded in each trial. Hidden seed prompts randomized whether the AI gave the correct answer ("AI-Accurate") or a confidently presented intuitive error ("AI-Faulty"), each with a short rationale. Study 2 added time pressure. Study 3 added a $0.20 per-item accuracy bonus plus item-level feedback. — [Shaw & Nave preprint, full text](https://doi.org/10.31234/osf.io/yk25n_v1)
- The theory proposes "System 3", artificial cognition outside the brain. "Cognitive surrender" means adopting AI outputs with minimal scrutiny, overriding System 1 and System 2. Gemini's description of the concept is accurate. — [Shaw & Nave abstract](https://doi.org/10.2139/ssrn.6097646)

**The figures**
- "Over 73%": ACCURATE, with conditions attached. In the pooled analysis across studies, on trials where the AI was engaged and wrong, 73.2% showed cognitive surrender (followed the wrong answer). 19.7% showed "cognitive offloading" (overrode the AI and answered correctly), and 7.1% were failed overrides. In Study 1 alone, participants followed faulty AI on 79.8% of chat-engaged trials and accurate AI on 92.7%. The rate is conditional on consulting the AI, which happened on about 52-54% of trials. — [Shaw & Nave full text, "Cognitive Surrender vs. Cognitive Offloading" and Study 1 results](https://doi.org/10.31234/osf.io/yk25n_v1)
- "Up to 15 points lower": ACCURATE for Study 1. Accuracy was 45.8% Brain-Only, 71.0% AI-Accurate and 31.5% AI-Faulty, i.e. +25 / -15 pp. Accurate vs faulty AI gives Cohen's h = 0.81; the pooled trial-weighted h = 0.82. — [Shaw & Nave](https://doi.org/10.31234/osf.io/yk25n_v1)
- Confidence: AI access raised global confidence by 11.7 pp (77.0% vs 65.3%; Hedges' g = 0.54). Confidence did not fall as faulty trials accumulated. Gemini's claim that AI "inflates confidence even after errors" is therefore supported. — [Shaw & Nave](https://doi.org/10.31234/osf.io/yk25n_v1)
- Mitigation that Gemini omits: in Study 3, incentives plus immediate item-level feedback lowered surrender to 57.9% and raised correct overrides to 37.1%. Accuracy on AI-Faulty trials rose by 14.4 pp. The accurate-vs-faulty gap did not close. — [Shaw & Nave](https://doi.org/10.31234/osf.io/yk25n_v1)
- Moderators: higher trust in AI predicted more surrender (OR = 2.81). Higher need for cognition (OR = 0.83) and fluid IQ (OR = 0.69) were protective. — [Shaw & Nave](https://doi.org/10.31234/osf.io/yk25n_v1)
- Authors' stated limits: lab setting, CRT only, a single exposure, and no longitudinal learning. — [Shaw & Nave, Limitations](https://doi.org/10.31234/osf.io/yk25n_v1)
- Irony relevant to Sinapsi: Shaw & Nave themselves measured confidence on a 0-100 continuous slider. — [Shaw & Nave, Key Variables](https://doi.org/10.31234/osf.io/yk25n_v1)

**Misstatements in the Gemini text**
- "Di fronte a un tutor AI" ("faced with an AI tutor"): WRONG. The AI was a reasoning assistant on logic puzzles, not a tutor, and nothing was learned or retained. — [Shaw & Nave method](https://doi.org/10.31234/osf.io/yk25n_v1)
- "Evidenze della Tri-System Theory dimostrano che un Sistema 3 altamente verboso infonde sicurezza artificiale negli studenti" ("Tri-System Theory evidence shows a highly verbose System 3 instills false confidence in students"): OVERSTATED. The paper shows inflated confidence, but it did not vary verbosity and did not study students. — [Shaw & Nave](https://doi.org/10.31234/osf.io/yk25n_v1)
- A secondary source cites the paper as ">79%" rather than 73%. It is mixing the Study 1 figure with the pooled one. — [Canale, "The Surrender Loop", Zenodo 2026](https://doi.org/10.5281/zenodo.18626182)

**Solid evidence on AI over-reliance in learning**
- Bastani, Bastani, Sungu, Ge et al., PNAS 2025, "Generative AI without guardrails can harm learning: Evidence from high school mathematics". The SSRN working title was "Generative AI can harm learning". It is a field experiment with about 1,000 Turkish high-school students. During practice, GPT Base raised grades by 48% and GPT Tutor (prompted with learning safeguards, giving hints rather than answers) by 127%. When access was then removed, GPT Base students scored 17% lower than students who never had access, and GPT Tutor "largely mitigated" that harm. Students used unrestricted GPT-4 as a "crutch". — [Bastani et al., PNAS 2025](https://doi.org/10.1073/pnas.2422633122). A published correction exists. — [PNAS correction](https://doi.org/10.1073/pnas.2518204122)
- Kosmyna et al., "Your Brain on ChatGPT: Accumulation of Cognitive Debt when Using an AI Assistant for Essay Writing Task". This is an arXiv preprint (2506.08872, June 2025), not peer-reviewed. N = 54, with only 18 completing session 4. EEG showed the weakest connectivity in LLM users. LLM-to-Brain participants showed under-engagement, and LLM users had trouble quoting their own essays. The sample is small and the EEG interpretation is contested, so treat it as suggestive only. — [arXiv 2506.08872](https://arxiv.org/abs/2506.08872)
- Gerlich 2025, Societies 15(1):6. A survey plus interviews with N = 666 found a negative correlation between frequent AI use and critical-thinking scores, mediated by cognitive offloading. The design is cross-sectional and correlational, so it cannot support causal claims. — [Gerlich 2025](https://doi.org/10.3390/soc15010006)
- Lehmann, Cornelius & Sting, "AI Meets the Classroom: When Does ChatGPT Harm Learning?" (SSRN 2024). The paper exists. I could not retrieve its abstract this session. From memory of the paper (needs a check): LLM use as a substitute (getting solutions) hurt learning, use as a complement (explanations) did not, and students overestimated how much they learned. — [SSRN 10.2139/ssrn.4941259](https://doi.org/10.2139/ssrn.4941259)
- Emerging preprints on "metacognitive friction": an "Explanation Gate" that requires teach-back before AI code can be used. In a 30-minute AI-blackout task, the failure rate was 39% with the gate vs 77% with unrestricted AI. The study has N = 78 and is not peer-reviewed. — [arXiv 2602.20206](https://doi.org/10.48550/arxiv.2602.20206). In "Engage-to-Unlock" (N = 398), generative help is unlocked only after the user engages with the task. — [arXiv 2610.01518](https://doi.org/10.48550/arxiv.2610.01518)

### Inferences
- Design implications for Sinapsi that hold up:
  - (a) Ask for the student's own answer before any AI explanation or hint. Bastani's GPT Tutor and the Engage-to-Unlock/teach-back pattern both work this way.
  - (b) Give immediate per-item correctness feedback. This is the one manipulation that reduced surrender in Shaw & Nave.
  - (c) Collect confidence before showing feedback, because AI exposure inflates confidence.
  - (d) Validate AI grading independently. Shaw & Nave show users rarely override a confident wrong AI, so a wrong verdict from Sinapsi's grader would likely be accepted.
- Gemini's "Tri-System" framing is fine as rhetoric. Its empirical support for learning-app design comes from Bastani, not from Shaw & Nave.

### Gaps
- I could not access the content of the PNAS correction for Bastani et al.
- I could not retrieve the Lehmann et al. abstract or effect sizes.
- I found no peer-reviewed journal version of Shaw & Nave.

---

## 2. Bjork's New Theory of Disuse and Desirable Difficulties

### Takeaway
The report broadly gets this right. Storage strength and retrieval strength are independent. Storage strength is never lost. Gains in storage strength are larger when retrieval strength is low. Two errors: the claim that "LTP mechanisms translate into" the New Theory of Disuse is invented (the theory is purely behavioral), and equating FSRS Stability with Bjork's storage strength is loose. The well-established desirable difficulties are retrieval practice, spacing, interleaving and generation. A difficulty is only desirable if the learner can eventually succeed or gets corrective feedback.

### Cited Findings
- Bjork & Bjork (1992), "A new theory of disuse and an old theory of stimulus fluctuation", in Healy, Kosslyn & Shiffrin (Eds.), *From Learning Processes to Cognitive Processes*. Storage strength accumulates and is never lost. Retrieval strength fluctuates and decays. The lower the current retrieval strength, the larger the gain in storage strength from a successful retrieval or study event. The chapter is a book chapter with no DOI. Its content is restated in a peer-reviewed application. — [Lang, Craske & Bjork 1999, Clin Psychol Sci Pract](https://doi.org/10.1093/clipsy.6.1.80)
- Unsuccessful retrieval attempts followed by the answer improve later learning compared with read-only study, even when the attempt surely fails. — [Kornell, Hays & Bjork 2009, JEP:LMC](https://doi.org/10.1037/a0015729)
- Interleaving or spacing exemplars improved category induction, even though learners believed massing worked better. — [Kornell & Bjork 2008, Psych Science](https://doi.org/10.1111/j.1467-9280.2008.02127.x)
- Dunlosky et al. (2013) rated 10 techniques. High utility: practice testing and distributed practice. Moderate: interleaved practice, elaborative interrogation, self-explanation. Low: highlighting, rereading, summarization, keyword mnemonic, imagery for text. The ratings are from the full monograph, not re-checked this session. — [Dunlosky et al. 2013, PSPI](https://doi.org/10.1177/1529100612453266)
- Learners' predictions of their own performance were uncorrelated with actual retention. Repeated testing produced large retention gains, while repeated study after the first correct recall had no effect. — [Karpicke & Roediger 2008, Science](https://doi.org/10.1126/science.1152408)

### Inferences
- The report's "LTP translates into New Theory of Disuse" link is decorative. The theory makes no neural claims.
- FSRS Stability falls after a lapse, while Bjork's storage strength never decreases. FSRS Retrievability matches retrieval strength reasonably well. Stability is a fitted behavioral parameter, not storage strength.
- Gemini's critique that "continuous fluent explanations keep retrieval strength saturated" points in the right direction. The actionable fix is to replace re-explanation with retrieval attempts, plus spacing across sessions.
- Undesirable difficulties include extraneous interface friction and material too hard to retrieve or generate without feedback. Difficulty is desirable only when the learner can respond to it.

### Gaps
- I did not retrieve the 1992 chapter text directly.
- I did not find a review that maps FSRS parameters onto Bjork's constructs.

---

## 3. Size of the retrieval-practice (testing) effect, the role of feedback, and feedback timing

### Takeaway
Retrieval practice is one of the most robust effects in learning science, around g = 0.5 in classroom meta-analyses. Recall tests beat recognition tests. Corrective feedback strengthens the effect substantially. Feedback also helps correct answers given with low confidence. Delayed feedback can match or beat immediate feedback for retention and transfer. But "never reveal" is not supported.

### Cited Findings
- Classroom meta-analysis of 222 studies and 48,478 students: overall g = 0.499. The effect is moderated by corrective feedback, number of repetitions, format consistency and other factors. — [Yang, Luo, Vadillo, Yu 2021, Psych Bulletin](https://doi.org/10.1037/bul0000309)
- Testing vs restudy meta-analysis: initial recall tests give larger benefits than recognition tests, which supports effortful processing as a mechanism. The overall g ≈ 0.50 and the feedback moderation (larger effect with feedback) are from the full paper, not re-checked. — [Rowland 2014, Psych Bulletin](https://doi.org/10.1037/a0037559)
- Practice tests beat restudying and all other comparison conditions. Overall g ≈ 0.61, and about 0.51 vs restudy (from the full paper, not re-checked). — [Adesope, Trevisan & Sundararajan 2017, RER](https://doi.org/10.3102/0034654316689306)
- Feedback after a test doubled retention of correct answers given with low confidence, compared with no feedback. Feedback corrects metacognitive errors as well as memory errors. — [Butler, Karpicke & Roediger 2008, JEP:LMC](https://doi.org/10.1037/0278-7393.34.4.918)
- Feedback after errors is essential: without it, errors persist. Feedback after correct answers adds little. Details are from the full paper. — [Pashler, Cepeda, Wixted & Rohrer 2005, JEP:LMC](https://doi.org/10.1037/0278-7393.31.1.3)
- In a college engineering course, feedback delayed by one week produced better transfer on exams than immediate feedback, even though students preferred immediate feedback. — [Mullet, Butler, Verdin & von Borries 2014, JARMAC](https://doi.org/10.1016/j.jarmac.2014.05.001)
- Delayed feedback on multiple-choice tests improved retention in the lab. — [Butler, Karpicke & Roediger 2007 (record via PsycEXTRA)](https://doi.org/10.1037/e527352012-769)

### Inferences
- For Sinapsi:
  - (1) Prefer open recall (`kind: 'open'`) over multiple choice for long-term retention.
  - (2) Always give corrective feedback, and give it even on correct answers when confidence was low.
  - (3) Delays of seconds to a turn are harmless. Delays of days help transfer in some studies. Withholding the answer entirely is not supported.
  - (4) Log every in-session retrieval. The point is not to "save a molecular window" (see §8). It is that each logged retrieval is a data point FSRS needs to schedule well.

### Gaps
- Exact Rowland and Adesope moderator values need a re-read of the full papers.
- The immediate-vs-delayed literature is mixed overall. Kulik & Kulik (1988) is often cited for immediate feedback in classroom settings, but I did not verify it this session.

---

## 4. The hypercorrection effect, "VibeCheck / Metacognitive Friction Insertion", productive failure and self-explanation

### Takeaway
Hypercorrection is real: errors made with high confidence are corrected more readily, *after corrective feedback*. That makes confidence ratings valuable, but the evidence points to revealing the correct answer, not withholding it. "VibeCheck" is not an established learning-science pattern; I found no record of it. "Metacognitive friction" exists only as an emerging 2026 preprint term. The defensible core of Gemini's idea is: ask for the student's reasoning or a self-explanation, then give corrective feedback that addresses that reasoning. That is supported by Metcalfe (2017), Chi (self-explanation) and Kapur (productive failure, for initial learning).

### Cited Findings
- Errors endorsed with high confidence were the most likely to be corrected on a later retest after feedback. This contradicted the authors' interference-based prediction. — [Butterfield & Metcalfe 2001, JEP:LMC](https://doi.org/10.1037/0278-7393.27.6.1491)
- Review: errorful learning followed by corrective feedback is beneficial, especially for high-confidence errors. "Corrective feedback, including analysis of the reasoning leading up to the mistake, is crucial." Error tolerance encourages generative engagement. — [Metcalfe 2017, Annual Review of Psychology](https://doi.org/10.1146/annurev-psych-010416-044022)
- Low-confidence correct answers benefit from feedback too: retention doubled. — [Butler et al. 2008](https://doi.org/10.1037/0278-7393.34.4.918)
- Productive failure: a meta-analysis of 53 studies and 166 comparisons found problem-solving-then-instruction (PS-I) beats instruction-then-problem-solving, g = 0.36 [0.20, 0.51]. It rises to g = 0.37-0.58 with high fidelity to Productive Failure principles. Trends reversed for younger learners (grades 2-5). Instruction always follows the attempt. — [Sinha & Kapur 2021, RER](https://doi.org/10.3102/00346543211019105)
- Self-explanation: students prompted to self-explain each line of a text learned more than students who read it twice, and high explainers built better mental models. — [Chi, de Leeuw, Chiu & LaVancher 1994, Cognitive Science](https://doi.org/10.1207/s15516709cog1803_3)
- Attempting before seeing the answer helps even when the attempt fails, provided the answer follows. — [Kornell, Hays & Bjork 2009](https://doi.org/10.1037/a0015729)
- Search for "VibeCheck" and "metacognitive friction insertion" in OpenAlex: no peer-reviewed source uses "VibeCheck" as a pedagogical pattern. The closest hits are 2026 preprints on "metacognitive friction", such as the "Explanation Gate" teach-back. — [arXiv 2602.20206](https://doi.org/10.48550/arxiv.2602.20206); [arXiv 2610.01518](https://doi.org/10.48550/arxiv.2610.01518)
- The claim that friction "prepares the neurochemical ground through dopaminergic modulation" has no source in the report, and I found none linking it to this design. OVERREACH.

### Inferences
- Recommended flow for a wrong open answer:
  1. The student commits an answer and a confidence rating before any feedback.
  2. Optionally, one Socratic probe or "explain your reasoning" turn, which Metcalfe calls analysis of the reasoning behind the error.
  3. Then explicit corrective feedback with the correct answer and why the error was tempting.
  4. Then re-test later in the session or at the next FSRS review.
- Do not loop hints indefinitely before revealing the answer. That has no evidence base, and it adds frustration and extraneous load.
- High-confidence errors are the best moment for a vivid correction, not a reason to delay it. Flag them for an early re-test, because hypercorrection is strongest on short delays and can fade.
- Productive failure is a strategy for *introducing* new concepts (attempt first, then teach). It is not a rule for error correction. It also requires well-designed problems.

### Gaps
- Evidence on how long hypercorrection lasts over long delays was not retrieved this session.
- I found no direct RCT of "Socratic probe before correction" vs "immediate correction" in LLM tutors.

---

## 5. Cognitive Load Theory, split attention, expertise reversal, worked-example fading

### Takeaway
Gemini's split-attention diagnosis of the 60/40 layout is MISAPPLIED. In CLT, the split-attention effect arises when learners must mentally integrate *mutually referring* sources that are unintelligible on their own, such as a diagram and separate text labels, because the sources are separated in space or time. The fix is to place them close together. A side-by-side lesson and question panel is, if anything, spatial contiguity. The real risk is different: if the lesson stays visible while the student answers, the "retrieval" can become look-up. The report's "vector sum of three load types" is also outdated, since CLT no longer treats germane load as an independent additive load.

### Cited Findings
- Meta-analysis of spatial and temporal contiguity: integrating related sources physically or in time improves learning. Reported d ≈ 0.72 (spatial) and 0.78 (temporal), from the full paper, not re-checked. — [Ginns 2006, Learning and Instruction](https://doi.org/10.1016/j.learninstruc.2006.10.001)
- CLT updated review: germane load has been reconceptualized. It is no longer a third independent load but relates to working-memory resources devoted to intrinsic load. Total load is intrinsic plus extraneous. This summary comes from the paper, not re-read this session. — [Sweller, van Merriënboer & Paas 2019, Educ Psych Review](https://doi.org/10.1007/s10648-019-09465-5)
- Expertise reversal: techniques that help novices (e.g., worked examples, integrated formats) can lose effectiveness or hurt more experienced learners. — [Kalyuga, Ayres, Chandler & Sweller 2003, Educ Psychologist](https://doi.org/10.1207/s15326985ep3801_4)
- Gradually fading worked-solution steps, moving from worked example to completion problem to independent solving, supports transfer from a cognitive-load perspective. — [Renkl, Atkinson & Große 2004, Instructional Science](https://doi.org/10.1023/b:truc.0000021815.74806.f6)

### Inferences
- Do not justify UI changes with "split attention" unless the question actually requires integrating information from both panels, e.g. "refer to the diagram on the left".
- The more relevant principles:
  - (a) Hide or collapse the lesson panel while a retrieval question is being answered. This keeps the question a closed-book retrieval, in line with Rowland's finding that effortful recall drives the effect.
  - (b) Keep the question and its own materials together.
  - (c) Adapt support to expertise: fade explanations as mastery grows. This is the expertise reversal effect and worked-example fading, and it legitimately supports the report's "scaffold fading" idea.
- The "60,000 characters causes extraneous load for the user" claim conflates the LLM context window with the learner's working memory. It is only a learner-load problem if that text is shown to the learner.

### Gaps
- The Ginns effect sizes and the Sweller 2019 germane-load wording need a re-check against the full text (abstracts were not returned by the API).

---

## 6. Anchoring from a confidence slider that defaults to 50, and best practice for confidence judgments

### Takeaway
PARTLY SUPPORTED. There is direct survey-methodology evidence that default slider positions on 101-point sliders pull responses toward the default. On 7- and 21-point scales there was no consistent effect. Removing the default (requiring a click) is a reasonable fix, at the cost of slightly more missing data on 101-point scales. "Anchoring" in Tversky-Kahneman's sense is a loose label. The documented mechanism is default acceptance or satisficing. Best practice is a short discrete scale with required input, collected before feedback.

### Cited Findings
- Four web experiments (n = 3,744, 490, 697 and 902). On 101-point sliders, defaults of 25, 50, 75 or 100 made significantly more respondents choose exactly those values. On 21- and 7-point scales the default had no significant or consistent impact. With no default (the slider activates on click), missing data was low for 7/21-point scales but higher for 101-point scales. — [Liu & Conrad 2018, Social Science Computer Review](https://doi.org/10.1177/0894439318755336)
- Hypercorrection and feedback studies that use confidence rely on discrete ratings collected before feedback. Butler et al. (2008) collected a confidence judgment after each response and before feedback. — [Butler et al. 2008](https://doi.org/10.1037/0278-7393.34.4.918)
- Learners' predictions of their own retention can be uncorrelated with actual performance, so confidence needs calibration feedback to be useful. — [Karpicke & Roediger 2008](https://doi.org/10.1126/science.1152408)
- AI assistance inflates confidence (+11.7 pp), even after errors. — [Shaw & Nave 2026](https://doi.org/10.31234/osf.io/yk25n_v1)

### Inferences
- Concrete recommendation:
  - Replace the 0-100 slider defaulting to 50 with a required 4- or 5-point discrete confidence choice, with no pre-selection, e.g. "guessing / unsure / fairly sure / certain".
  - Collect it for both MCQ and open answers, always before the verdict.
  - Use it to (i) flag high-confidence errors for hypercorrection-style feedback and early re-test, (ii) always show feedback on low-confidence correct answers, and (iii) refine the FSRS grade mapping.
- A discrete scale also maps more cleanly onto the four FSRS grades than a continuous 0-100 value.
- Over time, a calibration display ("when you say 'certain', you are right X% of the time") is a plausible metacognitive aid. I found no direct citation for it this session.

### Gaps
- I found no study of default slider positions specific to *confidence* elicitation in learning (as opposed to opinion surveys).
- I did not verify the delayed-JOL effect (Nelson & Dunlosky 1991: judgments of learning made after a delay are far more accurate than immediate ones) this session. It is relevant if Sinapsi asks "how well will you remember this?".

---

## 7. Illusion of Explanatory Depth and fluency illusion

### Takeaway
SUPPORTED as described. Asking people to generate a detailed *mechanistic* explanation reduces the illusion; listing reasons does not. This supports collecting confidence and requiring explanations on open questions. It also supports a confidence rating *before and after* an explain-it attempt as a cheap way to measure the illusion.

### Cited Findings
- People feel they understand complex phenomena with far more precision and depth than they do. The illusion is stronger for explanatory knowledge than for facts, procedures or narratives. It was shown through self-ratings that dropped after participants tried to explain. — [Rozenblit & Keil 2002, Cognitive Science](https://doi.org/10.1207/s15516709cog2605_1)
- Asking people to explain policies mechanistically reduced the illusion and moderated attitudes. Listing reasons did not. — [Fernbach, Rogers, Fox & Sloman 2013, Psych Science](https://doi.org/10.1177/0956797612464058)
- Self-explanation prompts improve understanding. — [Chi et al. 1994](https://doi.org/10.1207/s15516709cog1803_3)
- Learners judge their learning poorly and prefer techniques that feel fluent, such as rereading or immediate feedback, over more effective ones. — [Karpicke & Roediger 2008](https://doi.org/10.1126/science.1152408); [Mullet et al. 2014](https://doi.org/10.1016/j.jarmac.2014.05.001)

### Inferences
- The report is right that open "explain how/why" questions with confidence ratings are the best probe for this illusion in Sinapsi.
- The prompt should ask for a causal or mechanistic chain ("explain step by step how X leads to Y"), not "list the reasons".
- The specific claim that "fluent AI explanations are mistaken for personal understanding" is plausible. Shaw & Nave show the confidence inflation. Direct learning-science evidence specific to LLM explanations was not found.

### Gaps
- No direct study of the illusion of explanatory depth with LLM-generated explanations was found.

---

## 8. The LTP / NMDA / AMPA / "plasticity-protein half-life" passage and optimal first-review timing

### Takeaway
The molecular textbook facts are correct (NMDA magnesium block removed by depolarization, calcium influx, AMPA receptor insertion, protein synthesis for late LTP). The design inference is OVERREACH. Molecular events during in-session retrieval happen whether or not the app *logs* them. Logging affects *scheduling*, not synaptic consolidation. The report also conflates synaptic consolidation (hours) with systems consolidation in neocortex (weeks to years). What matters for design is the behavioral spacing literature. The optimal gap before the first review scales with how long you need to remember: roughly 20-40% of the retention interval for a 1-week target, and 5-10% for a 1-year target.

### Cited Findings
- Cepeda et al. 2008 (more than 1,350 participants; gaps up to 3.5 months; tests up to 1 year later): at any test delay, increasing the study gap first raised and then slowly reduced final performance. The optimal gap grew with test delay. As a proportion of test delay, it fell from about 20-40% (1-week test) to about 5-10% (1-year test). — [Cepeda, Vul, Rohrer, Wixted, Pashler 2008, Psych Science](https://doi.org/10.1111/j.1467-9280.2008.02209.x)
- Meta-analysis of 839 assessments in 317 experiments: spacing beats massing, and the optimal inter-study interval increases with the retention interval. — [Cepeda, Pashler, Vul, Wixted, Rohrer 2006, Psych Bulletin](https://doi.org/10.1037/0033-2909.132.3.354)
- Repeated *testing* after first correct recall, not repeated study, drove long-term retention. Dropping items after one correct recall hurt delayed recall. — [Karpicke & Roediger 2008](https://doi.org/10.1126/science.1152408)

### Inferences
- The correct reason to write in-session retrievals into `reviews.jsonl` is behavioral and algorithmic. Without it, FSRS treats a concept just studied as "never seen" and cannot schedule the first spaced review at about 1 day out. Same-day repeats add little long-term stability; this matches FSRS's short-term handling of same-day reviews.
- Cut the "plasticity proteins have a limited half-life, so untracked recall is wasted" framing from any design rationale. No study links app logging to synaptic tagging or capture windows.
- Practical schedule: 1-3 retrievals in-session (spaced within the session if possible), then the first review the next day or within a few days, then expanding intervals via FSRS.

### Gaps
- I did not retrieve a primary neuroscience source this session (e.g., Frey & Morris 1997 on synaptic tagging, or Malenka & Bear 2004 LTP review). The molecular description is standard textbook content but uncited here.
- I found no study linking retrieval-practice timing in apps to molecular consolidation windows in humans.

---

## 9. Scaffolding, ZPD and scaffold fading in intelligent tutoring systems

### Takeaway
SUPPORTED in general. Intelligent tutoring systems (ITS) and computer-based scaffolding have solid meta-analytic support. Fading support as mastery grows is consistent with expertise reversal and worked-example fading. The specific "BKT mastery 0.85 triggers fading" recipe is an engineering choice, not an evidence-backed threshold. ITS literature conventionally uses about 0.95 for mastery. Gemini's 0.85 has no cited basis.

### Cited Findings
- ITS vs no tutoring: d = 0.76, nearly matching human tutoring at d = 0.79, far below the folk belief of 2.0. Step-based granularity was about as effective as finer granularity. — [VanLehn 2011, Educational Psychologist](https://doi.org/10.1080/00461520.2011.611369)
- 50 controlled ITS evaluations: median effect 0.66 SD (50th to 75th percentile). Effects were much smaller on standardized tests than on locally developed tests. — [Kulik & Fletcher 2016, RER](https://doi.org/10.3102/0034654315581420)
- Computer-based scaffolding in STEM (144 studies, 333 outcomes): ḡ = 0.46 on cognitive outcomes. — [Belland, Walker, Kim & Lefler 2017, RER](https://doi.org/10.3102/0034654316670999)
- Expertise reversal and fading: see §5. — [Kalyuga et al. 2003](https://doi.org/10.1207/s15326985ep3801_4); [Renkl et al. 2004](https://doi.org/10.1023/b:truc.0000021815.74806.f6)
- An LLM tutor with guardrails (hints, not answers) removed the learning harm of unrestricted GPT-4. — [Bastani et al. 2025](https://doi.org/10.1073/pnas.2422633122)

### Inferences
- Step-level interaction (one concept or step at a time, with feedback on each) is the evidence-backed granularity. This supports Gemini's "one Concept.id at a time" proposal.
- Fading: start with worked explanations and examples for new or low-R concepts, move to prompts and completion questions, then open retrieval. Keep the threshold configurable.
- ITS effects shrink on standardized or transfer tests, so Sinapsi should evaluate itself with delayed, unassisted tests (as Bastani did), not in-session performance.

### Gaps
- I did not retrieve sources for the original BKT 0.95 mastery convention (Corbett & Anderson 1995) or for Wood, Bruner & Ross 1976 on scaffolding. These are standard but uncited here.
- I found no controlled evidence on LLM-specific scaffold-fading schedules.
