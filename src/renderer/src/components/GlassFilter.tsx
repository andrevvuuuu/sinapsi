import { useEffect } from 'react'

function setGlass(reduced: boolean): void {
  document.documentElement.dataset.glass = reduced ? 'solid' : 'on'
}

/**
 * The Liquid Glass material at runtime, mounted once above every view: the SVG filter `.glass`
 * refracts its edges with (tokens.css), and `data-glass` on <html>: 'on' once macOS says
 * transparency is allowed, 'solid' while «Riduci trasparenza» is on.
 */
export function GlassFilter(): React.JSX.Element {
  useEffect(() => {
    const ui = window.sinapsi.ui
    let changed = false
    const off = ui.onReducedTransparency((reduced) => {
      changed = true
      setGlass(reduced)
    })
    // A change that arrives before the first answer is newer than it. Until an answer comes the
    // attribute stays unset and tokens.css keeps the glass solid; if the answer fails, solid it stays.
    ui.reducedTransparency()
      .then((reduced) => {
        if (!changed) setGlass(reduced)
      })
      .catch(() => {
        if (!changed) setGlass(true)
      })
    return () => {
      changed = true
      off()
    }
  }, [])
  // Low-frequency noise shifts the already blurred backdrop by a few pixels: the soft middle barely
  // moves, the bend shows where the glass edge meets contrasting content.
  return (
    <svg aria-hidden="true" focusable="false" width="0" height="0" style={{ position: 'absolute' }}>
      <filter id="glass-refract" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="1" seed="7" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="10" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  )
}
