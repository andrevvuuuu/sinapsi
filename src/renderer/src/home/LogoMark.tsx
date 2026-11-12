/** Sinapsi: minimal neural synapse logo — two terminal boutons reaching for each other, spark in the cleft. Same drawing as build/icon.svg. */
export function LogoMark({ size = 26 }: { size?: number }): React.JSX.Element {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <path className="bowl" fill="currentColor" d="M 28 24 C 42 15 64 15 76 26 C 86 35 86 49 78 57 C 71 63 62 61 57 54 C 54 49 55 42 61 37 C 69 31 69 24 59 22 C 49 20 37 22 28 24 Z" />
      <path className="bowl" fill="currentColor" d="M 72 76 C 58 85 36 85 24 74 C 14 65 14 51 22 43 C 29 37 38 39 43 46 C 46 51 45 58 39 63 C 31 69 31 76 41 78 C 51 80 63 78 72 76 Z" />
      <path className="spark" fill="var(--accent)" d="M 50 43.5 Q 50 50 56.5 50 Q 50 50 50 56.5 Q 50 50 43.5 50 Q 50 50 50 43.5 Z" />
    </svg>
  )
}
