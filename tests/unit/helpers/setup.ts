// jsdom has no matchMedia, which @glass-sdk/liquid-glass reads (reduced motion and transparency). The tests run as with
// reduced motion, as they did when nothing could ask: no animation to wait for. Nothing else matches.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: /prefers-reduced-motion:\s*reduce/.test(query),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false
  })) as unknown as typeof window.matchMedia
}
