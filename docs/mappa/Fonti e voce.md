# Fonti e voce

← [[Inizio]] · approfondimento: [ARCHITECTURE §4.7 e §4.12](../ARCHITECTURE.md)

## Notebook delle fonti
- `notebookStore()` in `src/main/notebook/store.ts`: notebook per materia e fonti (`notebooks.jsonl`, `sources.jsonl`, testi estratti).
- `createIngestor()` in `ingest.ts`: trasforma file, link YouTube e note in testo, un lavoro alla volta. Lettori in `readers.ts` (PDF con pdfjs, slide, documenti di testo, sottotitoli); audio e video con `yt-dlp` e `mlx_whisper` in locale (`media.ts`).
- Selezione degli estratti: `chunk()` / `selectExcerpts()` in `retrieve.ts` (per parole chiave).
- Fonti per una nota viva: `notebookSourcesFor()` in `for-notes.ts`, al massimo 15.000 caratteri di estratti della materia della nota. → [[Note vive]]

## Dettatura
`createDictation()` in `src/main/voice/dictation.ts`: avvia `resources/whisper_server.py` (Whisper in locale con MLX) e parla con lui a righe JSON. Componenti: `src/renderer/src/components/MicButton.tsx`, `dictation.ts`.

Collegate: [[Note vive]], [[Processi e IPC]].
