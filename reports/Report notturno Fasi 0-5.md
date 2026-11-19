# Report notturno — orchestrazione Fasi 3–5

| Step | Builder | Esito | Note |
|---|---|---|---|
| T08 | agy /teamwork | ok | backend Ripasso: tetto rigido, prerequisites, contest |
| T09 | agy /teamwork | ok | UI Ripasso: 3 voti, contesta, fiducia discreta, cascata nel budget |
| T10 | agy | ok | remediation a tre livelli |
| Q1 procedural.ts + test | Qwen | parziale | file e test scritti; 1 errore TS2322 → escalation a Codex (F1) |
| Q2 siblings.ts + test | Qwen | fallito | nessun output dopo >20 min (timeout) → escalation a Codex |
| F1 fix TS + chain-exercise | Codex | ok | test chain aggiornato all'UI di Fase 3; typecheck pulito |
| Q2 siblings.ts + test | Codex | ok | escalation da Qwen riuscita |
| T11 Pratica attribuita | Codex | ok | grade.ts (otherEngine), record asimmetrico, evento attributed, debolezze execution, esame con miss |
| T12 Lente procedurale | Codex | ok | Memory.procedural via proceduralLens, fading |
| T13 Anello procedurale grafo | agy (design skill: frontend-design, ui-skills) | ok | anello sui nodi + riga nel pannello, solo token |
| T14 Modalità cieca | Codex | ok | Material.blind, Allenamento misto, CONCETTI AFFINI, default cieco in PracticeSetup |
| T15 Triage + fiducia | agy /teamwork (design skill) | ok | triage testuale opzionale, fiducia 4 livelli in ReviewLine |

## Stato finale
- Typecheck: pulito. Vitest: 11 failed | 1243 passed (1254) — tutti fallimenti preesistenti (baseline 12 file), zero nuovi.
- CSS: nessun valore letterale aggiunto, nessuno stile inline. Nessun processo agy residuo.
- Blocchi irrisolti: nessuno. Nulla committato.
