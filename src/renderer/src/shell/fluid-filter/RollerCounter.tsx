import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { COLOR_PALETTE, DEFAULT_PHYSICS } from './types';

export interface RollerCounterProps {
  count: number | null;
  label?: string;
  digitHeight?: number;
  fontSize?: number;
  labelFontSize?: number;
}

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export const RollerCounter: React.FC<RollerCounterProps> = ({
  count,
  label = 'suggerimenti',
  digitHeight = 20,
  fontSize = 15,
  labelFontSize = 13,
}) => {
  const shouldReduce = useReducedMotion();
  const isReduced = Boolean(shouldReduce);

  const digits = count != null ? Math.max(0, count).toString().split('').map(Number) : null;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: `${fontSize * 0.22}px`,
        userSelect: 'none',
        lineHeight: 1,
        fontFamily: 'var(--sans)',
      }}
      aria-label={count != null ? `${count} ${label}` : `— ${label}`}
    >
      {/* Digit columns container */}
      <div style={{ display: 'inline-flex', alignItems: 'center' }}>
        {digits !== null ? (
          digits.map((digit, index) => {
            const columnKey = `col-${digits.length - 1 - index}`;
            return (
              <div
                key={columnKey}
                style={{
                  height: `${digitHeight}px`,
                  width: `${fontSize * 0.64}px`,
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
                          stiffness: DEFAULT_PHYSICS.rollerSpring.stiffness,
                          damping: DEFAULT_PHYSICS.rollerSpring.damping,
                          mass: DEFAULT_PHYSICS.rollerSpring.mass,
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
                        color: COLOR_PALETTE.textActive,
                        fontSize: `${fontSize}px`,
                        fontWeight: 800,
                        lineHeight: `${digitHeight}px`,
                        letterSpacing: '-0.03em',
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
              width: `${fontSize * 0.64}px`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: COLOR_PALETTE.textActive,
              fontSize: `${fontSize}px`,
              fontWeight: 800,
              lineHeight: `${digitHeight}px`,
              letterSpacing: '-0.03em',
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
          color: COLOR_PALETTE.textSecondary,
          fontSize: `${labelFontSize}px`,
          fontWeight: 500,
          letterSpacing: '-0.02em',
          lineHeight: `${digitHeight}px`,
          display: 'inline-block',
          transform: 'translateY(-1px)',
          fontFamily: 'var(--sans)',
        }}
      >
        {label}
      </span>
    </div>
  );
};
