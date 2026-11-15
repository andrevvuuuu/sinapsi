import React from 'react';

export interface GooeyFilterDefProps {
  id?: string;
  stdDeviation?: number | string;
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
export const GooeyFilterDef: React.FC<GooeyFilterDefProps> = ({
  id = 'gooey-filter',
  stdDeviation = '6',
}) => {
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
        <filter id={id} colorInterpolationFilters="sRGB" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation={stdDeviation} result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0
                    0 1 0 0 0
                    0 0 1 0 0
                    0 0 0 22 -9"
            result="goo"
          />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
    </svg>
  );
};
