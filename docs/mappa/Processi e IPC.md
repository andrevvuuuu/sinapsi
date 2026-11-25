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

## Impostazioni
`settings:set` valida con `Patch` in `ipc-handlers.ts`, che riusa i validatori di `src/shared/settings-schema.ts` (`MasteryField`, `LearnerProfileField`, `GraderEngineField`). Un test (`tests/unit/ipc.test.ts`) verifica che ogni campo salvato sia anche modificabile: se aggiungi un campo a `settingsSchema`, aggiungilo a `Patch`. Dopo un salvataggio `App.tsx` (`onSettingsChanged`) ricarica l'indice solo se sono cambiati vault o cartelle escluse.

## Tipi condivisi
I tipi che attraversano l'IPC stanno in `src/shared/` (`session-types.ts`, `practice-types.ts`, `review-types.ts`, `notes-types.ts`, `suggest-types.ts`, `tutor-types.ts`). I moduli del main li ri-esportano per compatibilità. Renderer e shared non importano mai da `src/main` né moduli `node:*`: lo vieta `@typescript-eslint/no-restricted-imports` in `eslint.config.mjs`. Per controllarlo: `npx eslint src/renderer src/shared | grep -c no-restricted-imports` → 0 (il lint globale ha errori preesistenti).

## Aggiungere un canale
`CH` + tipo in `SinapsiApi` (`src/shared/api.ts`) → metodo in `src/preload/index.ts` → handler validato in `ipc-handlers.ts` → `ipcMain.handle` in `ipc.ts`.

## Variabili d'ambiente per test
`SINAPSI_DATA` (cartella dati isolata), `SINAPSI_VAULT` (vault di prova), `SINAPSI_FAKE_TEACHER`, `SINAPSI_FAKE_EXTRACT` e simili sostituiscono i motori AI con finti (`fake-*.ts`).

Collegate: [[AI e motori]], [[Interfaccia]].
