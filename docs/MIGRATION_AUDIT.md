# Sinapsi Migration Audit

This audit document details:
1. Every AI call site in the codebase and its requirements (JSON schema, conversation, vision, timeout).
2. Every personal and author-specific item (names, identities, paths, custom curricula, first-person doctrine).
3. Every non-OpenRouter AI or external tool dependency.
4. Proposed default model slugs per task, verified against the OpenRouter models registry.

---

## 1. AI Call Sites & Requirements

All AI requests currently pass through `src/main/ai/bridge.ts` (`ask` and `converse` methods).

| Call Site | Task | Mode | Timeout | JSON Schema / Validation | Vision | Conversation History | Working Dir / Lockdown |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`src/main/graph/jobs.ts:80`** | `extract` | `ask` (single turn) | 300 s (`EXTRACT_TIMEOUT`) | `ExtractReplySchema` (Zod); no fallback; prompts for JSON extraction | No | No | `deps.workDir` |
| **`src/main/notes/generator.ts:70`** | `note` | `ask` (single turn) | 300 s (`NOTE_TIMEOUT`) | Primary: `NotaWriteSchema`<br>Fallback: `NotaSchema` (math-relaxed) | No | No | `deps.workDir` |
| **`src/main/memory/review.ts:108`** | `variants` | `ask` (single turn) | 180 s (`VARIANTS_TIMEOUT`) | `variantsReplySchema(conceptIds, now, types)` | No | No | `deps.workDir` |
| **`src/main/memory/review.ts:210`** | `grade` | `ask` (single turn) | 60 s (`GRADE_TIMEOUT`) | `GradeSchema` | No | No | `deps.workDir` |
| **`src/main/memory/review.ts:233`** | `grade` | `ask` (single turn) | 60 s (`GRADE_TIMEOUT`) | `explainReplySchema(...)` | No | No (dialogue embedded in prompt) | `deps.workDir` |
| **`src/main/practice/exam.ts:83`** | `teach` | `ask` (single turn) | 180 s (`TIMEOUT`) | `ExamSheetSchema` | No | No | `deps.dir` |
| **`src/main/practice/exam.ts:107`** | `teach` | `ask` (single turn) | 180 s (`TIMEOUT`) | `ExamGradeReplySchema` | No | No | `deps.dir` |
| **`src/main/practice/photo.ts:53`** | `photo` / `grade` | `ask` (single turn) | 120 s | `PhotoSchema` (`{ readable: boolean, text: string }`) | **Yes** (photo of handwritten sheet) | No | `input.dir` (previously read file via Claude CLI `Read` tool; now multimodal base64 image data URL) |
| **`src/main/practice/runner.ts:93`** | `teach` | `converse` (multi-turn) | 180 s | `PracticeTurnSchema` (Zod) + `practiceJsonSchema()` (JSON Schema) | No | **Yes** (`conversationId`, `resume`, `systemPrompt`) | `deps.dir` |
| **`src/main/session/runner.ts:80`** | `teach` | `converse` (multi-turn) | 180 s | `TeacherTurnSchema` (Zod) + `teacherJsonSchema()` (JSON Schema) | No | **Yes** (`conversationId`, `resume`, `systemPrompt`) | `deps.dir` |

---

## 2. Personal & Author-Specific Items

The codebase contains numerous references specific to the author (Andrea Antonelli), personal degree courses, workout interests, and absolute paths:

### 2.1 Author Name & Contact
- **Git author / Committer:** `Andrea Antonelli <andreaantonelli@MAC-908D70.station>`, `Andrea Antonelli <andreaantonelli@MacBook-Air-di-Andrea.local>`
- **Package name / Bundle ID:** `it.andreaantonelli.sinapsi` (in `electron-builder.yml`, `src/main/index.ts`, and design plans)
- **Role enum in Explain dialogues:** `by: 'andrea' | 'claude'` (in `src/main/memory/explain.ts`, `src/main/ipc-handlers.ts`, `src/renderer/src/review/ReviewView.tsx`, `tests/unit/review-view.test.tsx`, `tests/unit/review-explain.test.ts`)
- **Prompts & System Instructions:**
  - `src/main/session/prompt.ts`: `# Chi è Andrea`, `Studia Scienze matematiche per l'intelligenza artificiale... Si interessa di bodybuilding...`, `# Materiale di Andrea`, `# Memoria di Andrea`
  - `src/main/practice/prompt.ts`: `Andrea studia Scienze matematiche per l'intelligenza artificiale... (bodybuilding)...`
  - `src/main/practice/exam.ts`: `...per Andrea (Scienze matematiche per l'IA)...`
  - `src/main/memory/grade-prompt.ts`: `...di Andrea (Scienze matematiche per l'IA)...`
  - `src/main/memory/variants.ts`: `...per Andrea (Scienze matematiche per l'IA)...`
  - `src/main/notes/prompt.ts`: `...per Andrea, studente di Scienze matematiche...`
  - `src/main/graph/extract-prompt.ts`: `...nota personale di Andrea...`
  - `src/main/ai/rigor.ts`: `...Shared by every prompt that judges Andrea's work.`
  - `src/shared/teacher-protocol.ts` & `practice-protocol.ts`: comments and error messages referencing "Andrea".

### 2.2 Personal Courses, Topics, and Vault Paths
- **Specific Curricula & Topics:**
  - "Scienze matematiche per l'IA", "bodybuilding", "fisiologia, nutrizione e farmacologia".
  - Hardcoded list in `src/shared/subjects.ts` (`DEFAULT_UNIVERSITY`): `['Matematica', 'Intelligenza Artificiale', 'Informatica', 'Fisica', 'Biologia e Neuroscienze']`.
- **Paths & Files:**
  - Default `vaultPath`: `${home}/Obsidian Vault` in `src/shared/settings-schema.ts`.
  - Absolute path in test fixture: `/Users/andreaantonelli/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian Vault/Matematica/Teorema di Lagrange del Valor Medio.md` (`tests/unit/review-fixes-4a.test.tsx`).
  - Folder `tests/fixtures/vault/Bodybuilding`.

### 2.3 First-Person Teaching Methodology
- `docs/ricerca/il-mio-metodo.md`: Written in first person ("il mio metodo", personal habits). Needs to be depersonalized into a neutral study methodology.

---

## 3. Non-OpenRouter AI & External Tool Dependencies

The application currently has the following external process and tool dependencies:

1. **`agy` (Antigravity CLI / Gemini models)**:
   - Used in `src/main/ai/engines.ts` to run Gemini.
   - **Action:** Delete entirely. Replaced by OpenRouter API.
2. **`claude` (Claude Code CLI)**:
   - Used in `src/main/ai/engines.ts` and `src/main/practice/photo.ts` (`Read` tool).
   - **Action:** Delete entirely. Replaced by OpenRouter API and base64 vision payloads.
3. **`mlx_whisper` (`src/main/voice/dictation.ts`, `src/main/notebook/media.ts`)**:
   - Local on-device Apple Silicon audio transcription via Python.
   - **Recommendation:** Keep as an optional local capability. If missing or unsupported, gracefully degrade and guide the user without crashing.
4. **`yt-dlp` (`src/main/notebook/media.ts`)**:
   - Local media downloader for video/audio transcription in Notebooks.
   - **Recommendation:** Keep as an optional local capability. Gracefully display a clean notification when missing.
5. **`ffmpeg`**:
   - Auxiliary binary required by `mlx_whisper` and `yt-dlp`.
   - **Recommendation:** Keep as optional external dependency.
6. **`/usr/bin/sips` (`src/main/practice/photo.ts`)**:
   - Standard built-in macOS image converter for HEIC -> JPEG conversion.
   - **Recommendation:** Keep as is (standard on all macOS installations).

---

## 4. Proposed Default Model Slugs per Task

Verified against the OpenRouter Public Models API (`GET https://openrouter.ai/api/v1/models`):

| Task | Category | Current (CLI) | Proposed OpenRouter Model Slug | Verified Parameters & Modalities | Pricing (per 1M tokens) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`extract`** | Flash-class | `agy` (gemini-3.8-flash-medium) | `google/gemini-2.5-flash` (or `anthropic/claude-haiku-5.5` if workspace guardrails restrict Google) | `structured_outputs`, `response_format`, text, image | $0.30 prompt / $2.50 completion ($1.00 / $5.00 for Haiku) |
| **`note`** | Flash-class | `agy` (gemini-3.8-flash-medium) | `google/gemini-2.5-flash` (or `anthropic/claude-haiku-5.5`) | `structured_outputs`, `response_format`, text, image | $0.30 prompt / $2.50 completion |
| **`variants`** | Flash-class | `agy` (gemini-3.8-flash-high) | `google/gemini-2.5-flash` (or `anthropic/claude-haiku-5.5`) | `structured_outputs`, `response_format`, text, image | $0.30 prompt / $2.50 completion |
| **`teach`** | Sonnet-class | `claude` (sonnet) | `anthropic/claude-sonnet-5.5` | `structured_outputs`, `response_format`, text, image | $3.00 prompt / $15.00 completion |
| **`grade`** | Sonnet-class | `claude` (sonnet) | `anthropic/claude-sonnet-5.5` | `structured_outputs`, `response_format`, text, image | $3.00 prompt / $15.00 completion |
| **`photo`** | Vision-capable | `claude` (sonnet via Read tool) | `google/gemini-2.5-flash` (or `anthropic/claude-haiku-5.5`) | `image` input modality, `structured_outputs`, fast OCR | $0.30 prompt / $2.50 completion |

*Note on Workspace Guardrails:* Testing against the account associated with `secret-api.txt` revealed an active workspace guardrail (`53a09a08-ef54-4fc4-9c00-50fa1d0f4d20`) that excludes Google-hosted endpoints while allowing Anthropic (`claude-sonnet-5.5`, `claude-haiku-5.5`), OpenAI (`gpt-6.1-terra`, `gpt-6-luna`), and DeepSeek (`deepseek-v4.1-flash`). For unrestricted accounts, `google/gemini-2.5-flash` is verified and supported. For keys restricted by this guardrail, `anthropic/claude-haiku-5.5` is the verified low-latency flash tier, and `anthropic/claude-sonnet-5.5` is the verified Sonnet tier.
