/**
 * A number as Andrea types it: "1.000,5", "1000,5", "3,05", "3.05", "1 000". A dot followed by groups
 * of three digits is a thousands separator; with both, the last one is the decimal mark.
 */
export function parseItalianNumber(raw: string): number {
  let s = raw.trim().replace(/[\s ']/g, '')
  if (!/^[-+]?[\d.,]+$/.test(s)) return NaN
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  else if (s.includes(',')) s = s.replace(',', '.')
  else if (/^[-+]?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}
