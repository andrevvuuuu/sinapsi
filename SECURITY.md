# Security policy

## Supported versions

Only the latest version on the `main` branch is supported.

## Reporting a vulnerability

Please do not open a public issue for security problems. Report them privately through GitHub's **[private vulnerability reporting](https://github.com/andrevvuuuu/sinapsi/security/advisories/new)** (the "Report a vulnerability" button in the repository's Security tab).

Include what you found, how to reproduce it and what an attacker could do with it. You will get a reply as soon as possible. This is a personal project, so there is no fixed response time.

## Scope

Sinapsi runs locally on macOS. The areas most relevant to security are:

- **The vault and the lesson tutor's files**, which the app must only ever read, never write.
- **The AI engines**, which run as local command-line tools (`agy`, `claude`) with the user's own accounts. Prompts include note contents.
- **The renderer**, which must stay isolated (`contextIsolation`, `sandbox`, no Node integration) and talk to the main process only through the typed IPC channels.
- **Content rendered from notes and AI responses** (Markdown, KaTeX, Mermaid, SVG figures), which is sanitised before display.
