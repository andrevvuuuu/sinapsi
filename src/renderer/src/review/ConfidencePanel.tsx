import { useEffect, useState } from 'react'
import { confidenceLine } from '../../../shared/confidence'
import type { ConfidenceCalibration } from '../../../shared/confidence'

export function ConfidencePanel({ onClinic }: { onClinic: (n: number) => void }): React.JSX.Element {
  const [data, setData] = useState<(Omit<ConfidenceCalibration, 'confidentErrors'> & { confidentErrors: { conceptId: string; name: string; at: number; confidence: number }[] }) | null>(null)
  useEffect(() => { const fn = window.sinapsi.review.calibration; if (fn) void fn().then(setData).catch(() => setData({ overall: { n: 0, meanConfidence: 0, accuracy: 0, gap: 0 }, groups: [], confidentErrors: [] })); else setData({ overall: { n: 0, meanConfidence: 0, accuracy: 0, gap: 0 }, groups: [], confidentErrors: [] }) }, [])
  const [active, setActive] = useState(0)
  useEffect(() => { const fn = window.sinapsi.review.memory; if (fn) void fn().then((m) => setActive(Object.values(m).filter((x) => x.misconception).length)).catch(() => setActive(0)) }, [])
  if (!data) return <section className="rv-confidence"><p>Carico la calibrazione…</p></section>
  return <section className="rv-confidence" aria-label="Calibrazione della confidenza">
    <h2>Quanto ti fidi delle tue risposte?</h2><p>{confidenceLine(data.overall)}</p>
    {data.overall.n > 0 && <div className="rv-confidence-bars" aria-label={`Confidenza ${Math.round(data.overall.meanConfidence)}%, corrette ${Math.round(data.overall.accuracy)}%`}><span style={{ width: `${data.overall.meanConfidence}%` }} /><i style={{ width: `${data.overall.accuracy}%` }} /></div>}
    {data.groups.map((g) => <p key={g.key}><b>{g.key}</b> · {confidenceLine(g)}</p>)}
    {data.confidentErrors.length > 0 && <p>Errori dati con sicurezza: {data.confidentErrors.slice(0, 5).map((e) => e.name).join(', ')}</p>}
    {data.overall.n === 0 && <p>Indica la confidenza dopo le risposte per vedere come si accorda con l’esito.</p>}
    <button type="button" className="ghost" disabled={!active} onClick={() => onClinic(active)}>Ripassa gli errori sicuri ({active})</button>
  </section>
}
