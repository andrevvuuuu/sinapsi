/** Sinapsi: an S broken in the middle — two nodes reaching for each other, the spark crossing the gap. Same drawing as build/icon.svg. */
export function LogoMark({ size = 26 }: { size?: number }): React.JSX.Element {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M15.2 6.45A3.7 3.7 0 1 0 9.38 10.92" />
        <path d="M8.8 17.55A3.7 3.7 0 1 0 14.62 13.08" />
      </g>
      <circle cx="15.2" cy="6.45" r="1.8" fill="currentColor" />
      <circle cx="8.8" cy="17.55" r="1.8" fill="currentColor" />
      <circle className="spark" cx="12" cy="12" r="1.2" fill="var(--accent)" />
    </svg>
  )
}
