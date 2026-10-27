import { useEffect, useRef, useState } from 'react'

const clean = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

/**
 * "Foto del foglio": the iPhone (Continuity Camera) or the Mac camera, or an image file.
 * Claude reads the sheet; Andrea checks and corrects the text before it is used.
 */
function PhotoDialog({ sessionId, onText, onClose }: { sessionId: string; onText: (text: string) => void; onClose: () => void }): React.JSX.Element {
  const api = window.sinapsi.practice
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const [cams, setCams] = useState<MediaDeviceInfo[]>([])
  const [cam, setCam] = useState<string>('')
  const [camError, setCamError] = useState<string | null>(null)
  const [state, setState] = useState<{ k: 'idle' } | { k: 'reading' } | { k: 'read'; text: string } | { k: 'error'; message: string }>({ k: 'idle' })

  useEffect(() => {
    const md = navigator.mediaDevices
    if (!md?.getUserMedia) return void Promise.resolve().then(() => setCamError('Fotocamera non disponibile: scegli un’immagine.'))
    let live = true
    void (async () => {
      if (!(await api.camera().catch(() => false))) return live && setCamError('Sinapsi non ha il permesso di usare la fotocamera (Impostazioni di Sistema → Privacy → Fotocamera).')
      try {
        // Labels appear only after a first permission grant.
        const first = await md.getUserMedia({ video: true })
        first.getTracks().forEach((t) => t.stop())
        const list = (await md.enumerateDevices()).filter((d) => d.kind === 'videoinput')
        if (!live) return
        setCams(list)
        setCam((list.find((d) => /iphone/i.test(d.label)) ?? list[0])?.deviceId ?? '')
      } catch {
        if (live) setCamError('Fotocamera non disponibile: scegli un’immagine.')
      }
    })()
    return () => {
      live = false
    }
  }, [api])

  useEffect(() => {
    if (!cam || !navigator.mediaDevices) return
    let live = true
    void navigator.mediaDevices
      .getUserMedia({ video: { deviceId: { exact: cam }, width: { ideal: 1920 } } })
      .then((s) => {
        if (!live) return s.getTracks().forEach((t) => t.stop())
        stream.current = s
        if (video.current) video.current.srcObject = s
      })
      .catch(() => live && setCamError('Non riesco ad aprire questa fotocamera.'))
    return () => {
      live = false
      stream.current?.getTracks().forEach((t) => t.stop())
      stream.current = null
    }
  }, [cam])

  const read = async (bytes: Uint8Array): Promise<void> => {
    setState({ k: 'reading' })
    try {
      setState({ k: 'read', text: await api.photo(sessionId, bytes) })
    } catch (e) {
      setState({ k: 'error', message: clean(e) })
    }
  }
  const shoot = (): void => {
    const v = video.current
    if (!v || !v.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    c.getContext('2d')?.drawImage(v, 0, 0)
    c.toBlob((b) => b && void b.arrayBuffer().then((buf) => read(new Uint8Array(buf))), 'image/jpeg', 0.9)
  }

  return (
    <div className="pr-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pr-photo" role="dialog" aria-modal="true" aria-label="Foto del foglio">
        <div className="mt-dh">
          <h2>Foto del foglio</h2>
          <span className="sp" />
          <button type="button" className="mt-x" aria-label="Chiudi" onClick={onClose}>
            ×
          </button>
        </div>
        {state.k === 'read' ? (
          <div className="pr-photo-body">
            <label className="lab" htmlFor="pr-read">
              Letto dal foglio — controlla e correggi
            </label>
            <textarea id="pr-read" className="pr-read" value={state.text} onChange={(e) => setState({ k: 'read', text: e.target.value })} />
            <div className="row">
              <button type="button" className="ghost" onClick={() => setState({ k: 'idle' })}>
                Rifai la foto
              </button>
              <span className="sp" />
              <button
                type="button"
                className="pri"
                disabled={!state.text.trim()}
                onClick={() => {
                  onText(state.text.trim())
                  onClose()
                }}
              >
                Usa questo testo
              </button>
            </div>
          </div>
        ) : (
          <div className="pr-photo-body">
            {camError ? (
              <p className="mt-hint">{camError}</p>
            ) : (
              <>
                {cams.length > 1 && (
                  <select aria-label="Fotocamera" value={cam} onChange={(e) => setCam(e.target.value)}>
                    {cams.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || 'Fotocamera'}
                      </option>
                    ))}
                  </select>
                )}
                <video ref={video} className="pr-video" autoPlay playsInline muted />
                <p className="mt-hint">Con l’iPhone vicino e lo stesso Apple ID, compare tra le fotocamere (Continuity Camera).</p>
              </>
            )}
            {state.k === 'reading' && (
              <p className="pr-pending" role="status">
                Leggo il foglio…
              </p>
            )}
            {state.k === 'error' && (
              <p className="pr-alert" role="alert">
                {state.message}
              </p>
            )}
            <div className="row">
              <label className="ghost pr-file">
                Scegli un’immagine…
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/heic"
                  aria-label="Scegli un’immagine…"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void f.arrayBuffer().then((b) => read(new Uint8Array(b)))
                  }}
                />
              </label>
              <span className="sp" />
              {!camError && (
                <button type="button" className="pri" disabled={state.k === 'reading'} onClick={shoot}>
                  Scatta
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function PhotoButton({ sessionId, onText, disabled }: { sessionId: string; onText: (text: string) => void; disabled?: boolean }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="ghost" disabled={disabled} onClick={() => setOpen(true)}>
        Foto del foglio
      </button>
      {open && <PhotoDialog sessionId={sessionId} onText={onText} onClose={() => setOpen(false)} />}
    </>
  )
}
