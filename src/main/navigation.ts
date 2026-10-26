/** The app window never navigates: https links open in the browser, everything else is dropped. */
export function navigationDecision(url: string): { allow: false; external?: string } {
  return /^https:\/\//i.test(url) ? { allow: false, external: url } : { allow: false }
}
