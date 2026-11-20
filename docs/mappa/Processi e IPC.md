# Processi e IPC

← [[Inizio]]

## Flusso
1. Il renderer chiama `window.sinapsi.<area>.<metodo>()` (contratto `SinapsiApi` in `src/shared/api.ts`).
2. `src/preload/index.ts` lo traduce in `ipcRenderer.invoke(CH.xxx, payload)`; i nomi dei canali sono nella costante `CH` (`src/shared/api.ts`), forma `area:azione`.
3. Nel main, `registerIpc()` in `src/main/ipc.ts` crea i servizi (bridge, runner, generatori, store) e registra gli `ipcMain.handle`.
4. La validazione dei payload sta nelle funzioni pure di `src/main/ipc-handlers.ts` (`makeHandlers`, `makeReviewHandlers`, …), testabili senza Electron.
5. Le operazioni lunghe rispondono subito; il risultato arriva come evento (`session:updated`, `notes:updated`, `practice:updated`, `graph:changed`, `vault:changed`) inviato con `broadcast()` in `ipc.ts`.

## Aree dei canali
settings, vault, ai, app, session, notes, graph, review, voice, memory, notebook, practice, lessons, tutor, exams, plan, suggest, ui. Tabella metodi: [ARCHITECTURE §6](../ARCHITECTURE.md).

## Aggiungere un canale
`CH` + tipo in `SinapsiApi` (`src/shared/api.ts`) → metodo in `src/preload/index.ts` → handler validato in `ipc-handlers.ts` → `ipcMain.handle` in `ipc.ts`.

## Variabili d'ambiente per test
`SINAPSI_DATA` (cartella dati isolata), `SINAPSI_VAULT` (vault di prova), `SINAPSI_FAKE_TEACHER`, `SINAPSI_FAKE_EXTRACT` e simili sostituiscono i motori AI con finti (`fake-*.ts`).

Collegate: [[AI e motori]], [[Interfaccia]].
