# Security Policy

## Supported Versions

Only the latest version on the `main` branch is supported.

## Reporting a Vulnerability

Please do not open a public issue for security problems. Report them privately through GitHub's **private vulnerability reporting** (the "Report a vulnerability" button in the repository's Security tab).

Include what you found, how to reproduce it and what an attacker could do with it. You will get a reply as soon as possible.

## Scope

Sinapsi runs locally on macOS as an Electron desktop application. The areas most relevant to security are:

- **The Obsidian Vault**: The app must only ever read the vault, never write to it. The vault read-only invariant is strictly enforced.
- **OpenRouter API & Key Storage**: All AI functionality is powered by the OpenRouter HTTP API (`https://openrouter.ai/api/v1`).
  - The API key is stored securely in the main process using Electron's `safeStorage` (macOS Keychain).
  - The key is **never** sent or exposed to the renderer process (the renderer only receives a boolean `{ hasKey: boolean }`).
  - The key is never logged, never included in cache keys, and never packaged in production builds.
- **Data Privacy & AI Providers**: Note content, prompts, and study transcripts are sent over HTTPS to OpenRouter and downstream model providers (e.g. Anthropic, Google). No personal data or keys are retained or transmitted outside this flow.
- **The Renderer Process**: The renderer process is strictly isolated (`contextIsolation: true`, `sandbox: true`, Node.js integration disabled) and communicates with the main process exclusively via typed IPC channels.
- **Content Rendering**: Rich note content and AI responses (Markdown, KaTeX, Mermaid, SVG) are validated and sanitized before display.
