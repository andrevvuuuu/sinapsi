import { useState } from 'react'

/** Which answer boxes are being dictated into right now: while any is, the exam is not delivered. */
export function useDictating(): { any: boolean; report: (id: string, on: boolean) => void } {
  const [ids, setIds] = useState<string[]>([])
  const report = (id: string, on: boolean): void =>
    setIds((p) => (on ? (p.includes(id) ? p : [...p, id]) : p.filter((x) => x !== id)))
  return { any: ids.length > 0, report }
}
