# Evidenze di scienze dell'apprendimento per le proposte P1, P2, P3, P5, P6 (grafo concettuale di Sinapsi)

Nota di metodo. Ricerca svolta il 2026-11-18 con Crossref, OpenAlex, Semantic Scholar, arXiv e fetch diretti (Nature, documentazione Anki, blog Expertium). Le API hanno limitato spesso le richieste (HTTP 429), quindi non ho potuto aprire il testo integrale di diversi lavori. Uso due etichette:
- **[V]** = verificato in questa sessione su abstract o testo integrale (cifre comprese).
- **[M]** = esistenza e DOI verificati, ma cifre o dettagli riportati da conoscenza pregressa e non ricontrollati sul testo integrale. Vanno riverificati prima di essere citati come numeri esatti.

Le affermazioni su Sinapsi (moduli, soglie) vengono dall'audit: /Users/andreaantonelli/Progetti/Sinapsi/research_notes/Audit proposte grafo concettuale/00_audit_esterno.md

---

## Q1. Retrieval practice e ordinamento per prerequisiti (P1, ripasso a cascata bottom-up)

### Takeaway
Il richiamo attivo (testing) è la tecnica di studio con l'evidenza più solida, e P1 lo sfrutta. Non ho trovato però nessuna evidenza diretta che *ripassare* i prerequisiti in ordine di profondità crescente sia meglio di un ordine misto o "dal target". Nella matematica, inoltre, la pratica interleaved batte quella a blocchi con effetti grandi in classe. Una coda rigidamente bottom-up rischia quindi di diventare una sessione a blocchi e prevedibile. La teoria degli spazi di conoscenza (ALEKS) giustifica l'ordinamento per prerequisiti nell'*apprendimento di cose nuove* (outer fringe), non nel ripasso.

### Cited Findings
- **Testing effect, meta-analisi Rowland 2014** (Psychological Bulletin): il test batte la rilettura. I test di richiamo (recall) danno benefici maggiori dei test di riconoscimento (recognition), a favore del ruolo dello "sforzo di elaborazione" [V]. Effetto medio g circa 0,50 [M]. — [Rowland 2014, doi:10.1037/a0037559](https://doi.org/10.1037/a0037559)
- **Meta-analisi Adesope, Trevisan & Sundararajan 2017** (Review of Educational Research): i test di pratica sono più efficaci della rilettura e di tutte le altre condizioni di confronto. Gli effetti dipendono dal formato del test, dal campione e dagli esiti misurati [V]. Effetto complessivo g circa 0,61 [M]. — [Adesope et al. 2017, doi:10.3102/0034654316689306](https://doi.org/10.3102/0034654316689306)
- **Dunlosky et al. 2013** (PSPI): giudicano ad alta utilità solo *practice testing* e *distributed practice*. Danno utilità moderata a *elaborative interrogation*, *self-explanation* e *interleaved practice*, bassa a rilettura ed evidenziazione [M per i rating; articolo verificato]. — [Dunlosky et al. 2013, doi:10.1177/1529100612453266](https://doi.org/10.1177/1529100612453266)
- **Interleaving in matematica, RCT a cluster (Rohrer, Dedrick, Hartwig & Cheung 2020)**, preregistrato, 54 classi di seconda media (USA), 4 mesi. Al test a sorpresa dopo un mese il gruppo interleaved ottiene 61% contro il 38% del gruppo a blocchi, **d = 0,83** [V]. — [Rohrer et al. 2020, J. Educ. Psychol., doi:10.1037/edu0000367](https://doi.org/10.1037/edu0000367)
- **Rohrer, Dedrick & Stershic 2015**: l'interleaving migliora l'apprendimento della matematica a scuola [M per le cifre]. — [doi:10.1037/edu0000001](https://doi.org/10.1037/edu0000001); vedi anche **Taylor & Rohrer 2010** "The effects of interleaved practice" — [doi:10.1002/acp.1598](https://doi.org/10.1002/acp.1598)
- **Meta-analisi Brunmair & Richter 2019** (Psychological Bulletin): l'effetto dell'interleaving è più forte quando i materiali sono simili *tra* categorie, poco simili *dentro* le categorie, e più complessi. Per testi espositivi e parole va usato "con cautela", perché per le parole l'effetto è negativo (circa −0,39) [V]. Effetto complessivo circa g = 0,42, con la matematica su valori moderati [M]. — [Brunmair & Richter 2019, doi:10.1037/bul0000209](https://doi.org/10.1037/bul0000209)
- **Knowledge Space Theory / Learning Spaces (Falmagne & Doignon 2011)**: lo stato di conoscenza è l'insieme degli item padroneggiati. L'**outer fringe** sono gli item che lo studente è "pronto a imparare" subito (tutti i loro prerequisiti sono nello stato). L'**inner fringe** sono gli item "appena appresi", rimovibili senza violare la struttura [M sulle definizioni; volume verificato]. — [Falmagne & Doignon, *Learning Spaces*, Springer 2011, doi:10.1007/978-3-642-01039-2](https://doi.org/10.1007/978-3-642-01039-2)
- **Efficacia di ALEKS**: la meta-analisi di Fang, Ren, Hu & Graesser (2019, *Educational Psychology*) riporta che ALEKS non supera significativamente l'insegnamento tradizionale in media, mentre risulta utile come *supplemento* [M: non sono riuscito a recuperare l'abstract per i limiti delle API]. — Gap da verificare.

### Inferences
- P1 ha una base solida in quanto *trasforma un'evidenziazione passiva in retrieval*: è il beneficio principale, ed è indipendente dall'ordinamento.
- L'ordinamento per profondità *non* ha supporto empirico diretto *per il ripasso*. KST/ALEKS ordinano per prerequisiti la scelta del *prossimo item da imparare* (outer fringe), non la sequenza del ripasso di un sottoalbero già studiato.
- Tensione con l'interleaving: una cascata ordinata per depth produce item adiacenti molto correlati e prevedibili ("questo viene dopo quello"). La sequenza fa da indizio e la discriminazione tra item non viene esercitata. Il meccanismo che rende utile l'interleaving in matematica, cioè scegliere la strategia o la proposizione giusta senza indizi dal contesto, viene così soppresso. Un compromesso sensato è filtrare per prerequisiti deboli (R < soglia), lasciando l'ordine parzialmente mescolato, o mescolare tra i nodi dello stesso livello di profondità.
- C'è anche un argomento a favore del bottom-up: con prerequisiti davvero non posseduti, interrogare prima il teorema produce fallimento senza apprendimento. Questo vale per la *comprensione* (stile ALEKS), meno per la *ritenzione* di cose già capite.

### Gaps
- Non ho trovato studi (RCT o lab) che confrontino un ripasso ordinato per prerequisiti con uno interleaved o target-first su materiale gerarchico universitario.
- Numeri esatti della meta-analisi ALEKS (Fang et al. 2019) non verificati.
- Gli RCT di Rohrer riguardano la scuola media (problemi procedurali), non la memorizzazione di enunciati di teoremi all'università. Il trasferimento a P1 è un'estrapolazione.

---

## Q2. Retrieval relazionale e strutturale (P2, quiz di occlusione su catene di implicazione)

### Takeaway
Recuperare un elemento mancante di una catena è una forma di retrieval più generazione, e per questo è ben supportata. La forma conta: il richiamo libero o la risposta breve battono il riconoscimento nella meta-analisi di Rowland, mentre la scelta multipla ben costruita (distrattori plausibili, feedback) può comunque funzionare. Sulle mappe concettuali, le prove di Karpicke dicono che *costruire* la mappa studiando è meno utile che *recuperare*, e che il retrieval su mappa (mappa disegnata a memoria) funziona quanto il richiamo libero. La "mappa muta" attuale è di fatto retrieval non verificato (self-explanation), mentre P2 aggiunge verifica e registrazione. La self-explanation ha comunque evidenza meta-analitica propria, quindi va conservata, non sostituita del tutto.

### Cited Findings
- **Karpicke & Blunt 2011** (Science): la pratica di retrieval produce più apprendimento significativo (anche su domande inferenziali) dello studio elaborativo con costruzione di mappe concettuali [V da TLDR/abstract]. Il vantaggio compare al test dopo una settimana, sia su domande verbatim sia inferenziali [M]. — [Karpicke & Blunt 2011, doi:10.1126/science.1199327](https://doi.org/10.1126/science.1199327). Commenti critici e risposta degli autori: [doi:10.1126/science.1204035](https://doi.org/10.1126/science.1204035)
- **Blunt & Karpicke 2014** (J. Educ. Psychol., 106(3)): costruire la mappa concettuale *a memoria* (retrieval-based concept mapping) è efficace quanto il richiamo libero scritto. È il formato a contare meno del processo di recupero [M: non verificato sull'abstract per i limiti delle API].
- **O'Day & Karpicke 2021** (J. Educ. Psychol.): due esperimenti. Al test dopo 1 settimana il retrieval batte la costruzione di mappe concettuali, e *combinare* mappa più retrieval non dà alcun beneficio rispetto al solo retrieval, pur richiedendo molto più tempo [V]. — [doi:10.1037/edu0000486](https://doi.org/10.1037/edu0000486)
- **Meta-analisi Schroeder, Nesbit, Anguiano & Adesope 2018** (Educ. Psychol. Review): studiare e costruire mappe concettuali dà benefici moderati rispetto ad altre attività (circa g = 0,58 complessivo; costruire > studiare) [M per le cifre; articolo verificato]. — [doi:10.1007/s10648-017-9403-9](https://doi.org/10.1007/s10648-017-9403-9)
- **Self-explanation**: Chi et al. 1989 (Cognitive Science) mostrano che gli studenti migliori si autospiegano gli esempi risolti [M per i dettagli]. — [doi:10.1207/s15516709cog1302_1](https://doi.org/10.1207/s15516709cog1302_1). La **meta-analisi Bisra, Liu, Nesbit, Salimi & Winne 2018** (Educ. Psychol. Review; 64 studi) trova che indurre la self-explanation ha un effetto moderato, circa g = 0,55 [M per le cifre; articolo verificato]. — [doi:10.1007/s10648-018-9434-x](https://doi.org/10.1007/s10648-018-9434-x)
- **Elaborative interrogation** ("perché è vero?"): l'effetto dipende dal tipo di domanda (Martin & Pressley 1991) [M]. — [doi:10.1037/0022-0663.83.1.113](https://doi.org/10.1037/0022-0663.83.1.113). Dunlosky 2013 le assegna utilità moderata [M].
- **Generation effect, meta-analisi Bertsch et al. 2007** (Memory & Cognition): su 86 studi generare batte leggere di **d = 0,40**, con forte variabilità tra moderatori [V]. — [doi:10.3758/BF03193441](https://doi.org/10.3758/BF03193441)
- **Formato del test**: Rowland 2014 trova benefici maggiori per i test di richiamo rispetto al riconoscimento [V]. Adesope 2017 riporta invece effetti per la scelta multipla pari o superiori alla risposta breve (circa 0,70 contro 0,48) [M]. **Le due meta-analisi sono in contrasto** su questo moderatore. Little, Bjork, Bjork & Angello 2012 (Psychological Science) mostrano che la scelta multipla con *alternative competitive* attiva il recupero anche delle informazioni sulle alternative [M]. — [Little et al., record PsycEXTRA doi:10.1037/e520562012-782](https://doi.org/10.1037/e520562012-782). Il feedback riduce gli effetti negativi della scelta multipla (acquisizione dei distrattori) (Butler & Roediger 2008, Memory & Cognition) [M]. — [doi:10.3758/mc.36.3.604](https://doi.org/10.3758/mc.36.3.604)
- **Studio in ambito medico (BMC Med Educ 2024; n = 45, within-subjects)** che confronta very-short-answer (VSAQ) e scelta multipla nella retrieval practice senza feedback [V sul disegno; risultati completi non letti]. — [doi:10.1186/s12909-024-06538-0](https://doi.org/10.1186/s12909-024-06538-0)
- **Comprensione delle dimostrazioni (Mejía-Ramos, Fuller, Weber, Rhoads & Samkoff 2012)**: modello di valutazione con dimensioni *locali* (significato di termini ed enunciati, **stato logico** degli enunciati, **giustificazione delle affermazioni**, cioè quale premessa o fatto precedente giustifica un passo) e *olistiche* (riassumere le idee chiave, identificare la struttura modulare, trasferire le idee, illustrare con esempi) [M per l'elenco delle dimensioni]. — [doi:10.1007/s10649-011-9349-7](https://doi.org/10.1007/s10649-011-9349-7). I test di comprensione validati sono in Mejía-Ramos et al. 2017. — [doi:10.1080/14794802.2017.1325776](https://doi.org/10.1080/14794802.2017.1325776)

### Inferences
- P2, cioè occultare una premessa o la conclusione, coincide quasi esattamente con la dimensione "giustificazione delle affermazioni" del modello di Mejía-Ramos. Ha quindi validità di contenuto per la comprensione delle dimostrazioni, non solo per la memoria.
- Il formato consigliato è il richiamo libero o una risposta breve (scrivere l'ipotesi mancante), con un autogiudizio verificato dal confronto con la risposta oppure con un correttore. Se si usa la scelta multipla, i distrattori devono essere *ipotesi plausibili ma insufficienti* (per esempio continuità invece di continuità uniforme), con feedback immediato. Con distrattori facili lo studente indovina per eliminazione e si crea un'illusione di competenza.
- Rischio specifico: indovinare "quale ipotesi manca" guardando le altre premesse visibili può ridursi a pattern matching superficiale (anche il blog Expertium ha una pagina "Avoid Pattern Matching" sulle flashcard: https://expertium.github.io/Avoid_Pattern_Matching.html, non letta per intero).
- Sostituire la mappa muta con l'occlusione è giustificato dal punto di vista della verificabilità. La self-explanation ("perché queste premesse bastano?") ha però effetti propri (g circa 0,55 [M]) e riguarda la dimensione "perché" che l'occlusione non verifica. La soluzione più sostenuta dall'evidenza è combinare: prima l'occlusione (retrieval), poi un prompt "spiega perché" opzionale.
- O'Day & Karpicke suggeriscono che aggiungere attività di mappa al retrieval costa tempo senza dare beneficio. P2 non dovrebbe chiedere allo studente di *ricostruire* il grafo, ma di recuperare il nodo mancante.

### Gaps
- Non ho trovato studi specifici sulla cloze o occlusione applicata a *enunciati matematici* o catene di implicazione.
- Il conflitto Rowland/Adesope sul formato (recall contro scelta multipla) non è risolto. Le cifre di Adesope non sono verificate.
- Le prove di Karpicke usano testi di scienze (prosa espositiva) con studenti universitari, non dimostrazioni formali.

---

## Q3. Tutor AI con contesto (P3, "Chiedi al Tutor" con vicinato a 1-2 hop)

### Takeaway
Gli studi più forti mostrano che un LLM senza guardrail migliora la performance *durante* l'uso ma peggiora l'apprendimento successivo (stampella). Un tutor progettato pedagogicamente (indizi, niente soluzioni, ancoraggio a contenuto verificato) annulla il danno o produce guadagni grandi. P3 è promettente *solo* se il tutor è vincolato a indizi e domande socratiche. Il contesto a 1-2 hop è utile perché ancora il tutor al materiale dello studente (come le soluzioni fornite nel prompt in Kestin e Bastani).

### Cited Findings
- **Bastani et al. 2025** (PNAS; esperimento sul campo, circa 1.000 studenti di liceo in Turchia, matematica). Durante la pratica GPT Base migliora i voti del 48% e GPT Tutor (con prompt di salvaguardia) del 127%. Tolto l'accesso, il gruppo GPT Base va **peggio del controllo del 17%**, mentre GPT Tutor attenua in larga parte l'effetto negativo. Gli studenti usano GPT come "stampella" [V]. — [doi:10.1073/pnas.2422633122](https://doi.org/10.1073/pnas.2422633122); esiste una correzione: [doi:10.1073/pnas.2518204122](https://doi.org/10.1073/pnas.2518204122); critica del disegno sul preprint SSRN: [doi:10.2139/ssrn.4898213](https://doi.org/10.2139/ssrn.4898213)
- **Kestin et al. 2025** (Scientific Reports; RCT, Harvard, fisica introduttiva). Il tutor AI progettato con best practice pedagogiche batte la lezione in aula di active learning. La regressione lineare dà un effetto di 0,63, sottostimato per effetto tetto. La regressione quantile dà **0,73–1,3 DS**. Mediane post-test 4,5 (AI, N = 142) contro 3,5 (aula, N = 174), tempo mediano 49 min contro 60. Nessuna correlazione tra tempo sul compito e post-test. Gli studenti AI si dichiarano più coinvolti e motivati [V]. — [doi:10.1038/s41598-025-97652-6](https://www.nature.com/articles/s41598-025-97652-6). Limiti: lezione singola, post-test immediato, nessuna misura di ritenzione differita [M].
- **Meta-analisi Wang & Fan 2025** (Humanities & Social Sciences Communications; 51 studi tra 2022 e 2025): ChatGPT ha un effetto grande sulla performance (g = 0,867) e moderato su percezione (0,456) e pensiero di ordine superiore (0,457), con forte moderazione per tipo di corso, modello didattico e durata [V]. **Cautela**: misura soprattutto la performance con l'AI a disposizione o post-test immediati, su studi eterogenei e spesso piccoli, e non distingue l'apprendimento duraturo dalla performance assistita (in Bastani le due cose divergono). — [doi:10.1057/s41599-025-04787-y](https://doi.org/10.1057/s41599-025-04787-y)
- **Esperimento randomizzato in presenza (arXiv 2607.08849, 2026)**: l'accesso a un'AI generica mentre si scrive un saggio aumenta i punteggi ai test senza aiuto, e un guadagno minore persiste dopo una settimana. I guadagni restano per chi usa l'AI come tutor ("augmentation") e svaniscono per chi le fa scrivere ("automation") [V da abstract; preprint non revisionato]. — [arXiv:2607.08849](https://doi.org/10.48550/arxiv.2607.08849)
- **Lehmann, Cornelius & Sting 2024** "AI Meets the Classroom: When Does ChatGPT Harm Learning?" (SSRN). Usato come *sostituto* (copiare le soluzioni) l'LLM riduce l'apprendimento, usato come *complemento* (spiegazioni) no [M: abstract non recuperato]. — [doi:10.2139/ssrn.4941259](https://doi.org/10.2139/ssrn.4941259)
- **Cognitive offloading**: Gerlich 2025 (Societies) riporta una correlazione negativa tra uso frequente di strumenti AI e pensiero critico, mediata dall'offloading [M; studio correlazionale con questionari, non causale]. — [doi:10.3390/soc15010006](https://doi.org/10.3390/soc15010006)

### Inferences
- Il punto critico di P3 non è il contesto ma la *politica di risposta*. "Un click e il tutor spiega il legame" è esattamente il pattern "GPT Base" (risposta pronta), che in Bastani produce il −17%. Le salvaguardie che hanno funzionato (Bastani GPT Tutor, Kestin) hanno in comune: soluzioni corrette fornite al modello, istruzioni a dare indizi incrementali invece della risposta, e sequenza guidata.
- Raccomandazione derivata: il tutor dovrebbe prima chiedere allo studente la sua ipotesi ("quale premessa pensi serva?"), poi dare indizi graduali, e mostrare la risposta solo su richiesta esplicita, registrandola come "lapse" per FSRS.
- Il vicinato a 1-2 hop riduce le allucinazioni e allinea notazione e definizioni a quelle del corso dello studente. È coerente con la scelta di Kestin e Bastani di dare al modello le soluzioni verificate.
- Le metriche FSRS nel prompt sono utili per calibrare il livello, ma serve una regola: non rivelare un nodo in scadenza che il tutor sta per chiedere.

### Gaps
- Nessuno studio trovato su tutor LLM per la *comprensione di dimostrazioni* all'università con ritenzione misurata a distanza di settimane.
- Gli studi Tutor CoPilot (Wang et al. 2024) e World Bank Nigeria (De Simone et al. 2025) sono rilevanti ma non sono riuscito a verificarli (rate limit).
- Effetti a lungo termine (mesi) di tutor con guardrail: nessuna evidenza robusta trovata.

---

## Q4. Mostrare lacune, frontiera e nodi orfani (P5)

### Takeaway
Gli open learner model (OLM) che mostrano allo studente il suo stato possono migliorare l'apprendimento quando sono integrati con supporto all'autoregolazione (esperimenti in classe di Long & Aleven). Le review sulle dashboard per studenti però rilevano un'evidenza sperimentale scarsa sugli effetti di apprendimento. Mostrare "quanto manca" ha valore metacognitivo; il rischio principale è il sovraccarico visivo dei diagrammi nodo-collegamento grandi. Filtri per materia e lenti mirate sono coerenti con i principi di riduzione del carico estraneo.

### Cited Findings
- **Bull & Kay, Open Learner Models** (capitolo Springer 2010) e il framework SMILI (IJAIED 2007): gli OLM rendono visibile e ispezionabile il modello dello studente per favorire riflessione, pianificazione e autovalutazione [M sui contenuti]. — [doi:10.1007/978-3-642-14363-2_15](https://doi.org/10.1007/978-3-642-14363-2_15); [SMILI, doi:10.3233/irg-2007-17(2)02](https://doi.org/10.3233/irg-2007-17(2)02)
- **Long & Aleven 2017** (UMUAI): due esperimenti in classe indicano che un OLM può migliorare i risultati di apprendimento *a livello di dominio* tramite lo scaffolding dei processi di autoregolazione. Sono tra i primi esperimenti in vivo di questo tipo [V da TLDR]. — [doi:10.1007/s11257-016-9186-6](https://doi.org/10.1007/s11257-016-9186-6)
- **Bodily & Verbert 2017** (IEEE TLT; review di 93 articoli su 945) sulle dashboard di learning analytics rivolte agli studenti: servono esperimenti sugli effetti su comportamento e rendimento, perché la base di evidenza esistente è piccola. Raccomandano test di usabilità [V]. — [doi:10.1109/tlt.2017.2740172](https://doi.org/10.1109/tlt.2017.2740172); vedi anche Bodily et al. 2018 (LAK) su OLM e dashboard: [doi:10.1145/3170358.3170409](https://doi.org/10.1145/3170358.3170409)
- **Leggibilità dei grafi**: Ghoniem, Fekete & Castagliola (2004/2005, Information Visualization) trovano che i diagrammi nodo-collegamento peggiorano rapidamente in leggibilità su compiti di base al crescere di dimensione e densità rispetto alle matrici [M]. Sul carico cognitivo nella navigazione ipertestuale e con mappe vedi Gerjets & Scheiter 2003 (Educational Psychologist) [M]. — [doi:10.1207/s15326985ep3801_5](https://doi.org/10.1207/s15326985ep3801_5)

### Inferences
- **Frontiera** (capitoli del programma non ancora estratti): ha giustificazione metacognitiva (pianificazione, OLM). Mostrata come lista o contatore è meno costosa visivamente che come nodi fantasma su un canvas già denso.
- **Orfani** (definizioni senza uscite): in termini di apprendimento sono "conoscenza inerte" o non integrata. Segnalarli spinge alla rielaborazione (generare collegamenti è elaborativo). Ma un orfano può anche essere un *errore di estrazione*: la lente andrebbe trattata come coda di revisione dei dati, non come giudizio sullo studente.
- Il filtro per materia riduce il numero di nodi visibili, ed è il beneficio di usabilità più certo tra quelli di P5.
- Rischio motivazionale: una frontiera molto grande vista presto può scoraggiare. Non ho evidenze dirette, quindi resta un'ipotesi.

### Gaps
- Nessuna evidenza trovata specifica sulla visualizzazione della "frontiera" di un programma d'esame e sui suoi effetti su rendimento o ansia.
- Non verificati i numeri precisi di Ghoniem et al. sulle soglie di leggibilità.

---

## Q5. Fusione automatica di concetti tra corsi (P6)

### Takeaway
La ricerca sul transfer dice che il transfer lontano (tra contesti o domini) è raro e difficile. Uno degli interventi più efficaci per favorirlo è il *confronto esplicito* di due casi dello stesso principio (analogical encoding, Gentner). Vedere lo stesso concetto in due corsi può quindi aiutare, *se* le istanze restano distinte e confrontabili. Una fusione automatica che collassa le due istanze in un nodo cancella proprio il contrasto che produce il transfer, e rischia di unire concetti con stesso nome ma ipotesi o notazioni diverse.

### Cited Findings
- **Barnett & Ceci 2002** (Psychological Bulletin): tassonomia del transfer lontano su più dimensioni di contesto (dominio di conoscenza, contesto fisico, temporale, funzionale, sociale, modalità). Le evidenze di transfer lontano sono scarse e dipendono dalla definizione [M sui dettagli]. — [doi:10.1037/0033-2909.128.4.612](https://doi.org/10.1037/0033-2909.128.4.612)
- **Gentner, Loewenstein & Thompson 2003** (J. Educ. Psychol.): confrontare due esempi che condividono un principio (analogical encoding) migliora molto il transfer rispetto a studiarli separatamente [M sulle cifre]. — [doi:10.1037/0022-0663.95.2.393](https://doi.org/10.1037/0022-0663.95.2.393)
- **Interleaving tra categorie simili** (Brunmair & Richter 2019): il contrasto tra elementi simili ma distinti migliora la discriminazione [V]. Questo implica che mantenere separate le varianti simili ha valore didattico. — [doi:10.1037/bul0000209](https://doi.org/10.1037/bul0000209)
- **Transfer del test-enhanced learning**: meta-analisi Pan & Rickard 2018 (Psychological Bulletin). Il retrieval trasferisce a domande diverse in misura moderata, meno quando il formato o il contenuto cambia molto [M; verificato solo il preprint]. — [preprint doi:10.31234/osf.io/4qpyn](https://doi.org/10.31234/osf.io/4qpyn)

### Inferences
- In matematica, enunciati "uguali" in corsi diversi spesso differiscono per ipotesi (spazi di dimensione finita o infinita, misura contro somma, campo reale o complesso) o per notazione. La similarità lessicale/LaTeX proposta in P6 è un segnale debole per l'identità logica. Un merge sbagliato produce misconcezioni, per esempio attribuire a un corso ipotesi più deboli di quelle vere.
- Alternativa più coerente con l'evidenza: un *collegamento* "stesso concetto in X" proposto e confermato dallo studente, invece della fusione. Il confronto esplicito (Gentner) diventa un'attività ("confronta l'enunciato di Analisi con quello di Probabilità: cosa cambia?"), e le due carte FSRS restano separate.
- Il riallineamento del parsing dei MOC (linked.ts contro shared/moc.ts) è un fix tecnico senza implicazioni cognitive.

### Gaps
- Nessuno studio trovato su effetti di fusione o deduplicazione automatica in sistemi di flashcard o knowledge graph per studenti.
- Nessuna evidenza diretta sul costo cognitivo di notazioni diverse per lo stesso concetto tra corsi universitari.

---

## Q6. Spaziatura di elementi correlati: assunzione di indipendenza di FSRS (P1/P2 batching)

### Takeaway
FSRS tratta ogni carta come indipendente, inclusi i "fratelli" (siblings). Anki gestisce la cosa fuori dall'algoritmo, nascondendo (bury) i fratelli nella stessa sessione. P1 e P2, che interrogano in una sola sessione molte carte collegate (una cascata, o una catena le cui premesse sono carte), violano questa assunzione. Rivedere A rende più facile B nella stessa sessione, e gli esiti di B registrati su FSRS risultano gonfiati. Questo porta a intervalli troppo lunghi.

### Cited Findings
- **Expertium, "FSRS-7"**: l'algoritmo "tratta tutte le carte come indipendenti, anche quelle dello stesso mazzo e perfino i fratelli. La dispersione dei fratelli in Anki non fa parte di FSRS, è una cosa separata". Non tiene conto del contenuto della carta. Nel benchmark srs-benchmark un modello RWKV affronta i problemi del contesto della sequenza e dell'indipendenza [V]. — [expertium.github.io/Algorithm_FSRS-7.html](https://expertium.github.io/Algorithm_FSRS-7.html)
- **Manuale Anki, "Siblings and Burying"**: le carte generate dalla stessa nota (fronte→retro e retro→fronte, cloze diverse dello stesso testo) sono "siblings". Anki può nasconderle (bury) fino al giorno dopo quando si risponde a una di loro, con opzioni separate per carte nuove e ripassi. I fratelli in fase di apprendimento non vengono nascosti [V]. — [docs.ankiweb.net/studying.html#siblings-and-burying](https://docs.ankiweb.net/studying.html#siblings-and-burying)
- **Interferenza e facilitazione da retrieval**: la retrieval-induced forgetting (Anderson, Bjork & Bjork 1994) indica che recuperare alcuni elementi può sopprimere elementi correlati non recuperati. Con materiali integrati e coerenti (prosa), però, si osserva spesso *facilitazione* (Chan 2009, J. Memory and Language) [M; non riverificati in questa sessione].

### Inferences
- In una cascata P1, rispondere alla definizione A subito prima del teorema B (che la cita) dà un indizio a B. Il "Good" su B è meno informativo di un "Good" a freddo. Se P1 e P2 scrivono gli esiti nello stesso stato FSRS dei ripassi normali, la stabilità di B viene sovrastimata.
- Mitigazioni derivate: (a) registrare su FSRS solo il *primo* nodo recuperato a freddo della catena o della cascata, trattando gli altri come pratica non schedulata o con peso ridotto; (b) non includere nella cascata carte che non sono in scadenza (R alta), come già prevede il filtro R < 0,85; (c) in P2 aggiornare FSRS solo per l'elemento occultato, non per tutte le premesse visibili, perché per quelle è stato un riconoscimento.
- Il commit recente "FSRS di sessione" nel repo potrebbe già andare in questa direzione (non verificato nel codice, fuori dal mio ambito).

### Gaps
- Nessuno studio empirico trovato che quantifichi l'errore di FSRS su carte correlate rivedute insieme (solo l'ammissione qualitativa di Expertium e la soluzione euristica di Anki).
- Non ho potuto verificare i lavori su scheduling content-aware (per esempio KARL, Shu et al. 2024, EMNLP) perché arXiv non rispondeva.
