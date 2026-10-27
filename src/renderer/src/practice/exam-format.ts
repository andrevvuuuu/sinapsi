import type { PracticeState } from '../../../main/practice/events'

export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${String(m).padStart(2, '0')}:${ss}`
}
export const filled = (a: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(a).filter(([, v]) => v.trim()))
export const lastError = (s: PracticeState): string | undefined => {
  const e = [...s.items].reverse().find((i) => i.kind === 'error')
  return e?.kind === 'error' ? e.message : undefined
}
export const fmtPoints = (n: number): string => String(n).replace('.', ',')

const TEX: Record<string, string> = { le: '≤', leq: '≤', ge: '≥', geq: '≥', cdot: '·', to: '→', infty: '∞', in: '∈', ne: '≠', neq: '≠', pm: '±', times: '×', lim: 'lim' }
/** A plain one-line preview of a statement: LaTeX commands become symbols or words, markup goes. */
export const snippet = (md: string): string => {
  const t = md
    .replace(/\\([a-zA-Z]+)/g, (_, c: string) => TEX[c] ?? (/^(left|right|,|;|quad)$/.test(c) ? '' : c))
    .replace(/[${}]/g, '')
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > 48 ? t.slice(0, 47) + '…' : t
}
