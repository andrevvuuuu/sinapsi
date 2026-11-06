import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useGlassAppearance, useGlassOn } from './glass-theme'
import {
  GlassContent,
  GlassScene,
  GlassScrollEdges,
  GlassSlider,
  GlassSurface,
  GlassTabsIndicator,
  GlassTabsList,
  GlassTabsRoot,
  GlassTabsTrigger,
  type GlassContentProps,
  type GlassScrollEdgesProps,
  type GlassSceneProps,
  type GlassSliderProps,
  type GlassSurfaceProps
} from '@glass-sdk/liquid-glass'
import { Tabs } from '@base-ui/react/tabs'
import '@glass-sdk/liquid-glass/styles.css'

/**
 * Liquid Glass comes from @glass-sdk/liquid-glass: a GlassScene per view, whose GlassContent is the live
 * content the glass refracts (the conversation, the graph, the nota…), and GlassSurface / GlassTabs /
 * GlassSlider above it. This module holds what the app adds around the library: the scene with the app's
 * material, appearance and fallback, «Riduci trasparenza», and the segmented control.
 */

function setGlass(reduced: boolean): void {
  document.documentElement.dataset.glass = reduced ? 'solid' : 'on'
}

/**
 * «Riduci trasparenza» of macOS, mounted once above every view: `data-glass` on <html> is 'on' once macOS
 * says transparency is allowed, 'solid' while it is reduced (the library only follows the CSS media query,
 * which Electron does not tie to the macOS setting, for its blur; tokens.css makes every surface solid).
 */
export function GlassMaterial(): null {
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
  return null
}

const InScene = createContext(false)

/**
 * The app's GlassScene: Regular material, the theme's appearance. If the material cannot be prepared (no
 * WebGPU adapter, a GPU error) onDiagnostic logs it once and the scene is marked data-glass-failed, which
 * tokens.css turns into solid surfaces: the content stays readable. The same while the scene stays without its
 * material (data-glass-ready not "true") for more than STALL_MS, should the library fail without saying so; that
 * one ends when the material arrives.
 */
const STALL_MS = 4000
export function ViewScene({
  children,
  ...props
}: Omit<GlassSceneProps, 'appearance' | 'onDiagnostic' | 'ref'>): React.JSX.Element {
  const appearance = useGlassAppearance()
  const [failed, setFailed] = useState(false)
  const [stalled, setStalled] = useState(false)
  const [root, setRoot] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (!root || failed || typeof MutationObserver === 'undefined') return
    let timer: ReturnType<typeof setTimeout> | undefined
    const check = (): void => {
      if (root.dataset.glassReady === 'true') {
        clearTimeout(timer)
        timer = undefined
        setStalled(false)
      } else if (timer === undefined)
        timer = setTimeout(() => {
          console.warn('[glass] il materiale non arriva, superfici piene finché non è pronto')
          setStalled(true)
        }, STALL_MS)
    }
    const mo = new MutationObserver(check)
    mo.observe(root, { attributes: true, attributeFilter: ['data-glass-ready'] })
    check()
    return () => {
      mo.disconnect()
      clearTimeout(timer)
    }
  }, [root, failed])
  return (
    <GlassScene
      material="regular"
      appearance={appearance}
      {...props}
      ref={setRoot}
      {...{ 'data-glass-failed': failed || stalled ? '' : undefined }}
      onDiagnostic={(d) => {
        if (!d.error || failed) return
        console.warn(`[glass] il materiale non è disponibile, superfici piene: ${d.error.message}`)
        setFailed(true)
      }}
    >
      <InScene.Provider value>{children}</InScene.Provider>
    </GlassScene>
  )
}

/**
 * For a component that can also be mounted alone (the unit tests render it without its view): inside a
 * view's scene it adds nothing, alone it gets a scene of its own that takes no box.
 */
export function SceneBoundary({ children }: { children: ReactNode }): React.JSX.Element {
  if (useContext(InScene)) return <>{children}</>
  return <ViewScene style={{ display: 'contents' }}>{children}</ViewScene>
}

/**
 * A flat ground as a scene's content, for glass over a uniform surface (a dialog's solid core, a panel):
 * absolutely placed under the scene's own content (tokens.css .glass-ground), it paints the background
 * the glass refracts.
 */
export function GlassGround({ className = '', ...props }: GlassContentProps): React.JSX.Element {
  return <GlassContent aria-hidden="true" {...props} className={`glass-ground ${className}`} />
}

export type SegOption<T extends string> = {
  value: T
  label: ReactNode
  ref?: React.Ref<HTMLButtonElement>
}

/**
 * A segmented control: the library's tabs, a moving glass selection over a glass track (GlassTabs). On a
 * surface that is already glass or a solid core inside glass (`track="plain"`), the track is not glass and the
 * selection is the library's tab indicator drawn as a full lens (no glass of its own, so never glass in glass and no
 * scene needed): Base UI's moving indicator with the library's placement, filled and ringed in the theme's lens
 * colours. Either selection carries a --seg-edge ring, 3:1 on its track. Focus never selects: the arrow keys move
 * the focus, Enter or Space (or a click) choose, so a picker that takes the focus (a dialog opening on it, a focus
 * trap walking it) never changes a setting by itself.
 */
export function Seg<T extends string>({
  label,
  value,
  options,
  onChange,
  className = '',
  track = 'glass',
  ground
}: {
  label: string
  value: T | null
  options: readonly SegOption<T>[]
  onChange: (v: T) => void
  className?: string
  track?: 'glass' | 'plain'
  /** Over a flat surface that is not a scene's content (a panel, a card inside scrolling content): a small scene of its own, whose content is a ground of that colour. */
  ground?: 'surface' | 'panel'
}): React.JSX.Element {
  const appearance = useGlassAppearance()
  const triggers = options.map((o) => (
    <GlassTabsTrigger key={o.value} value={o.value} ref={o.ref}>
      {o.label}
    </GlassTabsTrigger>
  ))
  const root = (list: ReactNode): React.JSX.Element => (
    <GlassTabsRoot
      className="seg-root"
      value={value ?? null}
      onValueChange={(v) => onChange(v as T)}
    >
      {list}
    </GlassTabsRoot>
  )
  if (track === 'plain')
    return root(
      <Tabs.List
        activateOnFocus={false}
        aria-label={label}
        className={`lg-tabs-list seg-track seg-plain ${className}`}
      >
        <Tabs.Indicator className="lg-tab-indicator seg-lens" />
        {triggers}
      </Tabs.List>
    )
  // In the light appearance the clear selection over the light track is tinted white, as the old white pill was.
  const tabs = root(
    <GlassTabsList
      aria-label={label}
      activateOnFocus={false}
      className={`seg-track ${className}`}
    >
      <GlassTabsIndicator tint={appearance === 'light' ? '#ffffff' : undefined} />
      {triggers}
    </GlassTabsList>
  )
  if (ground)
    return (
      <ViewScene className="seg-scene">
        <GlassGround className={ground === 'panel' ? 'panel-ground' : ''} />
        {tabs}
      </ViewScene>
    )
  return <SceneBoundary>{tabs}</SceneBoundary>
}

/**
 * A modal's overlay as a scene: the dimming scrim (blurring the app behind it) is the content the dialog's glass
 * shell refracts. A click on the scrim, outside the dialog, closes it.
 */
export function GlassOverlay({
  className,
  onClose,
  children
}: {
  className: string
  onClose: () => void
  children: ReactNode
}): React.JSX.Element {
  return (
    <ViewScene className={className} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <GlassGround className="overlay-scrim" />
      {/* The dialog's shadow: its glass shell is clipped to its shape, so the shadow is cast around it from here. */}
      <div className="dlg-drop">{children}</div>
    </ViewScene>
  )
}

/**
 * A dock or composer shell: a glass ring (GlassSurface) around the solid core (.inner) that holds the text. `shell`
 * stays its class, for the views' layout rules.
 */
export function GlassShell({
  radius = 24,
  className = '',
  ...props
}: GlassSurfaceProps): React.JSX.Element {
  return (
    <SceneBoundary>
      <GlassSurface radius={radius} className={`shell ${className}`} {...props} />
    </SceneBoundary>
  )
}

/**
 * A range control: the library's GlassSlider (white face, a clear glass lens while pressed). Its lens must refract
 * the flat surface the slider sits on, not the view's content behind the card, so it gets a small scene whose
 * content is a ground of that colour (`ground`: the card's --surface or the page's --bg).
 */
export function GlassRange({
  ground = 'surface',
  sceneClassName = '',
  ...props
}: GlassSliderProps & { ground?: 'surface' | 'bg'; sceneClassName?: string }): React.JSX.Element {
  return (
    <ViewScene className={`range-scene ${sceneClassName}`}>
      <GlassGround className={ground === 'bg' ? 'bg-ground' : ''} />
      <GlassSlider {...props} />
    </ViewScene>
  )
}

/** The library's scroll edges (GlassScrollEdges), off while «Riduci trasparenza» is on, as the library does for the CSS media query. */
export function ScrollEdges(props: GlassScrollEdgesProps): React.JSX.Element {
  const on = useGlassOn()
  return <GlassScrollEdges {...props} disabled={!on || props.disabled} />
}
