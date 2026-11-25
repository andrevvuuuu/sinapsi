# Piano d'azione — Brief P0 / UX / Architettura / UI dinamica

Data: 2026-11-25 · Branch di partenza: `perf/ottimizzazioni-ai` (pulito, HEAD `b17ca06`)
Stato: **solo piano**, nessun file sorgente modificato. **Rev. 2 (2026-11-25):** integrate le decisioni D1–D7 (vedi §5).

---

## 0. Verifica preliminare del repository

### 0.1 Baseline

| Comando | Esito |
|---|---|
| `npm run typecheck` | **0** (node + web puliti) |
| `npx vitest run` | **151 file / 1304 test passati**, ma **exit 1**: 1 *Unhandled Rejection* (`ENOTDIR mkdir …/sessions/x`) in `tests/unit/fixes12b.test.tsx` › «can be retried at once, the failure is not remembered», partita da `createNow` in `src/main/session/runner.ts:368` |
| `npm run test:e2e` | non eseguito (lancia Electron con l'app compilata; da fare a mano prima di ogni PR UI) |
| `npx eslint .` | **exit 1**: 822 errori / 16 452 warning già presenti (693 sono `explicit-function-return-type`; 127 errori arrivano da `.claude/worktrees`, che non è ignorato). Il lint **non** è un controllo verde: la regola D7 si verifica con un comando mirato (PR 1.2b) |

→ Serve una **PR 0** per avere una baseline verde, altrimenti nessuna PR successiva può dimostrare «nessuna regressione».

### 0.2 File citati: tutti presenti, con queste eccezioni/correzioni

| Brief | Realtà nel repo |
|---|---|
| `formatSubmission` in `src/main/practice/runner.ts` | Definita in **`src/shared/practice-protocol.ts:95`**; il runner la chiama a `runner.ts:325`. La stringa «solo gradino 0» è a `practice-protocol.ts:100`. |
| `NotesView` (implicito in 3.3) | È **`src/renderer/src/shell/NotesView.tsx`**, non `home/`. |
| `src/shared/tutor-types.ts` o `api.ts` per `TutorCalendar` | `tutor-types.ts` esiste (80 righe). Va lì `TutorCalendar`. |
| `.mt-chip.on` in `practice.css` | Confermato, ma con **due definizioni**: `practice.css:720` (token) e il «layer shell» in coda `practice.css:1741` che lo sovrascrive con `background: var(--sh-send-bg)` (`#7664c2`) e `color:#fff`. La `×` (`.mt-chip button`, `:733`) resta `color: var(--muted)` → è lei a fallire il contrasto. |
| `snippet` in `exam-format.ts` | Confermato (`exam-format.ts:19`): rimuove `$`, `{}` e tronca a 48 caratteri. |
| `toTitleCase` in `src/shared/subjects.ts` | Confermato (`subjects.ts:98`). **Il test esistente** `tests/unit/subjects.test.ts:44-49` fissa il comportamento attuale («Introduzione Ai Sistemi», «Dell'Algebra E LaTeX In FSRS»): va riscritto insieme alla funzione. Usato in `main/practice/runner.ts:314`, `main/practice/exam.ts:152`, `main/session/runner.ts:381`. |
| Naming `Mappa`/`Grafo` | `LiquidDock.tsx` ha `id: 'Mappa'` ma `aria-label`/`title`/etichetta **`'Grafo'`** (`LiquidDock.tsx:634-655`); `MapView.tsx:23` ha `<h1>Mappa</h1>`. **Gli E2E usano `'Grafo'`** (`tests/e2e/helpers.ts:3,7`, `screens/glass/graph/review.spec.ts`). |
| `buildWeekPlan` | Confermato (`src/main/planner/plan.ts:184`); `Input` ha già `memories`, quindi i ripassi FSRS si possono stimare senza nuove letture. Handler: `ipc.ts:651`. |
| `SessionRunner.list` | Esiste (`session/runner.ts:583`) e ha già una `cache` in memoria; rilegge però con `load` le sessioni non indicizzate. Meno urgente di `PracticeRunner`. |
| `draw` in `draw.ts` | Confermato (`draw.ts:112`); il loop rAF è in `GraphView.tsx:546-575` (`dirty`, `markDirty`, `schedule`). |
| `dictation.ts` / `MicButton.tsx` | Confermati; `useDictation` espone `state: 'idle'|'recording'|'transcribing'` e apre lo stream a `dictation.ts:96`. |
| `tests/unit/contrast.test.ts` | Esiste, ma **legge solo `tokens.css`** (`:11`). Per controllare `.gzoom`/`.mt-chip`/`.gnotch-dock` va esteso (vedi PR 1.3). |
| `screens.spec` Playwright | Esiste (`tests/e2e/screens.spec.ts`): screenshot per vista e tema in `test-results/screens/`, non confronto pixel. |
| Contratti `session.css` | `tests/unit/layout13-session.test.ts` legge il CSS come testo (altezza top bar, larghezza dock, scroll interno, `max(55vh, 300px)`). Altri 15 test leggono CSS allo stesso modo (`layout13-*`, `control-tokens`, `fixes12*`, `review-fixes-3`…). |

### 0.3 Discrepanze di scope che il brief sottostima

1. **Import renderer→main (1.2):** non è solo `TutorCalendar`. Ci sono **18 import di tipi** da `main/` in `src/renderer` **e in `src/shared/api.ts`** (`SessionState`, `SessionSummary`, `NoteMeta`, `StoredNote`, `TutorCalendar`; `PracticeState`/`PracticeProblem` ×5, `Evidence`, `ConceptProgress`, `MinimalTree`, `ExplainTurn`, `ReviewItem`, `history`, `suggest`). Il criterio «zero import verso `main/` in `src/renderer/`» richiede di spostarli tutti in `src/shared/` → la 1.2 va divisa (1.2a store, 1.2b tipi).
2. **`memoryStore(` in `ipc.ts`:** 11 chiamate (righe 173, 196, 413, 476, 497, 537, 551, 613, 640, 659 + `sessionMemory`), 3 `weaknessStore(` (174, 410 + export).
3. **`window.confirm` (2.2):** 5 occorrenze, non 2: anche `ExamView.tsx:299,359` e `PaperExam.tsx:219`. Il criterio «zero in `src/renderer/`» le include.
4. **`.gzoom` button è 34 px** (`graph.css:224-227`): sotto i 44 px, ma è un'eccezione voluta. `.graph .gzoom button` è nella whitelist `DENSE` di `tests/e2e/screens.spec.ts:21` → resta 34 px (D2).
5. **Settings e vault (1.1):** il main già fa `rewatch()` su cambio `vaultPath` (`ipc.ts:158`), ma il rewatcher trasmette `vaultChanged` solo su eventi del watcher, non subito → il renderer non ricarica l'indice. `excludedFolders` invalida la cache ma non ricarica nulla. `onSettingsChanged` serve davvero.
6. **Bridge (3.4):** nel `finally` di `pumpLane` (`bridge.ts:121-124`) si ripompa solo la stessa corsia: con la preemption, quando l'ultima interattiva finisce bisogna ripompare anche `background`, altrimenti i job in background restano fermi in coda.
7. **`PracticeRunner.append`** (`runner.ts:98-104`) fa a sua volta 2 `load` completi per ogni append: rientra nella stessa cache della 3.4.
8. **4.2 «step di avanzamento reali»:** oggi non esiste un canale IPC di avanzamento dell'AI: c'è solo `EngineStatus = 'idle'|'busy'|'auth'|'missing'|'error'` (`api.ts:35`) e `voice:stage`. Deciso (D6): solo lato interfaccia, con i canali esistenti `ai:status-changed` (`CH.aiStatusChanged`), `session:partial`, `notes:updated`, `graph:changed`.
9. **Append su `reviews.jsonl`:** tutti passano da un `deps.memory.append` / `deps.memoryStore.append` iniettato: `memory/review.ts:548`, `practice/runner.ts:175,183,192,209`, `practice/exam.ts:126`, `session/runner.ts:231`. Con il singleton della 1.2a basta **un solo punto di notifica** per l'evento `memory:changed` (D5).

---

## 1. Sequenza di PR

Convenzioni valide per tutte: una PR = un commit logico (o pochi), branch `fix/…`/`feat/…` da `main`, `npm run typecheck` + `npx vitest run` verdi, pagina `docs/mappa/` aggiornata nello stesso commit se cambia un flusso. Nessuna nuova dipendenza.

### PR 0 — Baseline verde dei test
- **File:** `tests/unit/fixes12b.test.tsx` (ed eventualmente `src/main/session/runner.ts` se la promise rifiutata è persa nel codice).
- **Modifica:** trovare la `createNow` lasciata pendente dal test «can be retried at once…» (la `deps.dir` punta a un file, quindi `mkdir` dà `ENOTDIR` dopo la fine del test). Fare `await`/`expect(...).rejects` sulla promise, oppure gestire il rifiuto in `start` se il runner la perde davvero (in quel caso è un bug reale: una promise rifiutata e non gestita nel main).
- **Verifica:** `npx vitest run tests/unit/fixes12b.test.tsx`, poi `npx vitest run` con **exit 0**.
- **Mappa:** nessuna (o `Sessioni di studio.md` se cambia il runner).

---

### Fase 1 — P0

#### PR 1.1 — Salvataggio impostazioni sbloccato + `onSettingsChanged`
- **File:** `src/shared/settings-schema.ts`, `src/main/ipc-handlers.ts`, `src/renderer/src/App.tsx`, `src/renderer/src/shell/AppShell.tsx` (solo se il callback passa da lì), `tests/unit/ipc.test.ts` (o nuovo `tests/unit/settings-patch.test.ts`), `docs/mappa/Processi e IPC.md`.
- **Modifiche:**
  1. In `settings-schema.ts` esportare i validatori di `mastery` (oggetto strict con `kOpen` 1–5, `kChoice` 1–6, `solidDays` 1–60), `learnerProfile` (`max(2000)`), `graderEngine` (`enum(['other','same'])`), `fastStart` (`boolean`) **senza `.catch`**. Così sia `settingsSchema` (con `.catch`) sia `Patch` li riusano.
  2. In `ipc-handlers.ts` aggiungere a `Patch` i quattro campi.
  3. **Test di parità** per evitare divergenze future: `Object.keys(Patch.shape)` deve essere uguale a `Object.keys(settingsSchema('/x').shape)` meno un elenco esplicito di campi non modificabili (oggi nessuno). Patch va esportato da `ipc-handlers.ts` (o testato via `makeHandlers`).
  4. `App.tsx`: sostituire `onSettingsChanged={() => undefined}` con un callback che riceve `(prev, next)` (o il `Settings` salvato) e, se `vaultPath` o `excludedFolders` sono cambiati, rilancia `window.sinapsi.vault.index().then(setIndex)`. Bisogna controllare in `AppShell`/`SettingsDialog` cosa passa oggi `onSaved` → `onSettingsChanged`.
  5. Formato su disco invariato: `saveSettings` (`store/settings.ts:76`) fa già il merge e la validazione.
- **Rischi:** `.strict()` di `mastery` nel Patch: `SettingsDialog` manda tutti e tre i campi, quindi va bene. `learnerProfile` vuoto deve passare (`''`).
- **Test:** `settingsSet` col payload completo e reale di `SettingsDialog.save()` (engines, backgroundExtraction, dailyExtractionLimit, reviewSessionSize, gamesInSessions, microPauses, sessionLimit, sessionLimitMinutes, mastery, learnerProfile, graderEngine, fastStart) → resolves; `mastery.kOpen: 9` → rejects; test di parità.
- **Verifica:** `npx vitest run tests/unit/ipc.test.ts tests/unit/settings.test.ts tests/unit/layout13-settings.test.ts tests/unit/settings-focus.test.tsx`; a mano: Impostazioni → Salva → nessun errore, riaprendo i valori restano.

#### PR 1.2a — Un solo `memoryStore` / `weaknessStore` in `registerIpc`
- **File:** `src/main/ipc.ts`, `docs/mappa/Memoria e ripasso.md`.
- **Modifiche:** rinominare `sessionMemory` in `memStore` (o tenerlo) e `sessionWeaknesses` in `weakStore`, dichiarati **una volta sola in cima** a `registerIpc` (prima di `rewatch`/servizi). Sostituire le 10 chiamate inline `memoryStore(memoryDir)` / `memoryStore(join(dataDir(),'memory'))` (`:196` — verificare che `join(dataDir(),'memory') === memoryDir`) e i `weaknessStore(memoryDir)` (`:410`) con le istanze condivise. Passarle a `review`, `practice`, `exam`, `suggest`, `planWeek`, `sinapsi-tutor`.
- **Rischi:** l'invalidazione su `append` funziona già solo nell'istanza che fa l'append: con un'istanza unica diventa corretta per tutti. Se qualche servizio fa append da un'istanza diversa (es. dentro `memory/review.ts` con un proprio `memoryStore`), la cache mtime+size lo copre comunque. Controllare con `grep -rn "memoryStore(" src/main`.
- **Verifica:** `grep -c "memoryStore(" src/main/ipc.ts` → 1 (più l'import); `grep -c "weaknessStore(" src/main/ipc.ts` → 1; `npx vitest run tests/unit/ipc-review.test.ts tests/unit/ipc-practice.test.ts tests/unit/review-service.test.ts tests/unit/weaknesses.test.ts`.

#### PR 1.2b — Tipi condivisi fuori da `main/`
- **File nuovi o estesi in `src/shared/`:** `tutor-types.ts` (`TutorCalendar`), `session-types.ts` (`SessionState`, `SessionSummary`, `Evidence`, `ConceptProgress`, `MinimalTree`), `practice-types.ts` (esiste: + `PracticeState`, `PracticeProblem`, `PracticeItem`), `memory-types.ts` (esiste: + `ExplainTurn`, `ReviewItem`, tipi di `history`), `notes-types.ts` (`NoteMeta`, `StoredNote`), `suggest-types.ts`.
- **File toccati:** `src/main/{tutor/calendar,session/events,session/minimal-tree,practice/events,memory/explain,memory/review,memory/history,notes/store,suggest/suggest}.ts` (spostare la `type` in shared e re-esportarla per non toccare tutti gli import del main), `src/shared/api.ts`, i 13 file renderer elencati in §0.3, `docs/mappa/Processi e IPC.md`.
- **Modifica:** solo spostamento di `type`/`interface`, **nessuna logica**. Le funzioni (`reducePractice` ecc.) restano nel main.
- **Rischi:** i tipi derivati da schemi zod del main (`z.infer<typeof X>`) trascinano lo schema: in quel caso si sposta lo schema in shared (zod è già usato in shared). Possibili import circolari shared↔main: in shared non si importa mai da main.
- **Guardrail ESLint (D7, nella stessa PR):** in `eslint.config.mjs` aggiungere, prima di `eslintConfigPrettier`, un blocco
  ```js
  {
    files: ['src/renderer/**/*.{ts,tsx}', 'src/shared/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/main', '**/main/**'], message: 'Il renderer e shared non importano da src/main: sposta il tipo in src/shared.' },
          { group: ['node:*'], message: 'Niente moduli Node nel renderer e in shared: passa da preload/api.' }
        ]
      }]
    }
  }
  ```
  Si usa la variante `@typescript-eslint/` (fornita da `@electron-toolkit/eslint-config-ts`, già installato) perché intercetta in modo affidabile anche gli `import type` e gli `import('…')` nei tipi; il vecchio `useState<import('../../../main/tutor/calendar').TutorCalendar>` in `TodayView`/`PlanView`/`LessonLogView` scompare comunque con lo spostamento dei tipi. Va in questa PR, **non prima**, altrimenti i 18 import attuali la farebbero fallire. Oggi in `src/renderer` e `src/shared` non ci sono import `node:*`, quindi la seconda regola parte già verde. (Facoltativo: aggiungere anche i builtin senza prefisso, `fs`, `path`, `os`, `child_process`.)
- **Verifica:**
  - `grep -rnE "from '(\.\./)+main/|import\('(\.\./)+main/" src/renderer src/shared src/preload` → 0 righe;
  - `npx eslint src/renderer src/shared 2>&1 | grep -c "no-restricted-imports"` → 0. Il lint globale resta rosso per i problemi preesistenti (§0.1), quindi si controlla solo questa regola;
  - controllo che la regola scatti davvero: `printf "import type { X } from '../../../main/tutor/calendar'\nimport { readFile } from 'node:fs'\n" | npx eslint --stdin --stdin-filename src/renderer/src/probe.ts` → 2 errori `no-restricted-imports`;
  - `npm run typecheck` → 0; `npx vitest run`.

#### PR 1.3 — Contrasto AA di `.gzoom` e della `×` di `.mt-chip.on`
- **File:** `src/renderer/src/graph/graph.css` (`:205-266`), `src/renderer/src/practice/practice.css` (`:720-756`, `:1716`, `:1740-1744`), `tests/unit/contrast.test.ts` (o nuovo `tests/unit/contrast-controls.test.ts`), `docs/mappa/Interfaccia.md`.
- **Modifiche `.gzoom` (D2: dimensioni invariate):** `width/height/min-*: 34px`, `padding: 2px`, posizione e raggio **restano come sono** (whitelist `DENSE` in `screens.spec.ts:21`). Cambiano solo colori ed effetti: contenitore `background: color-mix(in srgb, var(--surface) 88%, transparent)` (in Solid/Riduci trasparenza `var(--surface)`), `border: 1px solid var(--ctl-edge)`; bottoni `color: var(--ink)`; hover `background: var(--btn-secondary-bg-hover)` con `color: var(--ink)`; active `var(--btn-secondary-bg-pressed)`; separatore `border-top: 1px solid var(--hair)`; focus `outline: var(--btn-focus-ring); outline-offset: -2px`. Ombra: in trattato quella più leggera già prevista (`tokens.css`, `[data-theme="trattato"] :is(.shell-drop,.dock)`). Nessun hex o `rgba(255,255,255,…)` resta nelle regole `.gzoom`.
- **Modifiche `.mt-chip.on` (D3: chip con i token):**
  - togliere `.pr .mt-chip.on` dal selettore del viola pieno (`practice.css:1741`, `background: var(--sh-send-bg); color:#fff`); restano viola `.mode[aria-checked]` e `.mt-filters[aria-pressed]` (rivederli con la 3.1a) e la CTA «Inizia allenamento» resta l'unico pieno della schermata;
  - stato selezionato: `background: color-mix(in srgb, var(--accent) 12%, var(--surface))`, `border: 1px solid var(--accent)`, testo `color: var(--ink)`. La regola `:720` (`border var(--ink)`) va allineata, così che le due definizioni (`:720` e il layer `:1716/1740`) diano lo stesso risultato. Meglio ancora: unificarle in un solo blocco;
  - `×` (`.pr .mt-chip button`, `:733`): `color: currentColor` (eredita `--ink`) al posto di `--muted`; hover `color-mix(in srgb, var(--ink) 8%, transparent)`; focus come oggi (`:1081`);
  - `min-height: var(--ctl)` invariato (`:1716`), così come il bersaglio di 44 px della `×` (`:734-737`).
  - Contrasto atteso: `--ink` su `accent 12% / surface` → lavagna ≈ 12:1, trattato ≈ 14:1; bordo `--accent` sul fondo della pagina ≥ 3:1 in entrambi i temi (lavagna `#a596f0`/`#1c1d20` ≈ 6.6:1, trattato `#5a48a8`/`#ecebe8` ≈ 6.4:1). I valori esatti vanno confermati dal test.
- **Test:** estendere il modello di contrasto (`contrast.test.ts` ha già il parser dei colori e la formula, e risolve i token di `tokens.css`) con i casi, per lavagna e trattato: `--ink` su `--surface` (icone `.gzoom`, il fondo peggiore è quello solido) ≥ 4.5:1; `--ctl-edge` su `--bg` (bordo `.gzoom`) ≥ 3:1; `--ink` su `color-mix(--accent 12%, --surface)` (testo e `×` della chip attiva) ≥ 4.5:1; `--accent` su `--bg` (bordo della chip) ≥ 3:1. Un secondo test statico legge `graph.css` e `practice.css` e controlla che: nessun hex/`rgba(255,255,255` compaia nelle regole `.gzoom`; `.mt-chip.on` non contenga `--sh-send-bg` né `#fff`; `.gzoom button` dichiari ancora `34px` (contratto D2).
- **Rischi:** `graph-view.test.tsx` / `graph-draws.test.tsx` possono controllare le classi; `glass.spec.ts` fa screenshot del grafo.
- **Verifica:** `npx vitest run tests/unit/contrast.test.ts tests/unit/control-tokens.test.ts tests/unit/graph-view.test.tsx tests/unit/layout13-practice.test.ts`; screenshot manuale in lavagna, trattato e Riduci trasparenza.

---

### Fase 2 — Quick win

#### PR 2.1 — Bolla utente in Pratica e titoli in `Arc`
- **File:** `src/renderer/src/practice/PracticeView.tsx` (`:331-365` Arc, `:465-485` bolle), nuovo `src/renderer/src/practice/submission-copy.ts` (puro, testabile), `src/renderer/src/practice/exam-format.ts`, `src/renderer/src/practice/practice.css`, test `tests/unit/practice-view.test.tsx` + `tests/unit/submission-copy.test.ts`, `docs/mappa/Pratica ed esami.md`.
- **Modifiche:**
  1. `learnerBubble(sub: Submission): string | null` mappa ogni `submission.kind` (`hint`, `thinking`, `triage`, `compass`, `restate`, `next`, `dismiss`, `start`…: elenco esatto da `SubmissionSchema` in `shared/practice-protocol.ts`) in micro-copy italiana («Mi serve un indizio», il testo del ragionamento così com'è, ecc.). La bolla `.you` usa `learnerBubble(it.submission) ?? it.text`, così i `.jsonl` vecchi con `kind` sconosciuti mostrano ancora il testo storico. `formatSubmission`, `e.text` e i ledger restano invariati.
  2. `Arc`: sostituire `snippet()` con un rendering inline di KaTeX, usando il renderer markdown/math già presente (`render-md`, `nota-math`: verificare il componente inline riusabile) e troncando **per token**, mai dentro `$…$`: se il taglio cade dentro una formula si esclude la formula intera e si aggiunge `…`. In alternativa CSS `text-overflow: ellipsis` su una riga con la formula intera renderizzata (più semplice e senza tagli a metà).
  3. Scrollbar di `Arc`: `scrollbar-width: thin; scrollbar-color: var(--hair) transparent` (stessa regola usata altrove: `grep scrollbar-width src/renderer`).
- **Rischi:** `snippet` è usato anche altrove (`grep -rn "snippet(" src/renderer`): non cambiarne la firma, aggiungere una funzione nuova. KaTeX in una lista lunga ha un costo: memoizzare per `p.id`.
- **Test:** `learnerBubble({kind:'hint'})` non contiene «gradino»/«tentativo»; rendering di `PracticeView` con uno stato che ha un hint con `attempts=0` → nessun «gradino 0» nel DOM; uno stato costruito da un evento legacy (`kind` sconosciuto) mostra `text`; `Arc` con `$|\sin a - \sin b|\le|a-b|$` non contiene `$` spaiati.
- **Verifica:** `npx vitest run tests/unit/practice-view.test.tsx tests/unit/practice-events.test.ts tests/unit/fixes9-practice.test.tsx`; E2E `practice.spec.ts`.

#### PR 2.2 — Conferma inline a due stati
- **File:** nuovo `src/renderer/src/components/ConfirmButton.tsx` (+ stile in un CSS di componenti esistente, solo token), `PracticeView.tsx` (`:306`, `:454`), `SessionView.tsx` (`:211`), `ExamView.tsx` (`:299`, `:359`), `PaperExam.tsx` (`:219`), test nuovo `tests/unit/confirm-button.test.tsx`, aggiornare `session-view.test.tsx` / `practice-view.test.tsx` / `exam-time-up.test.tsx` se cliccano direttamente, `docs/mappa/Interfaccia.md`.
- **Comportamento:** primo clic → al posto del bottone compaiono «Conferma» (primario) e «Annulla», nello stesso spazio e alti `var(--ctl)`; `Escape` o 4 s senza interazione → si torna allo stato iniziale; focus spostato su «Conferma» e annunciato con `aria-live="polite"`. Timer pulito all'unmount.
- **Rischi:** `exam-time-up.test.tsx` e gli E2E dell'esame si aspettano oggi il dialog nativo (Playwright `page.on('dialog')`): vanno aggiornati. `.end-btn` sta nella top bar della sessione: `layout13-session.test.ts` verifica l'altezza della top bar, quindi lo stato «Conferma · Annulla» non deve allargarla oltre il layout (usare `min-width` fisso o `display:contents`).
- **Verifica:** `grep -rn "window.confirm" src/renderer` → 0; `npx vitest run tests/unit/confirm-button.test.tsx tests/unit/session-view.test.tsx tests/unit/practice-view.test.tsx tests/unit/exam-time-up.test.tsx tests/unit/layout13-session.test.ts`; E2E `session.spec.ts`, `practice.spec.ts`.

#### PR 2.3 — Metriche di «Oggi», badge `due`, evento `memory:changed` (dipende da 1.2a)
- **File:** `src/main/ipc.ts`, `src/main/memory/store.ts` (opzionale, vedi sotto), `src/shared/api.ts` (`CH.memoryChanged` + tipo dell'API), `src/preload/index.ts`, `src/renderer/src/shell/TodayView.tsx` (`:291-340`, `:90`), `src/renderer/src/shell/shell.css` (`.sh-spark-bars`, `.sh-icon-rail` `:1455-1464`), `src/renderer/src/shell/Sidebar.tsx` (`:159-181`), `src/renderer/src/shell/AppShell.tsx` (`:66-93`), `src/renderer/src/App.tsx` (prop `onReview`/`onLessons` alle card), test nuovo `tests/unit/memory-changed.test.ts` + `home-v2.test.tsx` / `layout13-home.test.tsx`, `docs/mappa/Memoria e ripasso.md` + `Processi e IPC.md` + `Interfaccia.md`.
- **Modifiche:**
  1. Rimuovere i tre `.sh-spark-bars` con altezze fisse. Se ci sono dati reali (storico `reviews` per giorno: `review.history` esiste?, verificare in `api.ts`) disegnare barre vere; altrimenti niente grafico. Con valore `0`/`null` nessuna barra.
  2. Le card «Dovuti oggi» e «Lezioni da rielaborare» diventano `<button>` (target ≥ 44 px, focus ring di token) che chiamano `onReview()` / `onLessons()`.
  3. `Sidebar` compatta: dentro `.sh-side-action` «Ripassa» un `<span className="sh-badge">` visibile (oggi `small` è nascosto come `.sr` in `:1461`) con il numero (`99+` oltre 99) e `aria-label="Ripassa, N dovuti"`. Colore `--accent` su `--bg` con testo `--btn-primary-ink`, contrasto verificato.
  4. **Evento dal main (D5).** In `ipc.ts`, dove nasce il singleton della 1.2a:
     ```ts
     const notifyMemory = debounce(() => broadcast(CH.memoryChanged, null), 250)
     const memStore = withAppendHook(memoryStore(memoryDir), notifyMemory)
     ```
     `withAppendHook` è un piccolo wrapper puro (in `memory/store.ts`, o come parametro opzionale `onAppend` di `memoryStore`) che chiama l'hook **dopo** che `appendJsonl` è riuscito. Il debounce raggruppa le raffiche (`practice/runner.ts:209` e `exam.ts:126` fanno N append in fila) e il payload è vuoto: il renderer rilegge `review.memory()`, la fonte di verità resta il ledger. Poiché tutti gli append passano dal singleton (§0.3 punto 9), l'evento parte anche quando il grading in background di `PracticeRunner`/`ExamService` finisce dopo il ritorno alla Home. Nuovo canale `memoryChanged: 'memory:changed'` in `CH`; preload: `review.onMemoryChanged(cb) => subscribe(CH.memoryChanged, cb)`, stesso schema di `notes.onUpdate` (`preload/index.ts:48`). È un canale main→renderer senza payload, quindi non serve una validazione zod in ingresso.
  5. `AppShell`: `refreshDue()` estratto, chiamato all'avvio e su `onMemoryChanged`, con unsubscribe nel cleanup, come `offNotes`. Anche `TodayView` (`:90`, `review.memory()` per «Dovuti oggi») si iscrive allo stesso evento. Nessun refresh legato al cambio di vista.
- **Rischi:** la 3.3b poi sposta `due` nel contesto condiviso: tenere `refreshDue` isolato così da poterlo spostare (e lì l'iscrizione diventa una sola). Il debounce nei test va pilotato con fake timer. Un append fallito non deve emettere l'evento.
- **Test:** `memory-changed.test.ts`: `withAppendHook` chiama l'hook dopo l'append e non su errore; 5 append in 100 ms → 1 broadcast (fake timer). `home-v2.test.tsx`: un `onMemoryChanged` finto viene invocato → `review.memory` richiamato e badge/contatore aggiornati.
- **Verifica:** `npx vitest run tests/unit/memory-changed.test.ts tests/unit/home-v2.test.tsx tests/unit/home.test.tsx tests/unit/layout13-home.test.tsx tests/unit/ipc-review.test.ts`; a mano: avviare un allenamento, tornare a Oggi prima della fine della correzione → il badge si aggiorna da solo; rail a 64 px con `due>0` → badge visibile.

#### PR 2.4a — `toTitleCase` italiano
- **File:** `src/shared/subjects.ts`, `tests/unit/subjects.test.ts`, `docs/mappa/Sessioni di studio.md` (cenno).
- **Modifica:** insieme `MINOR = {il, lo, la, i, gli, le, l, un, uno, una, di, a, da, in, con, su, per, tra, fra, del, dello, della, dei, degli, delle, dell, al, allo, alla, ai, agli, alle, all, dal, dallo, dalla, dai, dagli, dalle, dall, nel, nello, nella, nei, negli, nelle, nell, col, coi, sul, sullo, sulla, sui, sugli, sulle, sull, e, ed, o, od, né, ma}`; minuscola se la parola (o il prefisso prima dell'apostrofo, es. `dell'`) è in `MINOR` e non è la prima parola. Parole scritte già con maiuscole interne (LaTeX, FSRS) restano come sono. Dopo l'apostrofo si capitalizza la parola successiva: `dell'algebra` → `dell'Algebra`.
- **Test aggiornati:** `'teorema di lagrange e del valor medio'` → `'Teorema di Lagrange e del Valor Medio'`; `'introduzione ai sistemi'` → `'Introduzione ai Sistemi'`; `"teorema dell'algebra e LaTeX in FSRS"` → `"Teorema dell'Algebra e LaTeX in FSRS"`; prima parola minore: `'il teorema'` → `'Il Teorema'`.
- **Rischi:** riguarda solo i topic **nuovi** (scritti in `created`); quelli già nei `.jsonl` restano come sono (append-only, va bene). Gli E2E che cercano un titolo esatto: `grep -rn "Di \|Ai \|Del " tests/e2e`.
- **Verifica:** `npx vitest run tests/unit/subjects.test.ts tests/unit/session-runner.test.ts tests/unit/practice-runner.test.ts`.

#### PR 2.4b — Retrieval Gate uniforme
- **File:** `src/renderer/src/session/SessionView.tsx` (`:239-330`), `src/renderer/src/session/session.css`, `tests/unit/session-view.test.tsx` (+ eventuale `fixes9-session.test.tsx`), `docs/mappa/Sessioni di studio.md`.
- **Modifica:** spostare la classe dal singolo `.msg` del tutor a un **wrapper dello storico** (`<div className="history" data-blurred>`) che contiene tutti i messaggi (tutor, `.you`, `AnswerCard`) precedenti al gate; `.retrieval-gate` resta fuori dal wrapper, quindi nitido. Regola CSS `.col .history[data-blurred] { filter: blur(…); pointer-events:none; user-select:none }` con `aria-hidden` mentre è sfocato; con `prefers-reduced-transparency` si usa un'opacità al posto del blur.
- **Rischi:** `layout13-session.test.ts` controlla la geometria di `.col`: il wrapper non deve aggiungere padding o gap. Il wrapper rompe un eventuale selettore `.col > .msg`: `grep -n "\.col >" session.css`. Lo scroll-to-end calcolato sui figli di `.col` va riverificato.
- **Verifica:** `npx vitest run tests/unit/session-view.test.tsx tests/unit/layout13-session.test.ts tests/unit/session-dock.test.tsx`; E2E `session.spec.ts`.

#### PR 2.4c — «Grafo» come unico nome visibile (D1)
- **File:** `src/renderer/src/shell/MapView.tsx`, `docs/mappa/Interfaccia.md` (+ `Grafo dei concetti.md` se nomina «Mappa» come vista).
- **Modifiche (solo testo visibile e accessibile):**
  - `MapView.tsx:20` `aria-label="Mappa dei concetti"` → `"Grafo dei concetti"`;
  - `MapView.tsx:23` `<h1>Mappa</h1>` → `<h1>Grafo</h1>`;
  - `MapView.tsx:34` stato vuoto «La mappa sarà disponibile…» → «Il grafo sarà disponibile quando il vault sarà caricato.».
  - **Restano come sono:** l'id interno `'Mappa'` di `Destination`/`ITEMS` in `LiquidDock.tsx` (non visibile; rinominarlo toccherebbe `App.tsx:onDock`, i colori `--sg-c-mappa` e la logica degli indici senza alcun beneficio per l'utente), il mapping `aria-label`/`title`/etichetta già «Grafo» (`LiquidDock.tsx:634-655`), e tutti i selettori E2E (`goTo(win, 'Grafo')`, `helpers.ts:3,7`). Il commento CSS «Reference Mappa Controls» (`graph.css:924`) si può correggere, ma non è necessario.
- **Controllo prima del commit:** `grep -rn "Mappa" src/renderer/src | grep -v "'Mappa'"` → nessuna stringa visibile (resta solo l'id interno); `grep -rn "Mappa" tests` per eventuali test unitari che cercano il vecchio `<h1>`/`aria-label` (oggi nessuno trovato nei selettori E2E).
- **Verifica:** `npx vitest run tests/unit/home-v2.test.tsx tests/unit/graph-view.test.tsx`; E2E `graph.spec.ts`, `screens.spec.ts`.

---

### Fase 3 — Architettura e prodotto

#### PR 3.1a — Palette `--sh-*` derivata dai token
- **File:** `src/renderer/src/shell/shell.css` (`:1-70`), `tokens.css` (solo se mancano token semantici, es. `--surface-glass`), poi a cascata `home/settings.css`, `shell/ai-status.css`, `review/review.css`, `lessons/lessons.css`, `practice/practice.css` (layer finale `:1700+`), `graph/graph.css`; test `contrast.test.ts`, `control-tokens.test.ts`, `docs/design.md` + `docs/mappa/Interfaccia.md`.
- **Modifica:** in `shell.css` ogni `--sh-*` cromatica diventa un alias: `--sh-canvas: var(--bg)`, `--sh-shell-bg: color-mix(in srgb, var(--surface) 72%, transparent)`, `--sh-inner-bg: var(--surface-raised)`, `--sh-text: var(--ink)`, `--sh-text-2: var(--muted)`, `--sh-violet: var(--accent)`, `--sh-send-bg: var(--accent)` (in trattato `--accent` `#5a48a8` dà testo bianco ≈ 7:1), ecc. I colori di categoria (`--sh-study/review/map/plan`) vanno mappati su `--pen/--coral/--warn/--good`. Le varianti trattato diventano superflue e si eliminano.
- **Rischi:** **è la PR più rischiosa per il visuale**: cambia la tinta di tutta la shell (fredda → calda). Va fatta da sola, con gli screenshot `screens.spec.ts` prima/dopo in entrambi i temi e con Riduci trasparenza. Il contrasto di `--glass-ink-2` su materiale chiaro è già modellato in `contrast.test.ts`: aggiungere i casi `--sh-text-2` → `--muted`.
- **Verifica:** `npx vitest run tests/unit/contrast.test.ts tests/unit/control-tokens.test.ts tests/unit/layout13-*.test.*`; `npm run test:e2e -- screens.spec.ts glass.spec.ts` e confronto visivo.

#### PR 3.1b — `.gnotch-dock` tematizzato
- **File:** `src/renderer/src/graph/graph.css` (`:491` in poi, 42 hex), `tests/unit/contrast.test.ts` (o un test che fa grep sugli hex), `docs/mappa/Grafo dei concetti.md`.
- **Modifica:** tutti gli hex/rgba di controllo → token (`--surface`, `--surface-raised`, `--ink`, `--muted`, `--hair`, `--ctl-edge`, `--btn-*`). Test: nessun `#[0-9a-f]{3,8}` né `rgba(255,255,255` nelle regole `.gnotch-dock`/`.gzoom` (eccezione esplicita per le ombre).
- **Dipende da:** 1.3 (stesso file), 3.1a (alias).

#### PR 3.1c — `PlanView`: `GlassRange` e niente «Indietro» da destinazione del dock
- **File:** `src/renderer/src/plan/PlanView.tsx` (`:67-68`, `:104`), `plan.css`, `App.tsx` (prop `onBack` opzionale), `tests/unit/plan-view-p4.test.tsx`, `docs/mappa/Pratica ed esami.md`.
- **Modifica:** `<input type="range">` → `<GlassRange>` (`glass.tsx:272`, già con stile `.range-scene` a 44 px); `onBack?` opzionale, e il bottone «Indietro» si mostra solo se c'è. `App` non lo passa quando `plan` è aperta dal dock. Con la 3.3 diventa «← vista precedente».
- **Rischi:** `GlassRange` monta una scena WebGPU: dentro `PlanView`, che sta già in un `ViewScene`, verificare che non crei un **secondo** contesto (come fanno gli altri `GlassRange`, es. in Impostazioni).
- **`--serif` (D4):** **escluso dallo scope** di tutta la Fase 3. `tokens.css` mantiene `--serif:'Geist',…`; nessun font nuovo, nessuna modifica a `--fs-*`, `--font-*`, line-height o tracking. Le PR 3.1a/b/c toccano solo colori, bordi e ombre.

#### PR 3.2a — Gestore esami condiviso, montato in `PlanView`
- **File:** nuovo `src/renderer/src/plan/ExamManager.tsx` (estratto da `LessonLogView.tsx:228-345`: lista, form `.lesson-exam-form`, modifica, archiviazione, importazione da `tutor.exams`), `LessonLogView.tsx` (lo usa), `PlanView.tsx` (lo monta, prop `focusExamForm?: boolean`), `App.tsx` (`{ view: 'plan', addExam?: true }` passato da `TodayView` «Aggiungi esame» `:358`), CSS spostato da `lessons.css` a `plan.css` o a un CSS condiviso, test `lessons-*.test.tsx`, `plan-view-p4.test.tsx`, nuovo `exam-manager.test.tsx`, `docs/mappa/Lezioni e tutor.md` + `Pratica ed esami.md`.
- **Importazione con 1 clic:** dalla riga di un esame del tutor → `exams.create({ courseId: e.courseName, date: e.date, … })`. Il payload passa dalla validazione `ExamEntrySchema` già presente in `ipc-handlers.ts`. Nessuna scrittura nel vault.
- **Criterio «< 3 clic»:** Oggi → «Aggiungi esame» (1) → form già aperto con focus sul corso → compilare → «Aggiungi esame» (2).
- **Dipende da:** 1.1 (non strettamente), 3.1c.

#### PR 3.2b — Ripassi FSRS nel piano settimanale
- **File:** `src/main/planner/plan.ts`, `src/shared/plan-types.ts` (nuovo `PlanBlock['kind'] = 'review'` o campo `reviewMinutes` per giorno), `src/main/ipc.ts:651` (nessuna lettura nuova: `memories` è già passato), `PlanView.tsx` (resa del blocco), test `tests/unit/planner-p4.test.ts`, `docs/mappa/Pratica ed esami.md`.
- **Modifica:** per ogni giorno `d` della settimana contare i concetti con `memory.due` in `[d, d+1)` (quelli già scaduti vanno su oggi) × minuti stimati per carta (costante, es. 1,5 min, o ricavata da `reviewSessionSize`). Il tempo si sottrae dalla capacità del giorno **prima** di distribuire lezioni e simulazioni. Funzione pura, nessuna scrittura.
- **Rischi:** cambia la distribuzione dei blocchi esistenti → aggiornare gli snapshot attesi in `planner-p4.test.ts`; aggiungere `PlanBlock` mantenendo compatibili i consumatori (`ReadinessPanel`, `TodayView`).

#### PR 3.3a — Stack di navigazione
- **File:** nuovo `src/renderer/src/nav/useNavStack.ts` (puro + hook), `App.tsx`, `SessionView.tsx`, `NotaView.tsx`, `PracticeView.tsx`, `PlanView.tsx`, `ReviewView.tsx`, `NotePicker.tsx` (prop `backLabel`), test nuovo `tests/unit/nav-stack.test.ts` + aggiornamenti in `session-view`/`nota-view`/`practice-view`, `docs/mappa/Interfaccia.md` + `Processi e IPC.md`.
- **Modifica:** `push(view)`, `pop()`, `replace(view)` (per i tab del dock: azzera lo stack sulla destinazione), al massimo 20 elementi (si scartano i più vecchi). `backLabel(prev)` → «← Oggi / ← Grafo / ← Note / ← Piano / ← Registro». `⌘[` globale (`keydown` con `metaKey && key==='['`), ignorato dentro textarea/input con testo. Le chiavi di `ReviewView`/`NotaView` restano come oggi per non perdere il remount.
- **Rischi:** E2E che cercano `← Home`/`Torna alla home` (`helpers.ts:15`): mantenere un fallback o aggiornare l'helper. Lo stato interno di `GraphView` (zoom/pan) **non** sopravvive al pop, perché la vista viene smontata: il criterio «torna alla vista di partenza» vale per la vista, non per il suo stato (lo stato è nella 4.2).

#### PR 3.3b — Contesto client condiviso (dipende da 1.1, 1.2a, 2.3)
- **File:** nuovo `src/renderer/src/shell/AppData.tsx` (`AppDataProvider` + `useAppData()`: `index`, `settings`, `aiStatus`, `due`, `lessons`, con `refresh*`), `App.tsx`, `AppShell.tsx` (`:66-93`), `TodayView.tsx` (`:56-90`), test con uno spy su `window.sinapsi` che conta le chiamate, `docs/mappa/Processi e IPC.md`.
- **Criterio:** all'avvio su Oggi `settings.get`, `vault.index`, `ai.status`, `lessons.list`, `review.memory` chiamati **una volta ciascuno** (oggi 2: App+TodayView per `vault.index`, AppShell+TodayView per `settings.get`/`ai.status`).
- **Rischi:** `applyTheme` oggi gira in `AppShell` dopo `settings.get`: deve restare il primo effetto, per evitare il flash del tema sbagliato.

#### PR 3.3c — Command palette `⌘K`
- **File:** nuovo `src/renderer/src/shell/CommandPalette.tsx` (su `GlassOverlay`/`GlassShell` di `glass.tsx` + `@base-ui/react` Dialog), `AppShell.tsx` (montaggio e scorciatoia), CSS con token, test `tests/unit/command-palette.test.tsx`, `docs/mappa/Interfaccia.md`.
- **Dati:** `index.notes` (titoli/alias), concetti dal grafo (`window.sinapsi.graph.*`: verificare se esiste un elenco leggero), lezioni, azioni statiche (Ripassa, Esercitati, Piano, Impostazioni). Filtro locale e sottosequenza, senza IPC per ogni tasto. Navigazione `↑/↓/Enter/Esc`, `role="combobox"` + `listbox`, focus intrappolato.
- **Rischi:** un secondo `GlassScene` aperto sopra `ViewScene`. Nel progetto le dialog usano già `GlassShell` (anello glass e nucleo solido): seguire lo stesso schema delle Impostazioni.

#### PR 3.4a — Cache dei sommari in `PracticeRunner` (dipende da 1.2a)
- **File:** `src/main/practice/runner.ts`, test `tests/unit/practice-runner.test.ts`, `docs/mappa/Pratica ed esami.md`.
- **Modifica:** `const states = new Map<string, PracticeState>()`. `load(id)` legge da disco solo se l'id non è in cache. `append` aggiorna la cache **riducendo l'evento sullo stato in memoria** (oppure, per sicurezza, invalidando l'id e rileggendo una volta sola). `list()`/`practiced()` usano la cache e il `readdir` serve solo a scoprire id nuovi. `practiced()` usa gli stati di `list()` senza un secondo `load`. Lo stato `awaiting === 'retry'` dipende da `inflight` e va calcolato **alla lettura**, non messo in cache.
- **Rischi:** file scritti da un altro processo o a mano: aggiungere, come in `memoryStore`, una guardia `mtimeMs+size` per id. È poco costosa e rende la cache sicura.
- **Test:** spy su `readJsonl` (o conteggio delle letture via fs mock): la seconda `practiced()` → 0 letture; dopo `append(id)` → solo quell'id riletto (o nessuna lettura se si riduce in memoria).

#### PR 3.4b — Preemption della corsia background nel bridge
- **File:** `src/main/ai/bridge.ts` (`:106-133`), test `tests/unit/ai-bridge.test.ts`, `docs/mappa/AI e motori.md`.
- **Modifica:**
  ```ts
  function pumpLane(engine, priority) {
    if (running[engine][priority]) return
    if (priority === 'background' &&
        (running[engine].interactive || queues[engine].interactive.length > 0)) return
    …
    .finally(() => {
      running[engine][priority] = false
      pumpLane(engine, priority)
      if (priority === 'interactive') pumpLane(engine, 'background')
    })
  }
  ```
  Anche il ramo «job abortito» deve ripompare `background` se la coda interactive si svuota. Un job background **già partito** non viene interrotto (nessun kill).
- **Test (fake timer + job controllabili):** (1) bg in coda + interactive in esecuzione → bg non parte; (2) al termine dell'ultima interactive bg parte; (3) interactive accodata mentre bg gira → bg non viene interrotto e la interactive parte subito (corsie separate, come oggi); (4) abort di una interactive in coda sblocca bg; (5) motori diversi indipendenti.
- **Rischio:** starvation del background durante sessioni lunghe di tutor (accettato dal brief; documentarlo nella mappa).

---

### Fase 4 — UI dinamica

#### PR 4.1 — `QuestionDock` progressivo e scorciatoie (dipende da 2.2, 3.1a)
- **File:** `src/renderer/src/session/QuestionDock.tsx` (`:23`, `:150-266`), `session.css` (`:251`, `:724`), `useDockHeight.ts`, test `question-dock.test.tsx`, `session-dock.test.tsx`, `layout13-session.test.ts`, `docs/mappa/Sessioni di studio.md`.
- **Modifica:** per `choice` non-goal, sezione Fiducia + Ragionamento dentro `<div className="qd-reveal" data-open={pick!==null && pick!=='idk'}>` con `display:grid; grid-template-rows: 0fr → 1fr; transition: grid-template-rows 160ms var(--ease-out)` e figlio `min-height:0; overflow:hidden`. `inert` quando è chiusa (così niente Tab dentro). `useDockHeight`: misurare su `transitionend` (oltre al `ResizeObserver`, che durante la transizione scatta a ogni frame, con rischio di jitter: valutare un `requestAnimationFrame` di raggruppamento o il blocco della misura durante la transizione). Scorciatoie: `A–F` → `setPick(i)`, `1–4` → livelli di Fiducia (solo con sezione aperta), ignorate se `document.activeElement` è input/textarea/contenteditable o con modificatori. Feedback `transform: scale(.98)` 120 ms tramite classe temporanea. Reduced motion: già coperto da `tokens.css:28` (`transition:none!important`).
- **Rischi:** `layout13-session.test.ts` («a tall dock scrolls its middle only») richiede che il dock resti a `max(55vh,300px)` con scroll interno: la sezione rivelata deve stare **dentro** la parte che scorre. `QuestionDock` è usato solo da `SessionView` (verificato). Goal e `idk` restano invariati.

#### PR 4.2a — Drawer di anteprima della nota (dipende da 3.3a)
- **File:** nuovo `src/renderer/src/components/NotePeek.tsx`, `MapView.tsx`/`GraphView.tsx` (`.gcard` → «Anteprima»), `ReviewView.tsx` (`onOpenNote` → anteprima invece di cambiare vista), CSS con token, test `note-peek.test.tsx` + `graph-view.test.tsx`, `docs/mappa/Interfaccia.md` + `Note vive.md`.
- **Modifica:** pannello `position:absolute` a destra, sfondo **solido** `var(--surface)` (nessuna `ViewScene`/`GlassScene` nuova), `role="dialog" aria-modal="false"`, chiusura con Esc o clic fuori, focus restituito al nodo. Contenuto: sezione o estratto letto da IPC già esistenti (`notes.get` / estratti del grafo: verificare il canale). Bottone «Apri Nota Viva completa» → `push({view:'nota'})`. Lo stato del grafo resta perché `GraphView` non viene smontato.
- **Test:** con un mock di `GraphView` verificare che aprire e chiudere `NotePeek` non chiami `setSel`/`setDrilledCluster` e non resetti `T.current`; `document.querySelectorAll('.lg-scene').length` invariato.

#### PR 4.2b — Stati di attesa progressivi, solo lato interfaccia (D6)
- **File:** `SessionView.tsx:184` (`<div className="sess" />`), `ReviewView.tsx:526` (`.rv-loading`), `NotaView.tsx:144` (`.state`), nuovo `src/renderer/src/components/Skeleton.tsx` + `src/renderer/src/components/useWaitStage.ts` (hook puro e testabile), CSS con token, test `wait-stage.test.ts` + aggiornamenti in `session-view.test.tsx` / `review-view.test.tsx` / `nota-view.test.tsx`, `docs/mappa/Interfaccia.md`.
- **Vincolo:** **nessuna modifica** a `src/main/ai/bridge.ts`, `src/preload/index.ts`, `src/shared/api.ts` (`CH`), `src/main/ipc.ts`. Si usano solo le API già esposte: `ai.onStatus` (`ai:status-changed`), `session.onPartial` (`session:partial`), `notes.onUpdate` (`notes:updated`), l'evento del grafo (`graph:changed`: verificare il nome del metodo nel preload), più i `get`/`list` esistenti.
- **Stadi per vista** (`useWaitStage({ engine, started, signals })` → `'preparing' | 'queued' | 'thinking' | 'writing' | 'slow'`):
  - **Sessione:** `preparing` finché `session.get` non risponde (skeleton di top bar + 2 bolle + dock al posto di `<div className="sess" />`); `thinking` con il motore `teach` in `busy` su `ai:status-changed`; `writing` al primo `session:partial` per quell'`id` (il testo parziale appare già oggi: lo skeleton gli cede il posto).
  - **Nota viva:** `preparing` → `thinking` (motore `note` `busy`) → `writing` a ogni `notes:updated` per quell'`id` in cui compare una sezione nuova (le sezioni arrivano già una per volta, «note vive per sezione»), mostrando «Sezione k di n» se il conteggio è disponibile nello `StoredNote`.
  - **Ripasso:** `.rv-loading` → skeleton della card domanda; `thinking` con il motore `variants`/`grade` `busy`; se le varianti dipendono dall'estrazione, `graph:changed` fa avanzare l'etichetta.
  - **Comune:** `queued` quando il motore della vista è già `busy` prima della richiesta (un altro lavoro occupa la corsia: derivato solo dallo stato, senza conoscere la coda); `slow` dopo 20 s senza nuovi segnali, con un testo tranquillo («Ci sta mettendo più del solito…») e il secondo contatore. `auth`/`missing`/`error` mostrano gli stati di errore che esistono già.
- **Accessibilità e movimento:** skeleton `aria-hidden`; un solo `role="status" aria-live="polite"` per vista con l'etichetta dello stadio (cambia solo quando cambia lo stadio, non ogni secondo); shimmer solo `opacity`/`transform` e spento da `prefers-reduced-motion` (`tokens.css:28`).
- **Rischi:** `review-view.test.tsx` e `nota-view.test.tsx` cercano i testi attuali di caricamento: aggiornarli tenendo un testo accessibile equivalente. Lo stato `busy` è per motore, non per richiesta: con due viste dello stesso motore l'etichetta può essere approssimata, ed è accettato da D6.
- **Test:** `useWaitStage` con eventi finti: `busy` → `thinking`, partial → `writing`, 20 s fake timer → `slow`, `idle` dopo `writing` → nessuna regressione a `thinking`.

#### PR 4.3 — Impulso sulle catene in `GraphView` (dipende da 3.1b)
- **File:** `src/renderer/src/graph/draw.ts` (nuovo campo `pulse?: { t0: number; edges: string[] }` in `DrawState`, disegno dell'impulso), `GraphView.tsx` (`:546-575`: alla selezione `pulseRef = {t0: performance.now(), …}`; il loop rimette `dirty=true` solo finché `now - t0 < 800`), test `graph-draws.test.tsx`, `docs/mappa/Grafo dei concetti.md`.
- **Modifica:** gradiente lineare che scorre lungo gli archi (premesse → conclusione) con `ctx.setLineDash`/`lineDashOffset` o un punto che si muove; le opacità dei nodi non correlati usano `focusSet` (`draw.ts:62`), che già esiste. Con `matchMedia('(prefers-reduced-motion: reduce)')` → `pulse` assente, un solo frame.
- **Test:** con un `requestAnimationFrame` finto, contare i frame dopo una selezione: > 0 entro 800 ms e **0** dopo 1 s senza input; reduced motion → 1 frame.

#### PR 4.4a — TOC con `IntersectionObserver` in `NotaView`
- **File:** `NotaView.tsx` (`:276` `.toc`, `:99` `.island`), `nota.css`, test `nota-view.test.tsx`, `docs/mappa/Note vive.md`.
- **Modifica:** un `IntersectionObserver` sulle intestazioni di sezione aggiorna `activeId`, così React fa un setState solo quando la sezione cambia. Un indicatore assoluto nel `.toc` si sposta con `transform: translateY(var(--toc-y))`, impostato via `style` dall'offset dell'elemento attivo. `.island` compatta con una classe applicata da un secondo observer su un sentinella dopo l'hero. `.content` non viene toccato.
- **Test:** `IntersectionObserver` finto: all'ingresso di una sezione cambia `aria-current="true"` nel TOC; nessun `addEventListener('scroll')` in `NotaView` (grep nel test).

#### PR 4.4b — Livello RMS della dettatura
- **File:** `src/renderer/src/components/dictation.ts` (`:96`, `:169`, `:202`), `MicButton.tsx`, CSS del mic, test `voice-dictation.test.ts` / `dictation-ui.test.tsx`, `docs/mappa/Fonti e voce.md`.
- **Modifica:** dopo `getUserMedia`, `AudioContext` + `createMediaStreamSource(stream)` + `AnalyserNode` (fftSize 256). Un loop rAF calcola l'RMS e scrive `--mic-level` (0–1) sull'elemento del bottone tramite ref, **senza setState**. Allo `stop` o con `state !== 'recording'`: `cancelAnimationFrame`, `source.disconnect()`, `ctx.close()`. Con reduced motion niente loop.
- **Test:** `AudioContext` finto: `close()` chiamato al passaggio a `transcribing` e all'unmount.

#### PR 4.4c — Barre del riepilogo di Ripasso
- **File:** `ReviewView.tsx` (`:665-710` `.rv-sum` / `.bars`), `review/review.css`, test `review-view.test.tsx`, `docs/mappa/Memoria e ripasso.md`.
- **Modifica:** ogni barra `transform-origin:left; transform: scaleX(var(--before))` → `scaleX(var(--after))` con `@keyframes` one-shot di 600 ms, `var(--ease-out)`, solo al primo montaggio. Reduced motion → stato finale (già garantito da `tokens.css:28`).

---

## 2. Ordine e dipendenze

```
PR0 ─┬─ 1.1 ─────────────────────────────┬─ 3.2a ─ 3.2b
     ├─ 1.2a ─┬─ 2.3 ─┐                  │
     │        └─ 3.4a │                  │
     ├─ 1.2b          ├─ 3.3b            │
     ├─ 1.3 ─ 3.1a ─ 3.1b ─ 4.3          │
     │         ├─ 3.1c ──────────────────┘
     │         └─ 4.1 (anche 2.2) · 4.4a/b/c
     ├─ 2.1 · 2.2 · 2.4a · 2.4b · 2.4c  (indipendenti)
     ├─ 3.4b (indipendente)
     └─ 3.3a ─ 3.3c · 4.2a ; 4.2b (dopo D6)
```

Possono andare in parallelo, perché toccano file diversi: {1.1, 1.2a, 1.3, 2.4a, 3.4b} e poi {2.1, 2.2, 2.4b, 2.4c}. Attenzione: **1.2b tocca `PracticeView`, `SessionView`, `ReviewView`, `api.ts`** e quindi va in conflitto con 2.1/2.2/2.4b/4.x: conviene farla presto, subito dopo PR 0. Con D5 anche la **2.3 tocca `api.ts` e `preload/index.ts`**: va fatta dopo 1.2b (oltre che dopo 1.2a). D7 introduce la regola ESLint in 1.2b, quindi tutte le PR successive devono superare `npx eslint src/renderer src/shared | grep -c no-restricted-imports` → 0.

---

## 3. Mappa dei rischi di regressione

| Area | Rischio | Mitigazione |
|---|---|---|
| Contratti CSS letti come testo | 16 test unitari leggono CSS (`layout13-*`, `control-tokens`, `fixes12*`, `review-fixes-3`, `formule`, `nota-*`, `logo`): un selettore rinominato rompe il test anche senza regressione visiva | Prima di ogni PR CSS: `grep -l "<selettore>" tests/unit`; aggiornare il test nello stesso commit spiegando perché |
| `session.css` | Altezza della top bar, larghezza del dock = colonna, `max(55vh,300px)` con scroll interno, spaziature strette in finestre basse | 2.2, 2.4b e 4.1 eseguono sempre `layout13-session.test.ts` + `session-dock.test.tsx` + E2E `session.spec.ts` |
| Ledger `.jsonl` | 2.1 (testo della bolla), 2.4a (topic), 3.4a (cache), 3.2b (piano) | Nessun formato cambia; le letture di eventi vecchi hanno un fallback (`it.text`); test con una fixture di eventi legacy |
| WebGPU / `@glass-sdk/liquid-glass` | 3.1c (`GlassRange`), 3.3c (palette), 4.2a (drawer) possono creare una seconda scena | Drawer solido; dialog con il pattern `GlassShell` già in uso; test: numero di `.lg-scene` invariato; `glass-teardown.test.tsx` e `glass.spec.ts` |
| Riduci trasparenza / glass fallito | Le superfici devono tornare `var(--surface)` (`tokens.css` regola `:root:not([data-glass="on"]) .lg-surface`) | Screenshot in `data-glass="solid"` per 1.3, 3.1a, 3.1b |
| Reduced motion | `tokens.css:28` spegne già tutte le transition e animation; i loop **JS** (4.3 impulso, 4.4b RMS) non sono coperti | `matchMedia` esplicito in JS + test |
| E2E con il nome «Grafo» | 2.4c | Scegliere «Grafo» (D1) |
| E2E con `window.confirm` / `← Home` | 2.2, 3.3a | Aggiornare `helpers.ts` e gli spec nello stesso commit |
| Tema (flash) | 3.3b sposta `settings.get` | `applyTheme` resta nel primo effetto |
| Bridge | 3.4b: background fermo se manca il ri-pompaggio | Test (2) e (4) in PR 3.4b |
| `memory:changed` (D5) | Raffiche di append → tempesta di `review.memory()`; listener non rimossi all'unmount | Debounce 250 ms nel main; unsubscribe nel cleanup; test con fake timer |
| Lint (D7) | Il lint globale è già rosso, quindi una violazione nuova passerebbe inosservata | Comando mirato sulla regola + prova con `--stdin` (PR 1.2b) |

---

## 4. Strategia di verifica per ogni PR

1. **Mirata:** `npx vitest run <test della PR>` (elencati sopra).
2. **Completa:** `npx vitest run` → exit 0 (dopo PR 0); `npm run typecheck` → 0.
3. **Contrasto:** `tests/unit/contrast.test.ts` esteso (1.3, 3.1a, 3.1b) per lavagna e trattato, testo ≥ 4.5:1, bordi e icone di controllo ≥ 3:1.
4. **E2E (PR UI):** `npm run build` poi `npm run test:e2e -- <spec>`; per le PR cromatiche (1.3, 3.1a, 3.1b) confronto manuale delle cartelle `test-results/screens/` prima e dopo.
5. **A mano nell'app:** lavagna, trattato, «Riduci trasparenza», macOS «Riduci movimento», finestra a 720 px (contratto delle fasi precedenti).
6. **Mappa:** controllare in review che il diff contenga la pagina `docs/mappa/` indicata.

---

## 5. Decisioni prese (2026-11-25)

| # | PR | Decisione | Effetto sul piano |
|---|---|---|---|
| D1 | 2.4c | **«Grafo»** | `MapView`: `<h1>`, `aria-label` e stato vuoto → «Grafo»; id interno `'Mappa'` ed E2E invariati |
| D2 | 1.3 | **34 px invariati** (whitelist `DENSE`) | Solo colori, bordi, hover e focus con i token; test che fissa i `34px` |
| D3 | 1.3 | **Chip con i token** | Via `--sh-send-bg`/`#fff` da `.mt-chip.on`; tinta `--accent` 12% + bordo `--accent`, testo `--ink`, `×` `currentColor`; `min-height: var(--ctl)` invariato |
| D4 | 3.1 | **`--serif` invariato** | Nessun font né metrica tipografica toccata in tutta la Fase 3 |
| D5 | 2.3 | **Evento `memory:changed` dal main** | Hook sul singleton `memoryStore` (1.2a) + debounce 250 ms; preload `review.onMemoryChanged`; `AppShell` e `TodayView` iscritti |
| D6 | 4.2b | **Solo lato interfaccia** | `useWaitStage` sui canali esistenti; nessuna modifica a bridge, preload, `CH` |
| D7 | 1.2b | **Regola ESLint** | `@typescript-eslint/no-restricted-imports` per `src/renderer/**` e `src/shared/**` contro `**/main/**` e `node:*`, nella stessa PR dello spostamento dei tipi |

Non restano domande bloccanti. Unico punto da chiarire durante l'implementazione, senza bloccare nulla: il nome esatto del metodo preload per `graph:changed` (4.2b).
