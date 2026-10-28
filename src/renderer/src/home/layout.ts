/** Sizes of the home sections Andrea can drag (px): side panels, sessions list, notebooks list. */
export type Layout = { left: number; right: number; sessions: number; notebooks: number }
export const DEFAULT_LAYOUT: Layout = { left: 288, right: 320, sessions: 300, notebooks: 280 }
export const LIMITS = { left: [272, 480], right: [260, 520], sessions: [120, 900], notebooks: [120, 900] } as const
const KEY = 'sinapsi.layout.v1'
const CENTRE_MIN = 360

const clamp = (v: number, [lo, hi]: readonly [number, number]): number => Math.min(hi, Math.max(lo, Math.round(v)))

/** Within the limits, and the graph keeps at least 360 px; the lists leave room for what is below them. */
export function clampLayout(l: Layout, width: number, height: number, shown = { left: true, right: true }, dragging?: 'left' | 'right'): Layout {
  let left = clamp(l.left, LIMITS.left)
  let right = clamp(l.right, LIMITS.right)
  const room = width - CENTRE_MIN
  // The dragged line stops where the graph would get too narrow; it never pushes the other panel.
  if (dragging === 'left') left = Math.min(left, Math.max(LIMITS.left[0], room - (shown.right ? right : 0)))
  else if (dragging === 'right') right = Math.min(right, Math.max(LIMITS.right[0], room - (shown.left ? left : 0)))
  else {
    const over = (shown.left ? left : 0) + (shown.right ? right : 0) - room
    if (over > 0) {
      const fromRight = shown.right ? Math.min(over, right - LIMITS.right[0]) : 0
      right -= fromRight
      if (shown.left) left = Math.max(LIMITS.left[0], left - (over - fromRight))
    }
  }
  const listMax = Math.max(LIMITS.sessions[0], height - 260)
  return { left, right, sessions: Math.min(listMax, clamp(l.sessions, LIMITS.sessions)), notebooks: Math.min(listMax, clamp(l.notebooks, LIMITS.notebooks)) }
}

export function loadLayout(): Layout {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (!raw || typeof raw !== 'object') return DEFAULT_LAYOUT
    const out = { ...DEFAULT_LAYOUT }
    for (const k of Object.keys(out) as (keyof Layout)[]) if (Number.isFinite(raw[k])) out[k] = raw[k]
    return out
  } catch {
    return DEFAULT_LAYOUT
  }
}

export function saveLayout(l: Layout): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(l))
  } catch {
    /* private storage unavailable: sizes simply aren't remembered */
  }
}
