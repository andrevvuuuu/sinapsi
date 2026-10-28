/** Sinapsi: an S drawn with a dip pen — two crescents reaching for each other, the spark crossing the gap. Same drawing as build/icon.svg (design/logo/build_mark.py). */
export function LogoMark({ size = 26 }: { size?: number }): React.JSX.Element {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="28 26 200 200" aria-hidden="true">
      <path className="bowl" fill="currentColor" d="M162.39 68.64A45 45 0 1 0 110.64 120.39A37.5 37.5 0 1 1 162.39 68.64Z" />
      <path className="bowl" fill="currentColor" d="M93.61 183.36A45 45 0 1 0 145.36 131.61A37.5 37.5 0 1 1 93.61 183.36Z" />
      <path className="spark" fill="var(--accent)" d="M119.00 126.00a9 9 0 1 0 18 0a9 9 0 1 0 -18 0Z" />
    </svg>
  )
}
