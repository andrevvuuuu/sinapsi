# Fase 5 — Notebook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A NotebookLM-like Notebook: notebooks of imported sources (PDF, slides, audio/video, YouTube, text, vault notes), local transcriptions, and a chat that answers **only from the sources**, with clickable citations; plus a manual link to the matching NotebookLM notebook.

**Architecture:** Append-only ledgers in `<data>/notebook/` (notebooks, sources, one chat file per notebook); originals copied into `<data>/notebook/files/<id>/`, extracted text in `<data>/notebook/text/<id>.json` as labelled segments (page, slide, timestamp, heading). A serial ingest queue turns each source into segments (pdfjs-dist, fflate for pptx, mlx_whisper for audio, yt-dlp for YouTube). Chat: segments → chunks → full context when the selected sources fit the budget, otherwise BM25 top chunks; Gemini answers as JSON claims each citing excerpt numbers; the app drops claims without a valid citation.

**Tech Stack:** existing (Electron, React 19, zod 4, vitest, Playwright) + `pdfjs-dist` and `fflate` pinned exactly; external CLIs `mlx_whisper`, `yt-dlp`, `ffmpeg` (already installed on Andrea's Mac).

**Spec:** `docs/design.md` (§1 Notebook, §2 "Fonti grezze", "Dopo la sessione", "Divisione Gemini/Claude", §3 `sources.jsonl`, §4 step 5). User request 27/10: answers based **only** on the sources imported in the app, never on the AI's general knowledge; optional button that opens the NotebookLM notebook with the same name/topic.

## Global Constraints

- The app never writes into the Obsidian vault; vault notes added as sources are read only.
- No API keys: AI only through `agy`/`claude` (bridge), transcription only local (`mlx_whisper`).
- Notebook answers: only from the given excerpts; every claim cites ≥1 excerpt; claims without a valid citation are not shown; what the sources do not say goes in `missing`. Prompt forbids tools, web and files.
- Prompts and UI copy in Italian; LaTeX with doubled backslashes in JSON.
- External commands get user-provided strings only as arguments after `--` (never through a shell); YouTube URLs must have host youtube.com / www.youtube.com / m.youtube.com / youtu.be; NotebookLM links must start with `https://notebooklm.google.com/`.
- e2e tests use fakes (`SINAPSI_FAKE_NOTEBOOK=1` for the answer, `SINAPSI_FAKE_MEDIA=1` for whisper/yt-dlp); live tests only in `*.live.test.ts`.
- Deps pinned exactly (no `^`).

## Review Focus

1. A scanned PDF (pages without text) — the source becomes ready with a clear count of unreadable pages, not an empty silent source; all pages empty → failed with "PDF senza testo (scansione)".
2. App quit during a long transcription — at restart the source is not stuck "in lavorazione": it shows "Interrotta. Riprova." and can be retried.
3. A reply citing an excerpt number that was not given, or with no claims and no `missing` — invalid citations removed, uncited claims dropped and counted, an empty answer says so.
4. A notebook too large for the prompt — retrieval keeps the prompt under budget and still finds the passage that contains the question's words.
5. YouTube video without subtitles — falls back to downloading the audio and transcribing it.

---

### Task 1: Types and stores

**Files:** Create `src/shared/notebook-types.ts`, `src/main/notebook/store.ts`; Test `tests/unit/notebook-store.test.ts`

**Interfaces — Produces:**
- `SourceKind = 'pdf' | 'slides' | 'audio' | 'youtube' | 'text' | 'vault'`
- `Segment = { label: string; text: string; start?: number }` (start in seconds for audio/youtube)
- `SourceText = { segments: Segment[]; warnings: string[] }`
- `Notebook = { id; name; subject: string | null; link: string | null; createdAt; sources: Source[] }`
- `Source = { id; notebookId; kind; title; origin: string; addedAt; status: 'queued'|'processing'|'ready'|'failed'; progress?: number; error?: string; info?: string }` (`info`: e.g. "34 pagine", "52 min", warnings joined)
- `ChatTurn = { role:'user'; text; at; sourceIds: string[] } | { role:'assistant'; at; claims: {text; sources:number[]}[]; missing: string|null; dropped: number; excerpts: Excerpt[] } | { role:'error'; at; text }`, `Excerpt = { n; sourceId; title; label; text; start? }`
- `notebookStore(dir)` → `{ notebooks(): Promise<Notebook[]>; create(name): Promise<string>; update(id, patch:{name?, subject?, link?}): Promise<void>; remove(id); addSource(s: Omit<Source,'status'|'addedAt'>): Promise<void>; setStatus(id, st: Pick<Source,'status'|'progress'|'error'|'info'>); removeSource(id); writeText(id, t: SourceText); readText(id): Promise<SourceText|null>; filesDir(id): string; chat(notebookId): Promise<ChatTurn[]>; appendChat(notebookId, t: ChatTurn) }`
- Ledgers: `notebooks.jsonl` ops create/update/delete; `sources.jsonl` ops add/status/remove; `chats/<notebookId>.jsonl`. State derived on read; a deleted notebook hides its sources; removeSource deletes `files/<id>` and `text/<id>.json`.

- [ ] Test: create → update(link, subject) → list shows them; addSource + setStatus sequence derives last status; removeSource hides it and deletes files; remove(notebook) hides it; chat round-trip; bad lines skipped. Run RED, implement, GREEN, commit `feat(notebook): stores`.

### Task 2: Readers (text → segments)

**Files:** Create `src/main/notebook/readers.ts`; Test `tests/unit/notebook-readers.test.ts` (fixtures built in the test: a minimal PDF writer helper in `tests/unit/helpers/pdf.ts`, a pptx zipped with fflate)

**Produces:** `readPdf(file): Promise<SourceText>` (label `p. N`; pages with <20 chars counted → warning "N pagine senza testo (scansioni)"; all empty → throw "PDF senza testo (scansione)"); `readSlides(file)` (pptx: `ppt/slides/slideN.xml` in numeric order, `<a:t>` runs joined, speaker notes appended; label `slide N`; XML entities decoded); `readTextDoc(text, title)` (markdown/txt: split at headings → label = heading or `parte N`, frontmatter stripped); `parseWhisperJson(json)` and `parseVtt(vtt)` → segments grouped to ~60 s windows, label `mm:ss` (or `h:mm:ss`), `start` seconds, VTT rolling-caption duplicates removed; `fmtTime(s)`.

- [ ] Tests per reader with exact labels and texts, scanned-PDF warning and all-empty throw, VTT dedupe, whisper grouping. RED → implement (pdfjs `legacy/build/pdf.mjs`, `disableWorker`-style fake worker) → GREEN → commit `feat(notebook): readers`.

### Task 3: Media tools and ingest queue

**Files:** Create `src/main/notebook/media.ts`, `src/main/notebook/ingest.ts`, `src/main/notebook/fake-media.ts`; Test `tests/unit/notebook-ingest.test.ts`

**Produces:**
- `RunTool = (cmd, args, opts:{ timeoutMs; cwd?; onStderr?(chunk) }) => Promise<{code; stdout; stderr; timedOut}>` (real one reuses `nodeSpawn` pattern + stderr callback).
- `isYoutubeUrl(u): boolean`, `youtubeId(u)`.
- `transcribe(run, file, outDir, onProgress)`: `mlx_whisper --model mlx-community/whisper-large-v3-turbo --output-format json --output-dir <outDir> --output-name t -- <file>`; progress from tqdm `NN%` in stderr; timeout 3 h.
- `fetchYoutube(run, url, dir, onProgress)`: `yt-dlp --skip-download --write-subs --write-auto-subs --sub-langs it.*,en.* --sub-format vtt --print title -o <dir>/sub -- <url>`; prefers manual `it`, then auto `it`, then `en`; none → `yt-dlp -x --audio-format m4a -o <dir>/audio.%(ext)s -- <url>` then `transcribe`. Returns `{ title, text: SourceText }`.
- `createIngestor({ store, run, readVault(path), now?, onChange(source) })` → `{ addFiles(nbId, paths), addYoutube(nbId, url), addVaultNote(nbId, path), retry(id), remove(id), fixStale() }`; kind from extension (pdf; pptx → slides; txt/md → text; m4a mp3 wav aac flac ogg mp4 mov m4v webm → audio; others rejected with an Italian error); files copied into `filesDir(id)`; one job at a time; status queued → processing (progress) → ready (info) | failed (error); `fixStale` turns processing/queued from a previous run into failed "Interrotta. Riprova.".
- `fakeMedia()` RunTool for e2e/unit: whisper writes a fixed transcript json, yt-dlp prints a title and writes a vtt.

- [ ] Tests: pdf + md + audio + youtube (with and without subs) through the queue with a fake RunTool, statuses in order, serial execution, unsupported extension, bad YouTube URL rejected before any spawn, args contain `--` before user input, fixStale, retry, remove. RED → GREEN → commit `feat(notebook): ingest`.

### Task 4: Chunks and retrieval

**Files:** Create `src/main/notebook/retrieve.ts`; Test `tests/unit/notebook-retrieve.test.ts`

**Produces:** `Chunk = { sourceId; title; label; text; start?; order }`; `chunk(sourceId, title, t: SourceText, max = 1200): Chunk[]` (segments split at paragraph/sentence boundaries, never merged across labels); `tokens(s)` (lowercase, accents stripped, Italian+English stopwords removed, truncation stem to 6 chars); `selectExcerpts(chunks, query, budget = 120_000): { excerpts: Chunk[]; full: boolean }` — all chunks in source order when total ≤ budget, otherwise BM25 (k1 1.2, b 0.75) best chunks until 40 000 chars, returned in source order.

- [ ] Tests: chunk sizes and labels; full mode; over budget picks the chunk with the rare query words ("lemma del cammello") and stays ≤ 40 000; accent/stem matching ("derivabilità" ~ "derivabile"). RED → GREEN → commit `feat(notebook): retrieval`.

### Task 5: Grounded chat

**Files:** Create `src/main/notebook/chat.ts`, `src/main/notebook/fake-notebook.ts`; Test `tests/unit/notebook-chat.test.ts`

**Produces:**
- `buildAskPrompt({ notebookName, excerpts: Excerpt[], history: ChatTurn[], question })` — the spike-verified rules (only excerpts, no general knowledge, no tools/web/files, each claim cites, sources win over what you know, `missing`, doubled backslashes), last 6 turns marked "conversazione precedente: non è una fonte", excerpts as `[n] (title, label) text`.
- `NotebookReplySchema` (lenient: `claims` array of `{text, sources: number[]}` with coercion of `sources` from a single number; `missing` string|null).
- `groundReply(reply, excerpts)` → `{ claims, missing, dropped }`: invalid source numbers removed, claims left without sources dropped and counted.
- `createNotebookChat({ bridge, store, workDir, now? })` → `ask(notebookId, question, sourceIds): Promise<void>` (appends user turn first; ready selected sources only — none ready → error turn "Nessuna fonte pronta"; bridge.ask task `notebook`, timeout 180 000, cwd workDir; stores only cited excerpts renumbered? **No** — keep original numbers, store only the cited ones; failure → error turn with the message), `onTurn` callback.
- `fakeNotebookBridge()` answers with one claim citing [1] and `missing: null`.

- [ ] Tests: prompt contents (rules, excerpt format, history marker); groundReply cases (invalid number, uncited claim, single-number coercion); ask with fake bridge stores user + assistant turns with cited excerpts only; error turn on failure; no ready sources. RED → GREEN → commit `feat(notebook): grounded chat`.

### Task 6: IPC, preload, API, nota viva uses notebook sources

**Files:** Modify `src/shared/api.ts`, `src/preload/index.ts`, `src/main/ipc.ts`, `src/main/ipc-handlers.ts`, `src/main/notes/prompt.ts`, `src/main/notes/generator.ts`; Test `tests/unit/ipc-notebook.test.ts`, extend `tests/unit/notes-prompt` test file if present

**Produces:** channels `notebook:list|create|update|delete|add-files|choose-files|add-youtube|add-vault|remove-source|retry-source|text|chat|ask|open-file|updated`; `makeNotebookHandlers` validating ids (uuid), names (1–80 chars), link (`https://notebooklm.google.com/` prefix or null), YouTube URL, vault path inside the vault and `.md`, file paths absolute; `api.notebook.*`, `onUpdate(cb({notebooks?, chat?}))`; `openExternal` already allows https. Notes: `buildNotePrompt` gains optional `sources?: Excerpt[]` → section "FONTI DEL NOTEBOOK (estratti; usali per completare, la nota Obsidian resta la base; cita tra parentesi (titolo, p. N))"; generator gets `notebookExcerpts(notePath, title)` = BM25 over ready sources of notebooks whose `subject` equals the note's subject, budget 15 000 chars.

- [ ] Tests: handler validation (bad link, bad URL, vault path outside, non-uuid); prompt includes the sources section only when given. RED → GREEN → commit `feat(notebook): ipc and nota viva sources`.

### Task 7: Interface

**Files:** Modify `src/renderer/src/home/NotebookPanel.tsx`, `Home.tsx`, `App.tsx`; Create `src/renderer/src/notebook/NotebookView.tsx`, `SourceList.tsx`, `ChatPane.tsx`, `SourceViewer.tsx`, `notebook.css`; Test `tests/unit/notebook-view.test.tsx`

- Panel: list of notebooks (name, "N fonti", materia), "Nuovo notebook" (inline name input), click → `{view:'notebook', id}`; "Importa fonti" opens the most recent notebook or creates "Notebook" first.
- View: header (back, editable name, materia select from vault subjects, NotebookLM: "Apri in NotebookLM" when linked, else "Collega NotebookLM" → paste field + "Come trovarlo" hint; edit/remove link); left: sources with checkbox (selected for the chat; default all ready), status line (In coda / Trascrivo… NN% / Pronta · info / errore + Riprova), remove (confirm), add buttons File… / YouTube / Nota del vault, drag-and-drop files; center: chat — answers as paragraphs (RichText) with citation chips `[n]`, "Le fonti non dicono" callout for `missing`, "Ho tolto N frasi senza fonte" note, error turns with Riprova, composer "Chiedi alle tue fonti" + footer "Risponde solo dalle fonti selezionate (k di n)"; pending state "Cerco nelle fonti…"; right drawer: SourceViewer opened from a chip, scrolled to the cited segment, highlighted, YouTube label opens `https://www.youtube.com/watch?v=<id>&t=<s>s`, "Apri il file" for files.
- [ ] Tests: create notebook; link validation message; source statuses; ask sends selected ids; chips open the viewer on the segment; missing callout; dropped note. RED → GREEN → commit `feat(notebook): interface`.

### Task 8: e2e, live, README

**Files:** `tests/e2e/notebook.spec.ts`, `tests/live/notebook.live.test.ts`, `README.md`
- e2e (fakes): create notebook, import a md file and a YouTube URL (fake media), ask, see a citation chip and open it.
- live: real PDF made with the helper + real `agy` grounded answer (question with an answer only in the source and one not in it → `missing`); real whisper on a `say`-generated Italian clip; real yt-dlp subtitles on one short public video.
- README "Notebook" section. Commit `test(notebook): e2e and live; README`.
