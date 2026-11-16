import React from 'react';
import { COLOR_PALETTE, DEFAULT_PHYSICS, SpringConfig } from './types';
import { generateInactivePillPath, generateInkWavePath, generateUninkedClipPath } from './motionMath';

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
  hoverSpring?: SpringConfig;
  chipRef?: React.Ref<HTMLDivElement>;
  palette?: {
    activeCapsule: string;
    activeText: string;
    chipBackground: string;
    inactiveBorder: string;
    inactiveText: string;
  };
  onClick: () => void;
  onPointerEnter: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerLeave: () => void;
}

export const ElasticChip: React.FC<ElasticChipProps> = ({
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
  hoverSpring = DEFAULT_PHYSICS.hoverSpring,
  chipRef,
  palette,
  onClick,
  onPointerEnter,
  onPointerMove,
  onPointerLeave,
}) => {
  const colors = palette ?? {
    activeCapsule: COLOR_PALETTE.ink,
    activeText: COLOR_PALETTE.textActive,
    chipBackground: COLOR_PALETTE.background,
    inactiveBorder: COLOR_PALETTE.borderInactive,
    inactiveText: COLOR_PALETTE.textInactive,
  };
  const radius = height / 2;
  const clipPillId = `clip-pill-${id}`;
  const clipInkId = `clip-ink-${id}`;
  const clipUninkedId = `clip-uninked-${id}`;

  const strokeWidth = Math.max(2.5, Math.round(height * 0.035));
  const halfStroke = strokeWidth / 2;

  // When inactive or during transition, compute the organic rubbery pill contour inset by halfStroke
  const inactivePath = generateInactivePillPath(
    width,
    height,
    radius,
    { ...hoverState, allowRecoil: true },
    halfStroke
  );

  // Compute advancing convex wave front or receding drain meniscus
  const inkWavePath = generateInkWavePath(width, height, inkProgress, inkDirection);
  // Compute complementary uninked region to cleanly clip base fill & stroke during coalescence
  const uninkedClipPath = generateUninkedClipPath(width, height, inkProgress, inkDirection);

  // Z-index: moving chips glide OVER other chips
  const zIndex = isMoving ? 50 : isDocked ? 20 : 10;

  return (
    <div
      ref={chipRef}
      role="button"
      aria-pressed={isActive}
      tabIndex={0}
      data-spring-stiffness={hoverSpring.stiffness}
      data-spring-damping={hoverSpring.damping}
      style={{
        position: 'relative',
        width: `${width}px`,
        height: `${height}px`,
        cursor: isDocked ? 'default' : 'pointer',
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
            <path d={inkWavePath} clipPath={`url(#${clipPillId})`} />
          </clipPath>
          <clipPath id={clipUninkedId} clipPath={`url(#${clipPillId})`}>
            <path d={uninkedClipPath} clipPath={`url(#${clipPillId})`} />
          </clipPath>
        </defs>
      </svg>

      {/* CASE A: FULLY DOCKED IN SILHOUETTE */}
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
            color: colors.activeText,
            fontSize: `${fontSize}px`,
            fontWeight: 600,
            letterSpacing: '-0.015em',
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
          {/* BASE LAYER: Opaque chip fill + Responsive stroke + Inactive base text */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              clipPath: isActive && inkProgress > 0.001 ? `url(#${clipUninkedId})` : undefined,
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
              <path
                d={inactivePath}
                fill={colors.chipBackground}
                stroke={colors.inactiveBorder}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                strokeOpacity={isActive ? Math.max(0, 1 - inkProgress * 2) : 1}
              />
            </svg>

            {/* Base Inactive Text */}
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
                color: colors.inactiveText,
                fontSize: `${fontSize}px`,
                fontWeight: 600,
                letterSpacing: '-0.015em',
                fontFamily: 'var(--sans)',
              }}
            >
              {label}
            </div>
          </div>

          {/* INK LAYER: Clipped to advancing/receding wave front with Active text */}
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
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  backgroundColor: colors.activeCapsule,
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
                  color: colors.activeText,
                  fontSize: `${fontSize}px`,
                  fontWeight: 600,
                  letterSpacing: '-0.015em',
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
};
