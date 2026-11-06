import DOMPurify from 'dompurify'

/** Below this scale the labels get too small to read: the diagram scrolls sideways instead. */
export const MIN_SCALE = 0.62
export const FONT = "'Geist', ui-sans-serif, system-ui, sans-serif"

type Rgba = [number, number, number, number]
function parseColor(c: string): Rgba | null {
  const h = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim())
  if (h) {
    const x = h[1].length === 3 ? [...h[1]].map((d) => d + d).join('') : h[1]
    return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16), 1]
  }
  const r = /^rgba?\(([^)]+)\)$/i.exec(c.trim())
  if (!r) return null
  const v = r[1].split(/[\s,/]+/).filter(Boolean).map(Number)
  return v.length >= 3 && v.every(Number.isFinite) ? [v[0], v[1], v[2], v[3] ?? 1] : null
}
const hex = (c: Rgba): string => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
/** A token as an opaque colour: mermaid derives shades from its theme colours and wants plain hex. */
function solid(color: string, over: string): string {
  const a = parseColor(color)
  const b = parseColor(over) ?? [255, 255, 255, 1]
  if (!a) return hex(b)
  return hex([0, 1, 2].map((i) => a[i] * a[3] + b[i] * (1 - a[3])).concat(1) as Rgba)
}

/** The diagram's colours from tokens.css, read from the theme on screen. */
export function mermaidTheme(): Record<string, string | boolean> {
  const cs = getComputedStyle(document.documentElement)
  const v = (n: string, fb: string): string => cs.getPropertyValue(n).trim() || fb
  const dark = document.documentElement.dataset.theme !== 'trattato'
  const surface = solid(v('--surface', dark ? '#1a1b17' : '#fbf8f2'), '#808080')
  const node = solid(v('--faint', 'transparent'), surface)
  const ink = solid(v('--ink', dark ? '#ece9df' : '#221e19'), surface)
  const edge = solid(v('--ctl-edge', dark ? 'rgba(236,233,223,.4)' : 'rgba(36,32,27,.52)'), surface)
  const accent = solid(v('--accent', dark ? '#ef7a42' : '#a83d22'), surface)
  const fontSize = v('--fs-footnote', '13px')
  return {
    darkMode: dark,
    fontFamily: FONT,
    fontSize,
    background: surface,
    primaryColor: node,
    primaryTextColor: ink,
    primaryBorderColor: edge,
    secondaryColor: node,
    secondaryTextColor: ink,
    secondaryBorderColor: edge,
    tertiaryColor: node,
    tertiaryTextColor: ink,
    tertiaryBorderColor: edge,
    mainBkg: node,
    nodeBorder: edge,
    nodeTextColor: ink,
    textColor: ink,
    titleColor: ink,
    lineColor: accent,
    arrowheadColor: accent,
    clusterBkg: node,
    clusterBorder: edge,
    edgeLabelBackground: surface,
    // Flat nodes: no gradient outline, no grey shadow (mermaid's neo look), the outline is the control edge.
    useGradient: false,
    dropShadow: 'none'
  }
}

/**
 * Node labels as readable text: the model writes plain-text math there («y_sec(x)», «m*(x - a)»); subscripts
 * and exponents become <sub>/<sup>, which mermaid keeps under securityLevel strict, and * a centred dot.
 */
export function prepareMermaid(code: string): string {
  const label = (t: string): string =>
    t
      .replace(/\$/g, '')
      .replace(/([A-Za-z])_\{?([A-Za-z0-9]+)\}?/g, '$1<sub>$2</sub>')
      .replace(/([A-Za-z0-9)])\^\{?([A-Za-z0-9+-]+)\}?/g, '$1<sup>$2</sup>')
      .replace(/(?<=[\w)\]])\s*\*\s*(?=[\w([])/g, '·')
  return code.replace(/"([^"\n]*)"/g, (_m, t: string) => `"${label(t)}"`).replace(/\[([^\]"\n]+)\]/g, (_m, t: string) => `[${label(t)}]`)
}

/** The SVG with nothing but drawing and the HTML of the labels: no scripts, no handlers, no links out. */
export const sanitizeSvg = (svg: string): string =>
  DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true, html: true }, ADD_TAGS: ['foreignObject'], HTML_INTEGRATION_POINTS: { foreignobject: true } })

/** The first node's label, as words: the diagram's name when the section has none. */
export function firstLabel(code: string): string {
  const m = /\[\s*"?([^"\]\n]+)"?\s*\]/.exec(code)
  return m ? m[1].replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : ''
}
