import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { COLOR_PALETTE, DEFAULT_PHYSICS, SpringConfig } from './types';

export interface RollerCounterProps {
  count: number | null;
  label?: string;
  digitHeight?: number;
  fontSize?: number;
  labelFontSize?: number;
  digitColor?: string;
  labelColor?: string;
  springConfig?: SpringConfig;
}

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export const RollerCounter: React.FC<RollerCounterProps> = ({
  count,
  label = 'suggerimenti',
  digitHeight = 20,
  fontSize = 15,
  labelFontSize = 13,
  digitColor,
  labelColor,
  springConfig,
}) => {
  const shouldReduce = useReducedMotion();
  const isReduced = Boolean(shouldReduce);

  const spring = springConfig ?? DEFAULT_PHYSICS.rollerSpring;
  const safeCount = count != null ? Math.max(0, Math.round(count)) : null;
  const digits = safeCount != null ? safeCount.toString().split('').map(Number) : null;
  const totalDigits = digits ? digits.length : 1;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: `${Math.round(fontSize * 0.35)}px`,
        userSelect: 'none',
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
        fontFeatureSettings: '"tnum"',
        fontFamily: 'var(--sans)',
      }}
      aria-label={safeCount != null ? `${safeCount} ${label}` : `— ${label}`}
      role="status"
    >
      {/* Digit columns container with place-value stable keys */}
      <div style={{ display: 'inline-flex', alignItems: 'center' }}>
        {digits !== null ? (
          digits.map((digit, index) => {
            const placeIndex = totalDigits - 1 - index;
            const colKey = `digit-place-${placeIndex}`;

            return (
              <div
                key={colKey}
                style={{
                  height: `${digitHeight}px`,
                  width: `${Math.round(fontSize * 0.55)}px`,
                  overflow: 'hidden',
                  position: 'relative',
                  display: 'inline-block',
                }}
              >
                <motion.div
                  initial={{ y: -digit * digitHeight }}
                  animate={{ y: -digit * digitHeight }}
                  transition={
                    isReduced
                      ? { duration: 0 }
                      : {
                          type: 'spring',
                          stiffness: spring.stiffness,
                          damping: spring.damping,
                          mass: spring.mass,
                          restDelta: 0.001,
                          restSpeed: 0.01,
                        }
                  }
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                  }}
                >
                  {DIGITS.map((num) => (
                    <div
                      key={num}
                      style={{
                        height: `${digitHeight}px`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: digitColor ?? COLOR_PALETTE.textActive,
                        fontSize: `${fontSize}px`,
                        fontWeight: 800,
                        lineHeight: `${digitHeight}px`,
                        letterSpacing: '-0.025em',
                        fontVariantNumeric: 'tabular-nums',
                        fontFeatureSettings: '"tnum"',
                        fontFamily: 'var(--sans)',
                      }}
                    >
                      {num}
                    </div>
                  ))}
                </motion.div>
              </div>
            );
          })
        ) : (
          <div
            style={{
              height: `${digitHeight}px`,
              width: `${Math.round(fontSize * 0.55)}px`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: digitColor ?? COLOR_PALETTE.textActive,
              fontSize: `${fontSize}px`,
              fontWeight: 800,
              lineHeight: `${digitHeight}px`,
              letterSpacing: '-0.025em',
              fontVariantNumeric: 'tabular-nums',
              fontFeatureSettings: '"tnum"',
              fontFamily: 'var(--sans)',
            }}
          >
            —
          </div>
        )}
      </div>

      {/* Label */}
      <span
        style={{
          color: labelColor ?? COLOR_PALETTE.textSecondary,
          fontSize: `${labelFontSize}px`,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          lineHeight: `${digitHeight}px`,
          display: 'inline-block',
          fontFamily: 'var(--sans)',
        }}
      >
        {label}
      </span>
    </div>
  );
};
