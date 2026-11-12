# Contributing to Sinapsi

Sinapsi is a personal study app, developed mainly for its author's own use. Issues and pull requests are welcome, but there is no guarantee they will be reviewed or merged quickly. For anything larger than a small fix, please open an issue first to discuss it.

The app's interface is in Italian; code, comments, commit messages and pull requests are in English or Italian.

## Setup

Requirements: macOS 13 or later (Apple Silicon recommended) and Node.js 20 or later.

```bash
npm install
npm run dev
```

You do not need the AI engines to work on most of the code. Set the `SINAPSI_FAKE_*` variables listed in the [README](README.md#environment-variables) to `1` to use deterministic fake responses, and `SINAPSI_DATA` to a temporary folder so you never touch real data.

## Before opening a pull request

```bash
npm run typecheck
npm run lint
npm test
```

- **Tests.** A few unit tests already fail on `main`, mostly in modules being phased out. Your change must not add new failures: compare the list of failing tests with the one on `main`.
- **Lint.** The lint baseline on `main` is not zero either. Do not add new errors.
- **UI changes.** Check them in the running Electron app, in both themes (Lavagna and Trattato), and keep text contrast at WCAG AA.

## Code rules

1. **Never write to the vault.** Everything Sinapsi produces goes into its data folder. The same holds for the lesson tutor's files in `.antigravity/tutor/`.
2. **Ledgers are append-only.** A change is a new event appended to a `.jsonl` file, never an edited line. State is rebuilt by replaying the ledgers.
3. **Validate at the boundaries.** Every payload between main, renderer and AI responses goes through a Zod schema.
4. **Keep the renderer isolated.** It never imports Node modules. System operations go through the typed channels in `src/shared/api.ts`.
5. **Do not reformat existing CSS.** Some tests read the text of CSS files (`home.css`, `graph.css`) with regular expressions, so keep their compact style and do not run Prettier on them.
6. **Design tokens.** Use the variables in `src/renderer/src/styles/tokens.css` rather than hard-coded colours, spacing or radii.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`, with an optional scope (for example `fix(review): …`).

## Branches

Work on a descriptive branch (`feat/…`, `fix/…`) and open the pull request against `main`.
