import { createContext } from 'react'
import type { Fade } from './fading'

export type Layers = { sessione: boolean; quiz: boolean; fonti: boolean }
export type Mode = 'leggi' | 'prova'

/** The note's switchable layers (Sessione, Quiz, Fonti); all on by default. */
export const NotaContext = createContext<{ layers: Layers }>({ layers: { sessione: true, quiz: true, fonti: true } })

/** How far the section's proofs fade, from the memory of its concepts (fading.ts); null before it loads. */
export const FadeContext = createContext<Fade | null>(null)
