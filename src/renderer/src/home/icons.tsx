const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
export const IconPanel = (): React.JSX.Element => (<svg viewBox="0 0 18 18" {...P}><rect x="2.5" y="3" width="13" height="12" rx="3" /><path d="M7 3v12" /></svg>)
export const IconChevron = (): React.JSX.Element => (<svg viewBox="0 0 12 12" {...P}><path d="M4.5 2.5 8 6l-3.5 3.5" /></svg>)
export const IconGear = (): React.JSX.Element => (<svg viewBox="0 0 18 18" {...P}><circle cx="9" cy="9" r="2.5" /><path d="M9 1.8v2M9 14.2v2M1.8 9h2M14.2 9h2M3.9 3.9l1.4 1.4M12.7 12.7l1.4 1.4M3.9 14.1l1.4-1.4M12.7 5.3l1.4-1.4" /></svg>)
export const IconSend = (): React.JSX.Element => (<svg viewBox="0 0 16 16" {...P}><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" /></svg>)
export const IconUpload = (): React.JSX.Element => (<svg viewBox="0 0 16 16" {...P}><path d="M8 10V2.5M5 5.5l3-3 3 3M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2" /></svg>)
