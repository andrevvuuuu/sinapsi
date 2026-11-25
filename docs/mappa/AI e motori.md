# AI e motori

← [[Inizio]]

Tutte le chiamate ai modelli passano da `createBridge()` in `src/main/ai/bridge.ts`, che lancia i CLI `claude -p` o `agy -p` (processi figli, `nodeSpawn` in `src/main/ai/engines.ts`).

## Task e motori
I task sono `extract`, `note`, `variants`, `teach`, `grade` (`TASKS` in `src/shared/settings-schema.ts`). Il motore di ogni task viene dalle impostazioni (`DEFAULT_ENGINES`: Gemini «medium» via agy per extract/note/variants, Claude Sonnet per teach/grade). `resolveOtherEngine` (`src/main/ipc-handlers.ts`) dà il motore «altro» per le correzioni indipendenti.

## Due modi di chiamare
- `ask()` — chiamata singola: prompt → JSON validato con zod. Retry: prima nella **stessa conversazione** con un messaggio breve (`--resume` / `--conversation`), poi con il prompt completo se manca l'id. Opzione `fallback` per uno schema più permissivo.
- `converse()` — conversazione con stato (il tutor): `conversationId`, `resume`, `systemPrompt`, streaming del campo parziale (`onPartial`).

## Argomenti del CLI (`buildArgs` in `engines.ts`)
- **Claude è sempre isolato** dall'ambiente utente: `--tools ''`, `--strict-mcp-config`, `--setting-sources ''`, e `--system-prompt` (quello del task o `ONE_SHOT_SYSTEM`). Senza isolamento ogni chiamata caricava plugin, skill e MCP dell'utente (~250k token). Unica eccezione: `readOnly` (la foto del foglio), che ha solo `Read`.
- Con uno schema rappresentabile, `ask()` passa `--json-schema` a Claude (output strutturato).
- agy: flag prima di `-p`, `--print-timeout`, `--disable-slash-commands`.

## Code
Per ogni motore due corsie, `interactive` e `background`, ognuna con un job alla volta: una correzione non aspetta un'estrazione lunga. Lo studio ha la precedenza: un job `background` **non parte** finché sullo stesso motore c'è un job `interactive` in corso o in coda (`pumpLane` in `bridge.ts`); un background già avviato non viene interrotto. Durante una sessione lunga il background può quindi aspettare. Lo stato (`busy`/`idle`/`auth`/`missing`/`error`) usa un contatore di chiamate attive ed è trasmesso al renderer (`ai:status-changed`).

## Altri file
- `json.ts` — `extractJson`: JSON grezzo, in blocchi ```json o dentro testo; ripara i backslash del LaTeX.
- `errors.ts` — `AuthRequiredError`, `AiTimeoutError`, `AiSchemaError`, `EngineMissingError`, `AiAbortError`.
- `rigor.ts` — `GRADING_RIGOR`, testo comune a ogni prompt che corregge.
- Consumi: ogni chiamata scrive una riga in `ai-usage.jsonl` (token, cache, durata, esito). → [[Dati su disco]]

## Regole
- Mai `spawn` di un CLI AI fuori dal bridge.
- Non togliere l'isolamento di Claude nelle chiamate one-shot: costa ~90% di token in più e dà strumenti a un modello che legge testo del vault.
- Il testo delle note va passato con `capNote()` (`src/main/session/prompt.ts`): pulisce il rumore (`stripNoise`) e limita a 60k caratteri.

Collegate: [[Grafo dei concetti]], [[Memoria e ripasso]], [[Sessioni di studio]], [[Note vive]].
