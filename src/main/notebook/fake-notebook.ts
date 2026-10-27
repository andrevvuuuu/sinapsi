import type { Bridge } from '../ai/bridge'

/** e2e only (SINAPSI_FAKE_NOTEBOOK=1): cites the first excerpt and says what the sources leave out. */
export function fakeNotebookBridge(): Pick<Bridge, 'ask'> {
  return {
    ask: (async (req: { schema: { parse(x: unknown): unknown } }) => {
      await new Promise((r) => setTimeout(r, 100))
      const raw = { claims: [{ text: 'Secondo le tue fonti, la risposta è nel primo estratto.', sources: [1] }], missing: 'Le fonti non dicono chi lo ha dimostrato.' }
      return { data: req.schema.parse(raw), fromCache: false, engine: 'agy' as const }
    }) as Bridge['ask']
  }
}
