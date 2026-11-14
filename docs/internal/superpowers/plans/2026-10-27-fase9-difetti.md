# Fase 9 — I piccoli difetti di tutte le fasi

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Every item: failing test first, then the fix.

**Goal:** close the deferred minors Andrea listed on 27/10 (all phases), grouped by area so each task touches one part of the app.

## Global Constraints
- Never write to the vault; no API keys; Italian copy; targets ≥ 44 px; one test per item that fails before the fix.

### Task 1: Vault (fase 1)
- `[[Nota\|alias]]` inside tables parsed as link + alias.
- Embedded images/PDF (`![[x.png]]`, `![[x.pdf]]`) are attachments, not links to missing notes.
- Two notes with the same title in different folders: links resolve by path (closest folder, then shortest path), never mixed.
- Changing vault twice quickly: only the last watcher stays alive.
- Home that cannot load data shows why and a "Riprova".

### Task 2: AI bridge (fase 1)
- Mixed text + JSON replies parsed without a second call when the JSON is complete.
- Long prompts (> 100 000 chars) sent through stdin, not argv.

### Task 3: Apprendimento (fase 2)
- First Riprova after a quit mid-first-turn works (fresh conversation id until the first tutor turn).
- Riprova after a mid-session error does not repeat Andrea's message to the tutor.
- "Adesso" in the plan follows the current question's node.
- Prompt: no "hai ragione su…" reflex.
- "$5 e $10" is not math (currency rule in renderMd).
- Topic over 500 characters: visible message.
- Formulas in options read correctly by screen readers (KaTeX MathML kept, aria), focus to the new question after sending, small buttons ≥ 44 px.

### Task 4: Note vive (fase 3)
- Damaged note file → error page with "Rigenera" instead of blank.
- More than 6 recap lines / 30 sections → trimmed, not rejected.
- "Mostra i punti" circles clipped to the figure, label uses the real parameter name.
- Raw LaTeX in fill choices rendered.
- A tab whose blocks were all invalid shows "contenuto non disponibile".
- Small buttons (tabs, proof chain) ≥ 44 px.

### Task 5: Ripasso and grafo (fase 4)
- Variants generated in the background right after an extraction.
- Estimate accepts "1.000,5" and "1000,5".
- LaTeX rendered in order steps and match choices (custom select).
- Due badge and graph memory refresh every 10 minutes and on window focus.
- Subject labels in the overview never overlap.
- A renamed note moves its concepts (same content hash or same title in the vault diff).

### Task 6: Notebook (fase 5)
- Delete a notebook (confirm), with its files and queued jobs.
- First Whisper run: "Scarico il modello (solo la prima volta)…".
- Two queues: documents never wait behind a recording.
- Vault-note sources: "Aggiorna" re-reads the note.
- Scan detection ignores repeated running headers.
- "Crea" failure shown; chip of a removed source shows the stored excerpt; YouTube links without https / music.youtube accepted; CRLF frontmatter stripped; progress events do not reload the chat; one pending question per notebook across views; Whisper/yt-dlp killed on quit.

### Task 7: Pratica (fase 6)
- Free topic field multi-line.
- Photo dialog: Esc, focus, same file twice.
- Photos deleted with the session (and older than 30 days).
- Exam grading writes memory once even after a crash (idempotent per session+problem).
- Photo transcription always uses Claude (read-only lockdown).
- Exam autosave appends only changed answers (no full re-read per save).
