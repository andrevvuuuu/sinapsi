# Sinapsi

App per Mac per studiare in modo attivo: sessioni guidate, note vive, grafo della conoscenza e ripasso a intervalli. Il progetto completo è in `docs/design.md`.

## Aprire l'app

1. Apri `dist/mac-arm64/Sinapsi.app`, oppure installa `dist/Sinapsi-0.1.0.dmg` trascinando Sinapsi in Applicazioni.
2. La prima volta macOS la blocca perché non è firmata: **clic destro sull'app → Apri → Apri**. Dalla volta dopo si apre normalmente.

## Collegare l'AI (senza chiavi API)

Sinapsi usa i tuoi abbonamenti tramite due comandi già installati:

- **Gemini** tramite Antigravity: comando `agy`
- **Claude** tramite Claude Code: comando `claude`

Se in alto nell'app compare "serve l'accesso", apri il Terminale, scrivi `agy` (o `claude`), completa l'accesso nel browser e riapri l'app.

## Obsidian

Sinapsi **legge** il vault `~/Obsidian Vault` e **non lo modifica mai**. Per cambiare cartella: ingranaggio in basso a sinistra → Cambia cartella.

## Per lo sviluppo

```bash
npm install
npm run dev          # app in modalità sviluppo
npm test             # test unitari
npm run build && npm run test:e2e   # test end-to-end sull'app
LIVE_AI=1 npx vitest run --config vitest.live.config.ts   # prova vera di agy e claude (consuma quota)
npm run dist         # crea Sinapsi.app e il .dmg
```
