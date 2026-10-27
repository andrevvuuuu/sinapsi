import { createContext } from 'react'

export type Layers = { sessione: boolean; quiz: boolean; fonti: boolean }
export type Mode = 'leggi' | 'prova'

/** The note's switchable layers (Sessione, Quiz, Fonti); all on by default. */
export const NotaContext = createContext<{ layers: Layers }>({ layers: { sessione: true, quiz: true, fonti: true } })
