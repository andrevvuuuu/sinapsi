import type { ReactNode } from 'react'

export function Icon({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

export const IconToday = (): React.JSX.Element => (
  <Icon>
    <path d="M4 11 12 5l8 6v8h-6v-6h-4v6H4z" />
  </Icon>
)

export const IconStudy = (): React.JSX.Element => (
  <Icon>
    <path d="M4 5.5c3-.7 6-.2 8 1.3v13c-2-1.5-5-2-8-1.3zM20 5.5c-3-.7-6-.2-8 1.3v13c2-1.5 5-2 8-1.3z" />
  </Icon>
)

export const IconReview = (): React.JSX.Element => (
  <Icon>
    <path d="M20 8V4m0 4h-4M19 8a8 8 0 1 0 1 6" />
  </Icon>
)

export const IconMap = (): React.JSX.Element => (
  <Icon>
    <circle cx="6" cy="7" r="2" />
    <circle cx="18" cy="7" r="2" />
    <circle cx="12" cy="18" r="2" />
    <path d="M8 7h8M7 9l4 7m6-7-4 7" />
  </Icon>
)

export const IconPlan = (): React.JSX.Element => (
  <Icon>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M8 3v4m8-4v4M4 10h16" />
  </Icon>
)

export const IconSettings = (): React.JSX.Element => (
  <Icon>
    <circle cx="12" cy="12" r="3" />
    <path d="m19 13 2 1-2 4-2-1-2 1v2H9v-2l-2-1-2 1-2-4 2-1v-2l-2-1 2-4 2 1 2-1V4h6v2l2 1 2-1 2 4-2 1z" />
  </Icon>
)

export const IconPlus = (): React.JSX.Element => (
  <Icon>
    <path d="M12 5v14m-7-7h14" />
  </Icon>
)

export const IconMinus = (): React.JSX.Element => (
  <Icon>
    <path d="M5 12h14" />
  </Icon>
)

export const IconSpark = (): React.JSX.Element => (
  <Icon>
    <path d="M12 3v18m7.794-13.5L4.206 16.5m15.588 0L4.206 7.5" />
  </Icon>
)

export const IconArrowUp = (): React.JSX.Element => (
  <Icon>
    <path d="M12 19V5m-6 6 6-6 6 6" />
  </Icon>
)

export const IconArrowUpRight = (): React.JSX.Element => (
  <Icon>
    <path d="M7 17 17 7m0 0H9m8 0v8" />
  </Icon>
)

export const IconSearch = (): React.JSX.Element => (
  <Icon>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.35-4.35" />
  </Icon>
)

export const IconClose = (): React.JSX.Element => (
  <Icon>
    <path d="m18 6-12 12m0-12 12 12" />
  </Icon>
)

export const IconGrip = (): React.JSX.Element => (
  <Icon>
    <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" strokeWidth="2.6" />
  </Icon>
)

export const IconChevronUp = (): React.JSX.Element => (
  <Icon>
    <path d="m6 15 6-6 6 6" />
  </Icon>
)

export const IconChevronDown = (): React.JSX.Element => (
  <Icon>
    <path d="m6 9 6 6 6-6" />
  </Icon>
)

export const IconArrange = (): React.JSX.Element => (
  <Icon>
    <path d="M7 4v16M4 7l3-3 3 3M17 20V4M14 17l3 3 3-3" />
  </Icon>
)

export const IconSwap = (): React.JSX.Element => (
  <Icon>
    <path d="M4 8h13l-3-3M20 16H7l3 3" />
  </Icon>
)
