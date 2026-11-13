import React from 'react';

export interface GooeyFilterDefProps {
  id?: string;
  /** Blur radius, scaled from the scratch value (10 at 140 px) to the bar height. */
  stdDeviation?: number;
}

/**
 * Isolated SVG Gooey / Metaball Filter Definition.
 *
 * This filter is referenced via CSS `filter: url(#${id})`.
 * It applies a Gaussian blur followed by an alpha channel threshold step (feColorMatrix),
 * fusing nearby black vector shapes into organic liquid metaballs with dynamic meniscus bridges.
 *
 * CRITICAL: Kept strictly separated from typography and divider layers to preserve 100% vector sharpness.
 */
export const GooeyFilterDef: React.FC<GooeyFilterDefProps> = ({ id = 'gooey-filter', stdDeviation = 10 }) => {
  return (
    <svg
      style={{
        position: 'absolute',
        width: 0,
        height: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
      aria-hidden="true"
    >
      <defs>
        <filter id={id} x="-20%" y="-40%" width="140%" height="180%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation={stdDeviation} result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0
                    0 1 0 0 0
                    0 0 1 0 0
                    0 0 0 28 -10"
            result="goo"
          />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
    </svg>
  );
};
