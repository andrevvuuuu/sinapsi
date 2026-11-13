import React, { useId } from 'react';
import { COLOR_PALETTE } from './types';
import { generateInactivePillPath, generateInkWavePath } from './motionMath';

export interface ElasticChipProps {
  id: string;
  label: string;
  isActive: boolean;
  isDocked: boolean;
  isMoving: boolean;
  width: number;
  height: number;
  fontSize: number;
  inkProgress: number; // 0 to 1
  inkDirection: 'fill' | 'drain';
  hoverState: { x: number; y: number; intensity: number };
  onClick: () => void;
  onPointerEnter: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerLeave: () => void;
}

export const ElasticChip = React.forwardRef<HTMLDivElement, ElasticChipProps>(function ElasticChip(
  {
    id,
    label,
    isActive,
    isDocked,
    isMoving,
    width,
    height,
    fontSize,
    inkProgress,
    inkDirection,
    hoverState,
    onClick,
    onPointerEnter,
    onPointerMove,
    onPointerLeave,
  },
  ref
) {
  const radius = height / 2;
  const rawId = useId();
  const safeId = rawId.replace(/[^a-zA-Z0-9-_]/g, '');
  const clipPillId = `clip-pill-${id}-${safeId}`;
  const clipInkId = `clip-ink-${id}-${safeId}`;

  // When inactive or during transition, compute the organic rubbery pill contour
  const inactivePath = generateInactivePillPath(width, height, radius, hoverState);

  // Compute advancing convex wave front or receding drain meniscus
  const inkWavePath = generateInkWavePath(width, height, inkProgress, inkDirection);

  // Z-index: moving chips glide OVER other chips (Frame 214)
  const zIndex = isMoving ? 50 : isDocked ? 20 : 10;

  return (
    <div
      ref={ref}
      role="radio"
      aria-checked={isActive}
      aria-label={label}
      tabIndex={isActive ? 0 : -1}
      style={{
        position: 'relative',
        width: `${width}px`,
        height: `${height}px`,
        cursor: 'pointer',
        userSelect: 'none',
        zIndex,
        flexShrink: 0,
        outline: 'none',
        fontFamily: 'var(--sans)',
      }}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onClick();
        }
      }}
      onPointerEnter={onPointerEnter}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      {/* SVG Clip Path Definitions */}
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: `${width}px`,
          height: `${height}px`,
          pointerEvents: 'none',
          overflow: 'visible',
        }}
        aria-hidden="true"
      >
        <defs>
          <clipPath id={clipPillId}>
            <path d={inactivePath} />
          </clipPath>
          <clipPath id={clipInkId} clipPath={`url(#${clipPillId})`}>
            <path d={inkWavePath} />
          </clipPath>
        </defs>
      </svg>

      {/* CASE A: FULLY DOCKED IN CAPSULE */}
      {isDocked && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: COLOR_PALETTE.textActive,
            fontSize: `${fontSize}px`,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            pointerEvents: 'none',
            fontFamily: 'var(--sans)',
          }}
        >
          {label}
        </div>
      )}

      {/* CASE B: INACTIVE OR MID-TRANSITION (DOCKING / UNDOCKING) */}
      {!isDocked && (
        <>
          {/* BASE LAYER: Opaque canvas fill + Responsive stroke + Inactive base text */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
            }}
          >
            <svg
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: `${width}px`,
                height: `${height}px`,
                overflow: 'visible',
              }}
            >
              {/* Opaque canvas fill physically occludes underlying elements during FLIP (Frame 214) */}
              <path
                d={inactivePath}
                style={{
                  fill: COLOR_PALETTE.background,
                  stroke: COLOR_PALETTE.borderInactive,
                  strokeWidth: Math.max(1.5, height * 0.035),
                  strokeLinejoin: 'round',
                }}
              />
            </svg>

            {/* Base Text */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: COLOR_PALETTE.textInactive,
                fontSize: `${fontSize}px`,
                fontWeight: 600,
                letterSpacing: '-0.02em',
                fontFamily: 'var(--sans)',
              }}
            >
              {label}
            </div>
          </div>

          {/* INK LAYER: Clipped to advancing/receding wave front with active text (Frame 40 & 66) */}
          {inkProgress > 0.001 && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                clipPath: `url(#${clipInkId})`,
                zIndex: 2,
              }}
            >
              {/* Solid purple ink fill */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  backgroundColor: COLOR_PALETTE.ink,
                }}
              />

              {/* Synchronized Active Text */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: COLOR_PALETTE.textActive,
                  fontSize: `${fontSize}px`,
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                  fontFamily: 'var(--sans)',
                }}
              >
                {label}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
});
