export interface FilterItem {
  id: string;
  label: string;
  delta?: number;
}

export interface MouseCoords {
  x: number;
  y: number;
  px: number;
  py: number;
}

export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass: number;
}

export interface PhysicalConstants {
  // FLIP spatial reordering physics
  flipSpring: SpringConfig;
  // Roller counter digit scroll physics
  rollerSpring: SpringConfig;
  // Elastic hover deformation spring
  hoverSpring: SpringConfig;
  // Ink wave speed and duration
  inkDurationMs: number;
}

export const DEFAULT_PHYSICS: PhysicalConstants = {
  flipSpring: {
    stiffness: 420,
    damping: 34,
    mass: 0.9,
  },
  rollerSpring: {
    stiffness: 320,
    damping: 16.6,
    mass: 0.8,
  },
  hoverSpring: {
    stiffness: 300,
    damping: 20,
    mass: 0.7,
  },
  inkDurationMs: 380,
};

export interface ThemeColors {
  background: string;
  chipBackground: string;
  activeCapsule: string;
  activeText: string;
  activeSecondary: string;
  activeDivider: string;
  inactiveBorder: string;
  inactiveText: string;
}

export const COLOR_PALETTE = {
  background: 'var(--sh-card-solid, #1C1F26)',
  ink: 'var(--sh-send-bg, #7664c2)',
  textActive: 'var(--sg-ink-active-text, #ffffff)',
  textSecondary: 'var(--sh-text-2, rgba(236,236,239,0.7))',
  activeSecondary: 'var(--sg-ink-active-text, #ffffff)',
  divider: 'color-mix(in srgb, var(--sh-send-bg, #7664c2) 40%, transparent)',
  borderInactive: 'var(--sh-send-bg, #7664c2)',
  textInactive: 'var(--sh-text, #F3F4F6)',
} as const;

export const DEFAULT_STUDY_ITEMS: FilterItem[] = [
  { id: 'Studia', label: 'Studia', delta: 0 },
  { id: 'Esercitati', label: 'Esercitati', delta: 1 },
  { id: 'Ripassa', label: 'Ripassa', delta: 1 },
];
