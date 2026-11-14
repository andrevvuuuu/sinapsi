/**
 * Live smoke test for OpenRouter migration.
 * Verifies key resolution, structured JSON, two-turn conversation, and image input.
 * Redacts all secrets and headers.
 */

import { resolveApiKey } from '../src/main/ai/key-storage'
import { chatCompletion, verifyOpenRouterKey, type OpenRouterMessage } from '../src/main/ai/openrouter'

const MODEL = 'anthropic/claude-haiku-5.5'

async function run(): Promise<void> {
  console.log('[smoke] 1. Risoluzione chiave API...')
  const key = await resolveApiKey()
  if (!key) {
    console.error('[smoke] ERRORE: Nessuna chiave API trovata (stored, env, secret-api.txt).')
    process.exit(1)
  }
  console.log('[smoke] Chiave API trovata (lunghezza:', key.length, 'caratteri, REDACTED).')

  console.log('[smoke] 2. Verifica chiave via GET /api/v1/auth/key...')
  const auth = await verifyOpenRouterKey(key)
  if (!auth.ok) {
    console.error('[smoke] ERRORE: Chiave API non valida o crediti esauriti:', auth.error)
    process.exit(1)
  }
  console.log('[smoke] Verifica riuscita! Etichetta:', auth.label ? '[ok]' : '—', 'Limite:', auth.limit ?? 'illimitato')

  // Call 1: Structured JSON
  console.log('[smoke] 3. Test chiamata Structured JSON...')
  const jsonSchema = {
    type: 'object',
    properties: {
      saluto: { type: 'string' },
      numero: { type: 'integer' }
    },
    required: ['saluto', 'numero'],
    additionalProperties: false
  }

  const resJson = await chatCompletion({
    apiKey: key,
    model: MODEL,
    messages: [
      {
        role: 'user',
        content: 'Rispondi SOLO con un JSON valido con i campi "saluto" (stringa) e "numero" (numero intero 42).'
      }
    ],
    jsonSchema,
    timeoutMs: 30_000
  })

  console.log('[smoke] Risposta JSON ricevuta (token in/out:', resJson.inputTokens, '/', resJson.outputTokens, '):')
  console.log('   ', resJson.text.trim())

  // Call 2 & 3: Two-turn conversation
  console.log('[smoke] 4. Test conversazione a due turni...')
  const messages: OpenRouterMessage[] = [
    { role: 'user', content: 'Il mio colore preferito è il cobalto. Rispondi confermando solo in una parola.' }
  ]
  const turn1 = await chatCompletion({
    apiKey: key,
    model: MODEL,
    messages,
    timeoutMs: 30_000
  })
  console.log('[smoke] Turno 1 risposta:', turn1.text.trim())

  messages.push({ role: 'assistant', content: turn1.text })
  messages.push({ role: 'user', content: 'Qual è il mio colore preferito?' })

  const turn2 = await chatCompletion({
    apiKey: key,
    model: MODEL,
    messages,
    timeoutMs: 30_000
  })
  console.log('[smoke] Turno 2 risposta:', turn2.text.trim())

  // Call 4: Vision / Image call
  console.log('[smoke] 5. Test chiamata Vision (immagine base64)...')
  const tinyPngBase64 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

  const resImage = await chatCompletion({
    apiKey: key,
    model: MODEL,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Cosa vedi in questa immagine? Rispondi in una breve frase.' },
          { type: 'image_url', image_url: { url: tinyPngBase64 } }
        ]
      }
    ],
    timeoutMs: 30_000
  })
  console.log('[smoke] Risposta Vision ricevuta:', resImage.text.trim())

  console.log('\n[smoke] Tutti i test di fumo completati con successo!')
}

run().catch((err) => {
  console.error('[smoke] Errore imprevisto:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
