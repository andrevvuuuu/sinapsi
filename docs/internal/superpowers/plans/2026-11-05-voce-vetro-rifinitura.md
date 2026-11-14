# Voce ovunque, liquid glass e rifinitura stile Apple — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dettatura in ogni campo di testo libero, Liquid Glass classico sullo strato dei controlli, sessione leggibile mentre si risponde, e rifinitura stile Apple di tutta l'app **senza cambiare la struttura**.

**Architecture:** la voce diventa un servizio generico del main (processo Python persistente con mlx_whisper, ricaduta sulla CLI attuale) esposto con un canale IPC `voice:*`, più un hook e un tasto microfono riusabili nel renderer. Il vetro è un materiale unico definito in `tokens.css` (classe `.glass` + token per tema), spento quando macOS ha «Riduci trasparenza». La rifinitura passa da scale di tipografia, distanze e stati definite in `tokens.css` e applicate vista per vista.

**Tech Stack:** Electron (electron-vite), React 19, TypeScript, CSS per vista, Vitest + Testing Library, Playwright (Electron), mlx_whisper (Python).

**Spec:** `docs/superpowers/specs/2026-11-05-voce-vetro-rifinitura-design.md` — chi esegue legge spec e piano insieme.

**Base di lavoro:** worktree nuova `claude/voce-vetro` creata da `feat/tentativo-prima-dell-aiuto` @ `666ca7a` (contiene P3, P4, P6 con la voce di «Spiegalo tu», non ancora in `main`). Le 21 modifiche non salvate nella cartella principale **non** si toccano.

## Global Constraints

- Struttura invariata: niente elementi riordinati, spostati in un'altra zona, aggiunti (salvo il microfono) o tolti; flusso e testi uguali. Dimensioni, distanze, grandezze e pesi dei testi, colori e materiali possono cambiare anche se spostano le cose di qualche pixel.
- Restano i temi `lavagna` (scuro) e `trattato` (chiaro), i font Instrument Serif / Geist / Geist Mono / Caveat e il colore d'accento di ogni tema; si ritoccano i valori, non si sostituiscono.
- Solo stile macOS (HIG).
- Tasti principali e tasti già a 44 px: `--ctl: 44px`. Le barre dense restano a `--ctl-sm: 36px` / `--hit-min: 28px`.
- I suggerimenti della Home restano tutti su una riga.
- Contrasto WCAG 2.2 AA: 4,5:1 testo, 3:1 testo grande e bordi dei controlli; focus sempre visibile; tutto usabile da tastiera.
- Il vetro va solo sullo strato dei controlli; il testo da leggere sta su superfici piene. Niente vetro dentro altro vetro.
- Con «Riduci trasparenza» il vetro diventa pieno; con `prefers-reduced-motion` niente animazioni del materiale.
- Dettatura: testo inserito al cursore, mai inviato da solo; italiano; 10 minuti per i campi lunghi, 2 minuti per i campi brevi (ricerche, nomi); esclusi i campi numerici, decimali, URL e l'ID del modello.
- Nessun servizio di trascrizione esterno.
- Testi visibili in italiano; messaggi d'errore della voce come quelli esistenti (`Manca mlx_whisper: installalo con «pip install mlx-whisper»`).
- `npm run typecheck`, `npm test`, `npm run test:e2e` passano alla fine di ogni task.

## Review Focus

1. **Lasciare la vista mentre si registra o trascrive** (cambio di esercizio, «← Home»): il microfono si spegne, nessun testo arriva in un campo smontato, nessun errore in console. → test in Task 2.
2. **Due campi con microfono nella stessa vista** (QuestionDock, PaperExam, PracticeView): un solo campo registra alla volta; avviare il secondo ferma il primo. → test in Task 2.
3. **Il processo whisper persistente muore o non parte** (Python sbagliato, modello mancante, crash a metà): la richiesta in corso fallisce con un messaggio chiaro e la successiva usa la CLI o riavvia il processo; l'app non resta bloccata su «Trascrivo…». → test in Task 1.
4. **Domanda con opzioni molto lunghe in una finestra bassa** (720 px di altezza): «Invia risposta» resta visibile e il messaggio del tutor si legge scorrendo. → test in Task 6.
5. **Testo sopra il vetro su sfondo chiaro e scuro reale** (grafo in `trattato`, nota viva in `lavagna`): resta leggibile (AA). → verifica visiva in Task 5 e Task 9.

---

### Task 1: Servizio di dettatura nel main (processo persistente + IPC generico)

**Files:**
- Create: `resources/whisper_server.py`
- Create: `src/main/voice/dictation.ts`
- Modify: `src/main/memory/voice.ts` (riusa `extOf`, `VOICE_MAX`; `transcribeVoice` resta come ricaduta CLI)
- Modify: `src/shared/api.ts`, `src/preload/index.ts`, `src/main/ipc.ts`, `src/main/ipc-handlers.ts`
- Modify: `electron-builder.yml` (includere `resources/whisper_server.py` se `resources/` non è già incluso)
- Test: `tests/unit/voice-dictation.test.ts`

**Interfaces:**
- Produces (shared/api.ts):
  - `CH.voiceTranscribe = 'voice:transcribe'`, `CH.voiceMicrophone = 'voice:microphone'`, `CH.voiceStage = 'voice:stage'` (evento main→renderer).
  - in `SinapsiApi`: `voice: { transcribe(bytes: Uint8Array): Promise<string>; microphone(): Promise<boolean>; onStage(cb: (s: 'download' | 'load' | 'transcribe') => void): () => void }`
  - `review.voice` e `review.microphone` restano e delegano agli stessi servizi (compatibilità; Task 2 sposta Explain su `voice.*`).
- Produces (main): `createDictation(opts: { spawn: SpawnFn; resolvePython: () => Promise<string | null>; fallback: (bytes: Uint8Array) => Promise<string>; dir: string; idleMs?: number }): { transcribe(bytes: Uint8Array, onStage?: (s: Stage) => void): Promise<string>; dispose(): void }`

- [ ] **Step 1: Write the failing tests** in `tests/unit/voice-dictation.test.ts`, con uno `spawn` finto che simula il processo Python su stdin/stdout (righe JSON):
  - `reuses one python process for consecutive transcriptions` — due `transcribe` → `spawn` chiamato 1 volta, testi restituiti nell'ordine.
  - `falls back to the CLI when no python with mlx_whisper is found` — `resolvePython` → `null` ⇒ `fallback` chiamato, risultato restituito.
  - `rejects the pending request and restarts when the process dies` — il finto processo emette `exit` a metà ⇒ la prima promessa rifiuta con messaggio che contiene `Trascrizione interrotta`; la seconda `transcribe` rilancia `spawn` (2 chiamate totali).
  - `closes the process after idleMs of inactivity` — con `vi.useFakeTimers()`, `idleMs: 1000`: dopo 1000 ms il processo riceve `kill`.
  - `refuses recordings that are not webm or m4a` e `refuses recordings over VOICE_MAX` — rifiuto con `Registrazione non valida` / `La registrazione è troppo lunga`.
  - `deletes the recording file after transcription` — la cartella temporanea non esiste più (come il test esistente in `review-explain.test.ts`).
  - `makeVoiceHandlers rejects non-Uint8Array input` — `voice.transcribe('x')` rifiuta con `registrazione non valida`.

- [ ] **Step 2: Run** `npx vitest run tests/unit/voice-dictation.test.ts` — Expected: FAIL (modulo mancante).

- [ ] **Step 3: Implement `resources/whisper_server.py`**: legge righe JSON `{"id": str, "path": str, "language": "it"}` da stdin, risponde `{"id", "text"}` oppure `{"id", "error"}` su stdout (una riga, `flush`). Carica il modello una sola volta (`mlx_whisper.transcribe(path, path_or_hf_repo="mlx-community/whisper-large-v3-turbo", language=...)`); alla prima richiesta, prima del caricamento, scrive `{"stage": "load"}` (o `"download"` se la cartella del modello in `~/.cache/huggingface/hub/models--mlx-community--whisper-large-v3-turbo` non esiste).

- [ ] **Step 4: Implement `createDictation` in `src/main/voice/dictation.ts`**: scrive i byte in `dir/voce-<hex>/registrazione.<ext>`, invia la richiesta al processo, cancella la cartella nel `finally`. `resolvePython` di produzione: legge lo shebang del primo `mlx_whisper` nel PATH esteso già usato da `notebook/media.ts` e lo usa come interprete; se manca, `null` ⇒ `fallback = transcribeVoice`. Timeout per richiesta come `TRANSCRIBE_TIMEOUT`. `idleMs` di produzione: 10 minuti. Con `SINAPSI_FAKE_MEDIA=1` si usa solo il fallback esistente (`fakeMedia()`), così gli e2e non cambiano.

- [ ] **Step 5: Implement `makeVoiceHandlers(d: { transcribe; microphone })`** in `ipc-handlers.ts`, registra i tre canali in `ipc.ts` (`voice:stage` inviato a `e.sender`), espone `api.voice` nel preload; `review.voice` delega a `dictation.transcribe`. Chiamare `dispose()` su `app.on('will-quit')`.

- [ ] **Step 6: Run** `npx vitest run tests/unit/voice-dictation.test.ts tests/unit/review-explain.test.ts && npm run typecheck` — Expected: PASS.

- [ ] **Step 7: Prova manuale** (se mlx_whisper è installato): `npm run dev`, «Spiegalo tu» → due dettature brevi di fila; la seconda arriva in circa 1–2 s. Annotare i tempi nel messaggio di commit.

- [ ] **Step 8: Commit** `voce: servizio di dettatura con whisper sempre caricato e canale IPC generico`

### Task 2: Hook `useDictation` e tasto microfono riusabili; Explain li usa

**Files:**
- Create: `src/renderer/src/components/dictation.ts` (hook + coordinamento “un solo campo alla volta”)
- Create: `src/renderer/src/components/MicButton.tsx`, `src/renderer/src/components/mic.css`
- Modify: `src/renderer/src/review/exercises/Explain.tsx`, `src/renderer/src/review/review.css` (togliere `.rv-mic` rimasto inutile)
- Modify: `tests/e2e/review.spec.ts` (nome del tasto)
- Test: `tests/unit/dictation-ui.test.tsx`

**Interfaces:**
- Consumes: `window.sinapsi.voice.transcribe`, `.microphone`, `.onStage` (Task 1).
- Produces:
  - `useDictation(opts: { target: React.RefObject<HTMLTextAreaElement | HTMLInputElement | null>; value: string; onChange: (v: string) => void; maxSeconds?: number }): { state: 'idle' | 'recording' | 'transcribing'; seconds: number; stage: 'download' | 'load' | 'transcribe' | null; error: string | null; toggle: () => void }`
  - `<MicButton dictation={ReturnType<typeof useDictation>} size?: 'md' | 'sm' />` — icona dentro il campo; `aria-label` «Detta» / «Ferma la dettatura»; `aria-pressed`; durante la registrazione mostra il tempo `m:ss`; regione `aria-live="polite"` con «Registro», «Trascrivo…», «Scarico il modello di trascrizione…».
  - `<DictationError dictation=… />` — `<p role="alert">` sotto il campo.
  - `insertAtCursor(value: string, said: string, start: number, end: number): { value: string; caret: number }` (esportata per i test).
  - Costanti `DICTATION_LONG = 600`, `DICTATION_SHORT = 120` (secondi).
  - Scorciatoia globale **⌥ Spazio**: avvia/ferma la dettatura del campo che ha il focus, se ha un `useDictation` registrato.

- [ ] **Step 1: Write the failing tests** in `tests/unit/dictation-ui.test.tsx` (MediaRecorder e `getUserMedia` finti, `window.sinapsi.voice` mock):
  - `insertAtCursor` — `insertAtCursor('ciao mondo', 'bello', 5, 5)` → `{ value: 'ciao bello mondo', caret: 10 }`; su campo vuoto → `'bello'`; sostituisce una selezione.
  - `inserts the transcription at the cursor and never submits` — clic su «Detta», poi su «Ferma la dettatura» ⇒ il campo contiene il testo finto; la callback di invio del contenitore non è stata chiamata.
  - `stops at maxSeconds` — `maxSeconds: 2`, timer finti ⇒ dopo 2 s `MediaRecorder.stop` chiamato.
  - `only one field records at a time` — due campi; avviare il secondo ferma il primo.
  - `unmounting while transcribing drops the text without errors` — smonta durante la promessa ⇒ nessun `onChange` dopo lo smontaggio.
  - `explains a denied microphone` — `voice.microphone` → `false` ⇒ alert «Sinapsi non ha il permesso di usare il microfono (Impostazioni di Sistema → Privacy → Microfono).».
  - `Option+Space toggles dictation in the focused field`.
  - `Explain still transcribes into its textarea` — riusa il caso esistente di `review-view.test.tsx` con il nuovo nome del tasto.

- [ ] **Step 2: Run** `npx vitest run tests/unit/dictation-ui.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement** hook, `MicButton`, `DictationError` portando la logica oggi in `Explain.tsx` (permesso, stream, pulizia allo smontaggio, testi d'errore identici). Il campo è `readOnly` durante registrazione e trascrizione; i contenitori leggono `state !== 'idle'` per disattivare il proprio invio.

- [ ] **Step 4: Rifare `Explain.tsx`** con hook e `MicButton` (stessa etichetta del campo e stessi placeholder); aggiornare `tests/e2e/review.spec.ts`: `{ name: 'Parla' }` → `{ name: 'Detta' }`, `/Ferma/` resta valido.

- [ ] **Step 5: Run** `npx vitest run && npm run typecheck` — Expected: PASS.

- [ ] **Step 6: Commit** `voce: tasto microfono riusabile, testo al cursore e scorciatoia ⌥ Spazio`

### Task 3: Microfono in ogni campo di testo libero

**Files (Modify), con la durata:**
- lunghi (`DICTATION_LONG`): `home/Composer.tsx`, `session/SessionView.tsx`, `session/QuestionDock.tsx` (3 campi), `session/games/Spot.tsx`, `session/games/Taboo.tsx`, `review/ReviewView.tsx` (campo di testo libero a riga 545 se è testo, non numero), `review/exercises/Choice.tsx`, `review/exercises/Inputs.tsx` (solo il `<textarea>`; **non** l'input `inputMode="decimal"`), `practice/PracticeView.tsx` (2), `practice/PracticeSetup.tsx` (textarea), `practice/ExamView.tsx`, `practice/PaperExam.tsx` (textarea), `practice/PhotoButton.tsx` (textarea `#pr-read` e input di testo), `nota/blocks/Practice.tsx`, `notebook/ChatPane.tsx`
- brevi (`DICTATION_SHORT`, `size="sm"`): `home/LeftPanel.tsx` (ricerca), `home/NotebookPanel.tsx` (nome), `graph/GraphView.tsx` (ricerca), `notebook/SourceList.tsx` (solo «Cerca una nota»), `practice/MaterialDialog.tsx` (entrambi i campi di ricerca/testo), `practice/PaperExam.tsx` (input riga 28 se testuale), `notebook/NotebookView.tsx:158` (se testuale)
- **esclusi**: `type="number"`, `inputMode="decimal"|"numeric"`, link YouTube/NotebookLM, ID del modello in `SettingsDialog.tsx`.
- Test: `tests/unit/dictation-fields.test.tsx`

**Interfaces:**
- Consumes: `useDictation`, `MicButton`, `DictationError`, `DICTATION_LONG`, `DICTATION_SHORT` (Task 2).

- [ ] **Step 1: Write the failing test** `every free-text field has a mic, and excluded fields do not`: monta Composer, QuestionDock (misura), SessionView (domanda libera), Explain, ChatPane, LeftPanel con i mock già usati nei test esistenti; per ciascun campo testuale `getByRole('button', { name: 'Detta' })` esiste nello stesso contenitore del campo; per l'input decimale di `Inputs.tsx` e i link non esiste. Più `sending is disabled while dictating` sul Composer (tasto «Inizia» disattivato finché `state !== 'idle'`).

- [ ] **Step 2: Run** `npx vitest run tests/unit/dictation-fields.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Inserire il microfono** in ogni campo dell'elenco: icona **dentro** il campo a destra (o a sinistra del tasto d'invio, dove c'è), senza aumentarne l'altezza; ogni campo ha un `ref`; l'invio con Invio resta com'è ma è bloccato durante dettatura.

- [ ] **Step 4: Run** `npx vitest run && npm run typecheck && npm run test:e2e` — Expected: PASS (aggiornare solo selettori resi ambigui dal nuovo tasto, senza togliere controlli).

- [ ] **Step 5: Commit** `voce: si può dettare in ogni campo di testo, compreso l'argomento nella Home`

### Task 4: Materiale Liquid Glass e «Riduci trasparenza»

**Files:**
- Modify: `src/renderer/src/styles/tokens.css` (token e classe `.glass`)
- Create: `src/renderer/src/components/GlassFilter.tsx` (filtro SVG di rifrazione montato una volta in `App.tsx`)
- Modify: `src/renderer/src/App.tsx`, `src/main/ipc.ts`, `src/shared/api.ts`, `src/preload/index.ts`
- Test: `tests/unit/glass.test.tsx`

**Interfaces:**
- Produces:
  - IPC `CH.uiTransparency = 'ui:transparency'` (invoke → `boolean` ridotta) e evento `'ui:transparency-changed'`; `api.ui.reducedTransparency(): Promise<boolean>`, `api.ui.onReducedTransparency(cb: (v: boolean) => void): () => void`. Main: `nativeTheme.prefersReducedTransparency`, aggiornato su `nativeTheme.on('updated')`.
  - Attributo `document.documentElement.dataset.glass = 'on' | 'solid'`.
  - Token per tema: `--glass-tint`, `--glass-blur`, `--glass-sat`, `--glass-rim` (bordo luminoso), `--glass-spec` (riflesso in alto), `--glass-shadow`, `--glass-ink` (testo sopra il vetro, AA garantito).
  - Classi: `.glass` (materiale), `.glass-solid` implicito via `[data-glass="solid"] .glass`, `.scroll-edge` (dissolvenza al bordo dove il contenuto scorre sotto un controllo, alto o basso).
  - Filtro SVG `#glass-refract` (feTurbulence/feDisplacementMap leggero ai bordi) usato in `backdrop-filter: url(#glass-refract) blur(...) saturate(...)` solo dentro `@supports`; senza supporto resta blur + saturate.

- [ ] **Step 1: Write the failing tests**: `sets data-glass="solid" when macOS reduces transparency` (mock `api.ui.reducedTransparency` → `true`), `switches live when the setting changes` (callback di `onReducedTransparency`), `mounts the refraction filter once`.

- [ ] **Step 2: Run** `npx vitest run tests/unit/glass.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement** IPC, attributo e filtro; definire `.glass` e token in `tokens.css` per `lavagna` e `trattato` (con `[data-glass="solid"]` → sfondo pieno `--surface`, niente `backdrop-filter`; con `prefers-reduced-motion` nessuna transizione del materiale). Valori a scelta di chi esegue seguendo le skill `apple-design` (sezione Liquid Glass / Materials) e `impeccable`.

- [ ] **Step 4: Pagina di prova temporanea non committata** (o storybook-like in `test-results/`): `.glass` sopra il grafo e sopra testo in entrambi i temi; screenshot con Playwright e controllo contrasto di `--glass-ink` (≥ 4,5:1 sul caso peggiore).

- [ ] **Step 5: Run** `npx vitest run && npm run typecheck` — Expected: PASS.

- [ ] **Step 6: Commit** `vetro: materiale Liquid Glass unico, spento con «Riduci trasparenza»`

### Task 5: Vetro sui controlli e contenuto che scorre sotto

**Files:**
- Modify: `home/home.css` + `Home.tsx` (selettore modalità, guscio del composer, barre), `session/session.css` + `SessionView.tsx` (`.top`, `.shell`), `nota/nota.css` (`.island`, barra), `graph/graph.css` (controlli fluttuanti), `review/review.css`, `practice/practice.css`, `notebook/notebook.css`, `styles/tokens.css` (`button.back-btn`), dialoghi e popover (`SettingsDialog`, `MaterialDialog`, menu)
- Test: `tests/e2e/glass.spec.ts`

**Interfaces:**
- Consumes: `.glass`, `.scroll-edge`, `data-glass` (Task 4).

- [ ] **Step 1: Write the failing e2e** `tests/e2e/glass.spec.ts`: Home, sessione, nota viva, grafo: la barra in alto e il guscio del composer/riquadro hanno `backdrop-filter` diverso da `none`; le superfici interne (`.inner`, `.core`, opzioni) hanno `backdrop-filter: none` e sfondo opaco; nella sessione il contenitore che scorre si estende sotto `.top` (il suo `getBoundingClientRect().top` ≤ quello di `.top`). Screenshot in `test-results/glass-*.png` per entrambi i temi.

- [ ] **Step 2: Run** `npx playwright test tests/e2e/glass.spec.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**: applicare `.glass` ai controlli dell'elenco della spec §5.4; nelle viste che scorrono (sessione, nota viva, liste, ripasso, pratica, notebook) la barra in alto diventa sovrapposta (`position: sticky`/`absolute` dentro la stessa colonna, stessa posizione visibile) e il contenuto riceve un margine iniziale pari all'altezza della barra, così a riposo nulla è coperto; dissolvenza `.scroll-edge` dove il contenuto passa sotto. Nessun elemento cambia posto.

- [ ] **Step 4: Confronto prima/dopo**: screenshot delle stesse viste su `feat/tentativo-prima-dell-aiuto` e sul branch; controllare che la disposizione coincida. Rivedere con la skill `apple-design` (materiali) e correggere.

- [ ] **Step 5: Run** `npm run typecheck && npx vitest run && npm run test:e2e` — Expected: PASS.

- [ ] **Step 6: Commit** `vetro: barre e riquadri in Liquid Glass, i contenuti scorrono sotto`

### Task 6: Sessione leggibile mentre si risponde

**Files:**
- Modify: `session/SessionView.tsx`, `session/QuestionDock.tsx`, `session/session.css`
- Modify (stesso principio dove serve): riquadri analoghi in `review/ReviewView.tsx` / `review.css`, `practice/PracticeView.tsx` / `practice.css`
- Test: `tests/unit/session-dock.test.tsx`, `tests/e2e/session.spec.ts` (nuovo caso)

**Interfaces:**
- Produces: variabile CSS `--dock-h` sul contenitore che scorre (altezza reale del riquadro, da `ResizeObserver`); classe `.dock-scroll` per la parte che scorre dentro il riquadro.

- [ ] **Step 1: Write the failing tests**:
  - unit `sets --dock-h from the dock height` (ResizeObserver finto) e `scrolls the start of the new tutor message into view when a question arrives` (spia su `scrollIntoView({ block: 'start' })` del messaggio del tutor precedente la domanda).
  - e2e `long measure question in a 720px-high window` con fixture della fase Misura con quattro opzioni lunghe (come nello screenshot di Andrea: testo delle opzioni A–D su tre righe ciascuna, obiettivo lungo): finestra 1280×720; «Invia risposta» e il testo della domanda sono visibili; il riquadro è alto al massimo il 60% della finestra; scorrendo la conversazione fino in fondo, l'ultimo messaggio del tutor ha il bordo inferiore sopra il bordo superiore del riquadro.

- [ ] **Step 2: Run** i due test — Expected: FAIL.

- [ ] **Step 3: Implement**: padding inferiore della colonna = `var(--dock-h)`; riquadro con `max-height: 60vh` (in finestre basse ≥ un minimo che mostri domanda e invio); dentro, domanda e riga d'azione fisse, opzioni + fiducia + ragionamento in `.dock-scroll`; all'arrivo di una domanda nuova, scorrere all'**inizio** del messaggio del tutor; la sfumatura non copre testo leggibile (diventa `.scroll-edge` di Task 4).

- [ ] **Step 4: Run** `npx vitest run && npm run test:e2e` — Expected: PASS. Screenshot `test-results/session-measure-long.png` da allegare al resoconto.

- [ ] **Step 5: Commit** `sessione: il testo che porta alla domanda resta leggibile mentre rispondi`

### Task 7: Composer della Home

**Files:**
- Modify: `home/Composer.tsx`, `home/home.css`, `home/icons.tsx` (icona microfono, se non già in Task 2)
- Test: `tests/unit/home-v2.test.tsx` (nuovi casi)

- [ ] **Step 1: Write the failing tests**: `suggestion chips stay on one row` (il contenitore `.suggest` ha `flex-wrap: nowrap`, tutti i chip hanno lo stesso `offsetTop`); `chip title may take two lines` (classe `.sg-label` con `-webkit-line-clamp: 2`); `chip shows its full text on hover and focus` (`title` e `aria-label` = `label — reason`, già esistenti: restano); `send button has distinct enabled/disabled states` (classe/attributo diverso e `aria-disabled` coerente).

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement** spec §5.3: larghezza dei chip in base al contenuto dentro la riga, titolo fino a due righe, riga secondaria e placeholder ad AA, tasto invio con stato attivo (punto d'attenzione, colore d'accento o `--ink` pieno) e disattivato leggibile (contrasto ≥ 3:1 del contorno), microfono accanto all'invio, raggi concentrici (esterno = interno + padding del guscio), selettore modalità e guscio in `.glass`.

- [ ] **Step 4: Run** `npx vitest run && npm run test:e2e`; screenshot della Home in entrambi i temi, confronto con lo screenshot di Andrea.

- [ ] **Step 5: Commit** `home: composer più leggibile, suggerimenti interi e invio chiaro`

### Task 8: Scale di tipografia, distanze, colori e stati

Un sotto-passo per area; stessa procedura per ciascuno. **Prima** si definiscono le scale, **poi** si applicano.

**Files:**
- 8a: `styles/tokens.css` — scala tipografica (proposta: 11 mono maiuscolo / 13 / 15 / 17 / 22 / 28 serif, interlinee e pesi fissati), scala delle distanze in multipli di 4 (`--s-1: 4px` … `--s-8: 32px`), raggi (`--r-sm`, `--r-md`, `--r-lg`, `--r-pill`), stati dei tasti (`--btn-*` per principale, secondario, testuale: hover, premuto, focus, disattivato), `--muted`, `--hair` e placeholder portati ad AA in entrambi i temi.
- 8b: Home, pannello sinistro, impostazioni (`home/*.css`, `SettingsDialog.tsx`)
- 8c: sessione e giochi (`session.css`, `games.css`)
- 8d: ripasso (`review.css`, 693 righe: la più grande)
- 8e: pratica ed esame (`practice.css`)
- 8f: nota viva, figure, grafo, notebook (`nota.css`, `figure.css`, `graph.css`, `notebook.css`, `math-select.css`)
- Test: `tests/unit/contrast.test.ts` (8a), `tests/e2e/screens.spec.ts` (screenshot di ogni vista, entrambi i temi)

- [ ] **Step 1 (8a): Write the failing test** `tests/unit/contrast.test.ts`: legge i valori dei token da `tokens.css` per `lavagna` e `trattato` e verifica `ratio(--ink, --bg) ≥ 4.5`, `ratio(--muted, --bg) ≥ 4.5`, `ratio(--muted, --surface) ≥ 4.5`, `ratio(--muted, --panel) ≥ 4.5`, `ratio(--accent, --bg) ≥ 3`, `ratio(--glass-ink, glass worst case) ≥ 4.5`, contorno del tasto disattivato ≥ 3 (funzione di contrasto WCAG nel test).
- [ ] **Step 2: Run** — Expected: FAIL dove i valori attuali non bastano.
- [ ] **Step 3: Implement 8a** (token) — Expected: test PASS. Commit `stile: scale di tipografia, distanze, raggi e stati; contrasti AA`.
- [ ] **Step 4: Write** `tests/e2e/screens.spec.ts`: apre ogni vista (Home, sessione in Misura e con piano, ripasso, pratica allenamento ed esame, nota viva, grafo, notebook, impostazioni) in entrambi i temi e salva `test-results/screens/<vista>-<tema>.png`; controlla che ogni `button` visibile fuori dalle barre dense misuri almeno 44×44 e che nessun testo visibile abbia `font-size` < 11 px.
- [ ] **Step 5 (8b…8f), per ogni area**: sostituire i valori sparsi con le scale di 8a; definire gli stati mancanti; uniformare le distanze tra tasti e scritte; non spostare elementi. Rivedere con le skill `apple-design`, `impeccable` (polish/audit), `ui-ux-pro-max`, `accessibility-compliance`, `web-design-guidelines` sugli screenshot; correggere; rieseguire `screens.spec.ts`. Confronto con gli screenshot della base: disposizione identica.
- [ ] **Step 6: Run** dopo ogni area `npm run typecheck && npx vitest run && npm run test:e2e` — Expected: PASS.
- [ ] **Step 7: Commit** un commit per area, es. `stile: ripasso con scale, stati e contrasti stile Apple`.

### Task 9: Verifica finale e revisione

- [ ] **Step 1:** `npm run typecheck && npm test && npm run test:e2e` — Expected: tutto PASS; riportare il riepilogo.
- [ ] **Step 2:** con «Riduci trasparenza» attivo in macOS (o forzando `data-glass="solid"`), screenshot di Home e sessione: superfici piene, testo leggibile.
- [ ] **Step 3:** prova reale della dettatura (`npm run dev`): un campo per vista; caso microfono negato; caso mlx_whisper non nel PATH (messaggio «Manca mlx_whisper…»).
- [ ] **Step 4:** tavola prima/dopo di ogni vista in entrambi i temi (da `test-results/screens/`) per Andrea.
- [ ] **Step 5:** revisione finale dell'intero branch (superpowers:requesting-code-review) e poi superpowers:finishing-a-development-branch.
