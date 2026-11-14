# Contributing to Sinapsi

Sinapsi is an active recall study application for macOS. Issues and pull requests are welcome. For anything larger than a small fix, please open an issue first to discuss it.

The app's interface is in Italian; code, comments, commit messages and pull requests are in English.

## Setup

Requirements: macOS 13 or later (Apple Silicon recommended) and Node.js 20 or later.

```bash
npm install
npm run dev
```

For AI tasks, configure your OpenRouter API key in **Impostazioni → OpenRouter** or supply `OPENROUTER_API_KEY` in your environment. You do not need real AI calls to work on most of the code: set the `SINAPSI_FAKE_*` variables listed in [README.md](README.md#environment-variables) to `1` to use deterministic fake responses, and `SINAPSI_DATA` to a temporary folder so you never touch real data.

## Before opening a pull request

```bash
npm run typecheck
npm run lint
npm test
```

- **Tests.** All tests must pass before opening a PR.
- **Lint.** Ensure there are no new lint or type errors.
- **UI changes.** Check them in the running Electron app, in both themes (Lavagna and Trattato), and keep text contrast at WCAG AA.

## Code rules

1. **Never write to the vault.** The Obsidian vault is strictly read-only. Everything Sinapsi produces goes into its data folder.
2. **OpenRouter API architecture.**
   - All AI calls use OpenRouter via `fetch` (`https://openrouter.ai/api/v1`).
   - The API key is stored securely in the main process with Electron `safeStorage`. The renderer never sees or stores the key (it only receives `{ hasKey: boolean }`).
   - Never log API keys, request headers, or write keys to cache or logs.
3. **Ledgers are append-only.** A change is a new event appended to a `.jsonl` file, never an edited line. State is rebuilt by replaying the ledgers.
4. **Validate at the boundaries.** Every payload between main, renderer and AI responses goes through a Zod schema.
5. **Keep the renderer isolated.** It never imports Node modules. System operations go through the typed channels in `src/shared/api.ts`.
6. **Do not reformat existing CSS.** Some tests read the text of CSS files (`home.css`, `graph.css`) with regular expressions, so keep their compact style and do not run Prettier on them.
7. **Design tokens.** Use the variables in `src/renderer/src/styles/tokens.css` rather than hard-coded colours, spacing or radii.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`, with an optional scope (for example `fix(review): …`).

## Branches

Work on a descriptive branch (`feat/…`, `fix/…`, `chore/…`) following the repo naming conventions and open the pull request against `main`.
