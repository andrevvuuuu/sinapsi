# Correzioni proposte da Argon (secondo revisore) al report "Audit proposte grafo concettuale"
(testo fornito dall'utente, riportato in sintesi fedele)

Concorda con: matematica P4 e retrievabilityAt in fsrs.ts; scarto P6a; bug silenziosi (weakness attive in review.memory() review.ts:261-262; descendants della lente fragile fuori dal loop draw.ts:265 precalcolato per modelKey; isMoc in linked.ts e toggle Frontiera(0) in liveOnly()); riuso di treeBrief e review.plan({conceptIds}) con goalIds espliciti (evitando bug resolveGoals su parole <4 lettere come "Limite").

Critica 1 — Sibling priming in P1: il report propone di passare [...weak, c.id] a onReview ordinando per depth a fasce. Così il priming verticale delle premesse gonfia il voto su c.id. Correzione: (a) testare c.id a freddo in testa alla coda, oppure (b) aggiornare FSRS solo su [...weak] e mostrare c.id come sintesi non registrata in reviews.jsonl.

Critica 2 — MOC estratti e proposizioni zombie (0a/0c): in deriveGraph c.birth = prima nota in cui il concetto è estratto; buildModel usa birth per assegnare la Regione. Se i MOC vengono estratti prima, i concetti "nascono" nel MOC, svuotando le regioni dei capitoli e falsando R medio. Inoltre ritirare solo le chains per ultima estrazione ok lascia in propositions.jsonl concetti rimossi → falsi orfani. Correzione: (a) isMoc deve escludere i MOC dalla coda di estrazione (jobs.ts/extract.ts) oltre che da linked.ts, e pulire dal ledger i concetti nati nei MOC (Algebra Lineare MOC / Analisi 1 MOC, 133 proposizioni); (b) deriveGraph filtra per ultima estrazione ok sia chains sia c.notes; concetti con notes.length===0 ritirati.

Critica 3 — MVP P2 con MC a distrattori casuali (stessa regione/depth) viola la letteratura: distrattori banalmente escludibili, riconoscimento che gonfia S. Correzione: Cloze/Cued recall deterministico (Premessa1 + [???] ⇒ Conclusione), rivela nome e statement LaTeX, auto-valutazione tipo flashcard; regola FSRS asimmetrica: fallimento registra fallimento/sospetto; successo aggiorna FSRS solo se lo studente ha enunciato il contenuto a freddo.

Critica 4 — Falso senso di sicurezza sui 123 concetti: con il primo anno completo (SMIA: Analisi 1, Algebra Lineare, Programmazione...) si superano 150 note e 1.500–2.000 concetti. Precalcolo lenti su modelKey deve diventare step 0d prima di toccare altro in draw.ts.

# Nuova proposta dell'utente
Cliccando su un collegamento (freccia/catena) tra due concetti, l'app spiega perché sono collegati.
