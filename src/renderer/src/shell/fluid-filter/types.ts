export interface FilterItem {
  id: string;
  label: string;
  delta?: number;
}

export interface MouseCoords {
  x: number; // normalized 0 to 1 across width
  y: number; // normalized 0 to 1 across height
  px: number; // pixel x within chip
  py: number; // pixel y within chip
}

export interface PhysicalConstants {
  // FLIP spatial reordering physics
  flipSpring: {
    stiffness: number;
    damping: number;
    mass: number;
  };
  // Roller counter digit scroll physics
  rollerSpring: {
    stiffness: number;
    damping: number;
    mass: number;
  };
  // Elastic hover deformation spring
  hoverSpring: {
    stiffness: number;
    damping: number;
    mass: number;
  };
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
    damping: 24,
    mass: 0.8,
  },
  hoverSpring: {
    stiffness: 300,
    damping: 20,
    mass: 0.7,
  },
  inkDurationMs: 380,
};

export const COLOR_PALETTE = {
  background: 'var(--sh-card-solid)',
  ink: 'var(--sh-send-bg)',
  textActive: 'var(--sh-card-solid)',
  textSecondary: 'color-mix(in srgb, var(--sh-card-solid) 70%, transparent)',
  divider: 'color-mix(in srgb, var(--sh-card-solid) 35%, transparent)',
  borderInactive: 'var(--sh-send-bg)',
  textInactive: 'var(--sh-text, var(--sh-send-bg))',
} as const;
