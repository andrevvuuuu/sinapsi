import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, useId } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { FilterItem, COLOR_PALETTE, DEFAULT_PHYSICS, DEFAULT_STUDY_ITEMS } from './types';
import { RollerCounter } from './RollerCounter';
import { ElasticChip } from './ElasticChip';
import { GooeyFilterDef } from './GooeyLayer';
import {
  generateCapsuleSilhouettePath,
  generateMetaballBridgePath,
  generateDropletTipPath,
  generateInactivePillPath,
} from './motionMath';

export interface FluidFilterBarProps {
  items?: FilterItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
  count?: number | null;
  label?: string;
  height?: number;
  className?: string;
}

let measurementCanvas: HTMLCanvasElement | null = null;
let measurementContext: CanvasRenderingContext2D | null = null;

function measureTextWidth(text: string, font: string): number {
  if (typeof document === 'undefined') {
    return text.length * 8;
  }
  if (!measurementCanvas) {
    measurementCanvas = document.createElement('canvas');
    measurementContext = measurementCanvas.getContext('2d');
  }
  if (!measurementContext) {
    return text.length * 8;
  }
  measurementContext.font = font;
  return measurementContext.measureText(text).width;
}

function getAppSansFont(weight: number, sizePx: number): string {
  let family = "'Geist', ui-sans-serif, system-ui, sans-serif";
  if (typeof document !== 'undefined') {
    const computed = getComputedStyle(document.documentElement).getPropertyValue('--sans').trim();
    if (computed) {
      family = computed;
    }
  }
  return `${weight} ${sizePx}px ${family}`;
}

export const FluidFilterBar: React.FC<FluidFilterBarProps> = ({
  items = DEFAULT_STUDY_ITEMS,
  activeId = 'Studia',
  onSelect,
  count = null,
  label = 'suggerimenti',
  height = 38,
  className,
}) => {
  const shouldReduce = useReducedMotion();
  const isReduced = Boolean(shouldReduce);

  const [currentActiveId, setCurrentActiveId] = useState<string>(activeId);
  const currentActiveRef = useRef<string>(currentActiveId);
  useLayoutEffect(() => {
    currentActiveRef.current = currentActiveId;
  }, [currentActiveId]);

  // Spatial display order of chip IDs (active first, followed by other inactive)
  const [displayOrder, setDisplayOrder] = useState<string[]>(() => {
    const active = items.filter((i) => i.id === activeId).map((i) => i.id);
    const inactive = items.filter((i) => i.id !== activeId).map((i) => i.id);
    return [...active, ...inactive];
  });

  const rawFilterId = useId();
  const filterSafeId = rawFilterId.replace(/[^a-zA-Z0-9-_]/g, '');
  const filterId = `gooey-filter-${filterSafeId}`;

  const radius = height / 2;
  const chipFontSize = Math.max(12, Math.round(height * 0.36));
  const counterFontSize = Math.max(13, Math.round(height * 0.395));
  const labelFontSize = Math.max(12, Math.round(height * 0.34));
  const gap = Math.max(8, Math.round(height * 0.26));
  const maxBridgeDistance = Math.round(height * 0.61);

  const [fontsLoaded, setFontsLoaded] = useState(false);
  useEffect(() => {
    if (typeof document !== 'undefined' && document.fonts) {
      document.fonts.ready.then(() => setFontsLoaded(true));
    }
  }, []);

  // Compute width for each chip by measuring text with canvas
  const chipWidths = useMemo(() => {
    const map: { [id: string]: number } = {};
    const font = getAppSansFont(600, chipFontSize);
    const horizontalPadding = Math.round(height * 0.84); // 32px at height 38

    for (const item of items) {
      const textWidth = measureTextWidth(item.label, font);
      map[item.id] = Math.ceil(textWidth + horizontalPadding);
    }
    return map;
  }, [items, height, chipFontSize, fontsLoaded]);

  // Compute width for results badge by measuring counter digits + label with scratch baseline
  const resultsWidth = useMemo(() => {
    const font = getAppSansFont(500, labelFontSize);
    const countText = count != null ? String(count) : '—';
    const digitsWidth = countText.length * (counterFontSize * 0.64);
    const gapBetween = counterFontSize * 0.22;
    const labelWidth = measureTextWidth(label, font);
    const padLeft = Math.round(height * 0.38);
    const padRight = Math.round(height * 0.28);
    const measured = Math.ceil(digitsWidth + gapBetween + labelWidth + padLeft + padRight);
    const baseline = Math.round(height * 3.0);
    return Math.max(baseline, measured);
  }, [count, label, height, counterFontSize, labelFontSize, fontsLoaded]);

  // Total intrinsic width of the component (no horizontal overflow)
  const totalWidth = useMemo(() => {
    const activeW = chipWidths[currentActiveId] || 80;
    const inactiveItems = items.filter((item) => item.id !== currentActiveId);
    const inactiveW = inactiveItems.reduce((acc, item) => acc + (chipWidths[item.id] || 80), 0);
    const totalGaps = inactiveItems.length * gap;
    return resultsWidth + activeW + totalGaps + inactiveW;
  }, [resultsWidth, currentActiveId, chipWidths, items, gap]);

  // Compute target X coordinate for each chip
  const computeTargetPositions = useCallback(
    (active: string, order: string[]) => {
      const targetsMap: { [id: string]: number } = {};
      const activeList = order.filter((id) => id === active);
      const inactiveList = order.filter((id) => id !== active);

      let currentX = resultsWidth;
      for (const id of activeList) {
        targetsMap[id] = currentX;
        currentX += chipWidths[id] || 80;
      }

      currentX += gap;
      for (const id of inactiveList) {
        targetsMap[id] = currentX;
        currentX += (chipWidths[id] || 80) + gap;
      }

      return targetsMap;
    },
    [resultsWidth, gap, chipWidths]
  );

  const positionsRef = useRef<{ [id: string]: number }>({});
  const velocitiesRef = useRef<{ [id: string]: number }>({});
  const [positions, setPositions] = useState<{ [id: string]: number }>({});

  const [inkState, setInkState] = useState<{
    [id: string]: { progress: number; direction: 'fill' | 'drain' };
  }>(() => {
    const init: { [id: string]: { progress: number; direction: 'fill' | 'drain' } } = {};
    for (const item of items) {
      init[item.id] = {
        progress: item.id === activeId ? 1 : 0,
        direction: 'fill',
      };
    }
    return init;
  });
  const inkStateRef = useRef(inkState);
  useLayoutEffect(() => {
    inkStateRef.current = inkState;
  });

  const [hoverStates, setHoverStates] = useState<{
    [id: string]: { x: number; y: number; intensity: number };
  }>({});

  const [activeCapsuleHover, setActiveCapsuleHover] = useState<{
    x: number;
    y: number;
    intensity: number;
  } | null>(null);

  const [snapRecoil, setSnapRecoil] = useState<{ [chipId: string]: number }>({});
  const snapRecoilRef = useRef<{ [chipId: string]: number }>({});

  const [movingId, setMovingId] = useState<string | null>(null);
  const [outgoingMovingId, setOutgoingMovingId] = useState<string | null>(null);

  const chipRefs = useRef<{ [id: string]: HTMLDivElement | null }>({});
  const inkRafRef = useRef<{ [id: string]: number }>({});

  // Initialize positions on first render
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initializedRef.current && Object.keys(chipWidths).length > 0) {
      initializedRef.current = true;
      const initialTargets = computeTargetPositions(currentActiveId, displayOrder);
      positionsRef.current = { ...initialTargets };
      setPositions({ ...initialTargets });
      for (const id of Object.keys(initialTargets)) {
        velocitiesRef.current[id] = 0;
      }
    }
  }, [chipWidths, computeTargetPositions, currentActiveId, displayOrder]);

  const targets = useMemo(
    () => computeTargetPositions(currentActiveId, displayOrder),
    [currentActiveId, displayOrder, computeTargetPositions]
  );

  // Spring animation loop (identical physics constants to scratch)
  useEffect(() => {
    let animId: number;
    const k = DEFAULT_PHYSICS.flipSpring.stiffness; // 420
    const c = DEFAULT_PHYSICS.flipSpring.damping; // 34
    const m = DEFAULT_PHYSICS.flipSpring.mass; // 0.9
    const dt = 1 / 60;

    const tick = (): void => {
      let isSettled = true;
      const nextPos: { [id: string]: number } = { ...positionsRef.current };

      for (const id of Object.keys(targets)) {
        if (inkRafRef.current[id]) {
          // Lockstep with fluid wave glide
          continue;
        }
        const targetX = targets[id];
        let currentX = nextPos[id] ?? targetX;
        let v = velocitiesRef.current[id] ?? 0;

        const dist = targetX - currentX;
        const force = k * dist - c * v;
        const a = force / m;
        v += a * dt;
        currentX += v * dt;

        if (Math.abs(dist) > 0.3 || Math.abs(v) > 0.3) {
          isSettled = false;
        } else {
          currentX = targetX;
          v = 0;
        }

        nextPos[id] = currentX;
        velocitiesRef.current[id] = v;
      }

      positionsRef.current = nextPos;
      setPositions(nextPos);

      // Droplet tip snap recoil decay (0.70 factor identical to scratch)
      let recoilChanged = false;
      const nextRecoil: { [k: string]: number } = {};
      for (const [kId, val] of Object.entries(snapRecoilRef.current)) {
        if (val > 0.4) {
          nextRecoil[kId] = val * 0.70;
          recoilChanged = true;
          isSettled = false;
        }
      }
      if (recoilChanged || Object.keys(snapRecoilRef.current).length > 0) {
        snapRecoilRef.current = nextRecoil;
        setSnapRecoil(nextRecoil);
      }

      if (!isSettled) {
        animId = requestAnimationFrame(tick);
      } else {
        if (movingId && !inkRafRef.current[movingId]) {
          setMovingId(null);
          setOutgoingMovingId(null);
        }
      }
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [targets, movingId]);

  // Single-select mode switcher matching scratch fluid physics
  const selectMode = useCallback(
    (id: string, isUserAction: boolean) => {
      const incomingId = id;
      const outgoingId = currentActiveRef.current;
      if (incomingId === outgoingId) return;

      currentActiveRef.current = incomingId;
      setCurrentActiveId(incomingId);

      if (isReduced) {
        setDisplayOrder((prev) => {
          const otherInactive = prev.filter((i) => i !== incomingId && i !== outgoingId);
          const nextOrder = [incomingId, ...otherInactive, outgoingId];
          const nextTargets = computeTargetPositions(incomingId, nextOrder);
          positionsRef.current = { ...nextTargets };
          setPositions({ ...nextTargets });
          return nextOrder;
        });
        setInkState((prev) => {
          const next = {
            ...prev,
            [incomingId]: { progress: 1, direction: 'fill' as const },
            [outgoingId]: { progress: 0, direction: 'drain' as const },
          };
          inkStateRef.current = next;
          return next;
        });
        setMovingId(null);
        setOutgoingMovingId(null);
        snapRecoilRef.current = {};
        setSnapRecoil({});
        if (isUserAction) {
          onSelect?.(incomingId);
        }
        return;
      }

      // Reorder display order: [incoming, ...otherInactive, outgoing]
      const otherInactive = displayOrder.filter((item) => item !== incomingId && item !== outgoingId);
      const nextOrder = [incomingId, ...otherInactive, outgoingId];
      setDisplayOrder(nextOrder);

      // Set moving chips
      setMovingId(incomingId);
      setOutgoingMovingId(outgoingId);

      // Trigger meniscus snap recoil for outgoing chip matching scratch height * 0.16
      const recoilVal = Math.round(height * 0.16);
      snapRecoilRef.current = { [outgoingId]: recoilVal };
      setSnapRecoil({ [outgoingId]: recoilVal });

      // Animate ink drain on outgoing chip (duration 0.85 * 380ms)
      if (inkRafRef.current[outgoingId]) {
        cancelAnimationFrame(inkRafRef.current[outgoingId]);
        delete inkRafRef.current[outgoingId];
      }
      const initialDrainProgress = inkStateRef.current[outgoingId]?.progress ?? 1;
      setInkState((prev) => {
        const next = {
          ...prev,
          [outgoingId]: { progress: initialDrainProgress, direction: 'drain' as const },
        };
        inkStateRef.current = next;
        return next;
      });
      const drainStart = performance.now();
      const drainDuration = DEFAULT_PHYSICS.inkDurationMs * 0.85;
      const animateDrain = (time: number): void => {
        const elapsed = time - drainStart;
        const p = Math.min(1, elapsed / drainDuration);
        const remaining = initialDrainProgress * (1 - p * p);
        setInkState((prev) => {
          const next = {
            ...prev,
            [outgoingId]: { progress: remaining, direction: 'drain' as const },
          };
          inkStateRef.current = next;
          return next;
        });
        if (p < 1) {
          inkRafRef.current[outgoingId] = requestAnimationFrame(animateDrain);
        } else {
          delete inkRafRef.current[outgoingId];
        }
      };
      inkRafRef.current[outgoingId] = requestAnimationFrame(animateDrain);

      // Animate ink fill and physical glide on incoming chip
      if (inkRafRef.current[incomingId]) {
        cancelAnimationFrame(inkRafRef.current[incomingId]);
        delete inkRafRef.current[incomingId];
      }

      const nextTargets = computeTargetPositions(incomingId, nextOrder);
      const startX = positionsRef.current[incomingId] ?? nextTargets[incomingId] ?? 0;
      const targetX = nextTargets[incomingId] ?? startX;

      const initialFillProgress = inkStateRef.current[incomingId]?.progress ?? 0;
      setInkState((prev) => {
        const next = {
          ...prev,
          [incomingId]: { progress: initialFillProgress, direction: 'fill' as const },
        };
        inkStateRef.current = next;
        return next;
      });
      const fillStart = performance.now();
      const fillDuration = DEFAULT_PHYSICS.inkDurationMs;
      const animateFill = (time: number): void => {
        const elapsed = time - fillStart;
        const p = Math.min(1, elapsed / fillDuration);
        const easedP = Math.sin((p * Math.PI) / 2);

        // Smooth physical glide in lockstep with ink wave (matching scratch)
        const currentX = startX + (targetX - startX) * easedP;
        positionsRef.current[incomingId] = currentX;
        setPositions((prev) => ({ ...prev, [incomingId]: currentX }));

        const progress = initialFillProgress + (1 - initialFillProgress) * easedP;
        setInkState((prev) => {
          const next = {
            ...prev,
            [incomingId]: { progress, direction: 'fill' as const },
          };
          inkStateRef.current = next;
          return next;
        });
        if (p < 1) {
          inkRafRef.current[incomingId] = requestAnimationFrame(animateFill);
        } else {
          delete inkRafRef.current[incomingId];
          positionsRef.current[incomingId] = targetX;
          setPositions((prev) => ({ ...prev, [incomingId]: targetX }));
          setMovingId(null);
          setOutgoingMovingId(null);
        }
      };
      inkRafRef.current[incomingId] = requestAnimationFrame(animateFill);

      if (isUserAction) {
        onSelect?.(incomingId);
      }
    },
    [isReduced, displayOrder, height, computeTargetPositions, onSelect]
  );

  // Sync external controlled prop activeId without echoing back to onSelect
  useEffect(() => {
    if (activeId && activeId !== currentActiveRef.current) {
      selectMode(activeId, false);
    }
  }, [activeId, selectMode]);

  // Clean up animation frames on unmount
  useEffect(() => {
    return () => {
      Object.values(inkRafRef.current).forEach((r) => cancelAnimationFrame(r));
    };
  }, []);

  // Is active chip currently docked (resting at slot 0)?
  const isCurrentActiveDocked = useMemo(() => {
    if (movingId !== null || outgoingMovingId !== null) return false;
    const currentX = positions[currentActiveId];
    const targetX = targets[currentActiveId];
    if (currentX === undefined || targetX === undefined) return true;
    return Math.abs(currentX - targetX) < 2;
  }, [movingId, outgoingMovingId, positions, targets, currentActiveId]);

  // Hover handlers for chips
  const handleChipPointerEnter = (id: string, e: React.PointerEvent<HTMLDivElement>): void => {
    if (isReduced) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;

    if (id === currentActiveId && isCurrentActiveDocked) {
      const currentX = positions[id] || 0;
      const activeW = chipWidths[id] || 80;
      const capWidth = resultsWidth + activeW;
      const capsuleNormX = (currentX + nx * activeW) / capWidth;
      setActiveCapsuleHover({ x: capsuleNormX, y: ny, intensity: 1 });
    } else {
      setHoverStates((prev) => ({
        ...prev,
        [id]: { x: nx, y: ny, intensity: 1 },
      }));
    }
  };

  const handleChipPointerMove = (id: string, e: React.PointerEvent<HTMLDivElement>): void => {
    if (isReduced) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;

    if (id === currentActiveId && isCurrentActiveDocked) {
      const currentX = positions[id] || 0;
      const activeW = chipWidths[id] || 80;
      const capWidth = resultsWidth + activeW;
      const capsuleNormX = (currentX + nx * activeW) / capWidth;
      setActiveCapsuleHover({ x: capsuleNormX, y: ny, intensity: 1 });
    } else {
      setHoverStates((prev) => ({
        ...prev,
        [id]: { x: nx, y: ny, intensity: 1 },
      }));
    }
  };

  const handleChipPointerLeave = (id: string): void => {
    if (id === currentActiveId && isCurrentActiveDocked) {
      setActiveCapsuleHover(null);
    } else {
      setHoverStates((prev) => ({
        ...prev,
        [id]: { x: 0.5, y: 0.5, intensity: 0 },
      }));
    }
  };

  // Keyboard navigation for radiogroup
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const step = ({
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
    } as Record<string, number | undefined>)[e.key];

    if (step !== undefined) {
      e.preventDefault();
      const currentIndex = items.findIndex((item) => item.id === currentActiveId);
      if (currentIndex !== -1) {
        const nextIndex = (currentIndex + step + items.length) % items.length;
        const nextItem = items[nextIndex];
        if (nextItem) {
          selectMode(nextItem.id, true);
          chipRefs.current[nextItem.id]?.focus();
        }
      }
    }
  };

  const capsuleWidth = useMemo(() => {
    const activeW = chipWidths[currentActiveId] || 80;
    return isCurrentActiveDocked ? resultsWidth + activeW : resultsWidth;
  }, [isCurrentActiveDocked, currentActiveId, resultsWidth, chipWidths]);

  const dividerPositions = useMemo(() => {
    return [resultsWidth];
  }, [resultsWidth]);

  // Compute metaball bridges and droplet recoil matching scratch
  const bridgeData = useMemo(() => {
    if (!movingId && !outgoingMovingId) return null;

    const capsuleEdge = resultsWidth;
    let bridgePath: string | null = null;
    let dropletLeft = '';
    let dropletRight = '';

    // Incoming chip: circular tangency coalescence
    if (movingId) {
      const movingX = positions[movingId] ?? targets[movingId] ?? 0;
      const ink = inkState[movingId] || { progress: 0, direction: 'fill' };
      const p = Math.max(0, Math.min(1, ink.progress));

      const alpha = Math.min(Math.PI / 2, (p / 0.40) * (Math.PI / 2));
      const cosA = Math.cos(alpha);
      const sinA = Math.sin(alpha);

      // Contact points on the semicircular caps
      const leftX = capsuleEdge - radius * (1 - cosA);
      const rightX = movingX + radius * (1 - cosA);
      const anchorTopY = radius * (1 - sinA);
      const anchorBotY = height - anchorTopY;

      // Waist grows smoothly from initial contact to full height
      const minWaist = Math.max(16, Math.round(height * 0.15));
      const easeW = Math.sin(alpha);
      const waist = minWaist + (height - minWaist) * easeW;

      if (alpha >= Math.PI / 2 - 0.001) {
        // FULLY COALESCED: strictly horizontal top and bottom, 100% flush
        bridgePath = `M ${leftX.toFixed(1)} 0 H ${rightX.toFixed(1)} V ${height} H ${leftX.toFixed(1)} Z`;
      } else {
        const waistTopY = (height - waist) / 2;
        const waistBotY = height - waistTopY;
        const midX = (leftX + rightX) / 2;
        const cp1x = leftX + (midX - leftX) * 0.45;
        const cp2x = midX - (midX - leftX) * 0.45;
        const cp3x = midX + (rightX - midX) * 0.45;
        const cp4x = rightX - (rightX - midX) * 0.45;

        bridgePath = [
          `M ${leftX.toFixed(1)} ${anchorTopY.toFixed(1)}`,
          `C ${cp1x.toFixed(1)} ${anchorTopY.toFixed(1)}, ${cp2x.toFixed(1)} ${waistTopY.toFixed(1)}, ${midX.toFixed(1)} ${waistTopY.toFixed(1)}`,
          `C ${cp3x.toFixed(1)} ${waistTopY.toFixed(1)}, ${cp4x.toFixed(1)} ${anchorTopY.toFixed(1)}, ${rightX.toFixed(1)} ${anchorTopY.toFixed(1)}`,
          `L ${rightX.toFixed(1)} ${anchorBotY.toFixed(1)}`,
          `C ${cp4x.toFixed(1)} ${anchorBotY.toFixed(1)}, ${cp3x.toFixed(1)} ${waistBotY.toFixed(1)}, ${midX.toFixed(1)} ${waistBotY.toFixed(1)}`,
          `C ${cp2x.toFixed(1)} ${waistBotY.toFixed(1)}, ${cp1x.toFixed(1)} ${anchorBotY.toFixed(1)}, ${leftX.toFixed(1)} ${anchorBotY.toFixed(1)}`,
          'Z',
        ].join(' ');
      }
    } else if (outgoingMovingId) {
      // Outgoing chip undock bridge
      const movingX = positions[outgoingMovingId] ?? 0;
      const dist = movingX - capsuleEdge;
      if (dist > 0.01 && dist <= maxBridgeDistance) {
        bridgePath = generateMetaballBridgePath(capsuleEdge, movingX, height / 2, height, maxBridgeDistance, 'undock');
      }
    }

    // Outgoing chip meniscus snap droplets (Frames 70-74)
    const recoilId = outgoingMovingId || movingId;
    if (recoilId) {
      const recoil = snapRecoil[recoilId] || 0;
      const recoilX = positions[recoilId] ?? 0;
      if (recoil > 0.4) {
        dropletLeft = generateDropletTipPath(capsuleEdge + recoil, height / 2, capsuleEdge, height, 'pointing-right');
        dropletRight = generateDropletTipPath(recoilX - recoil, height / 2, recoilX, height, 'pointing-left');
      }
    }

    return { bridgePath, dropletLeft, dropletRight };
  }, [movingId, outgoingMovingId, positions, targets, resultsWidth, height, maxBridgeDistance, radius, snapRecoil, inkState]);

  const capsuleSilhouette = generateCapsuleSilhouettePath(
    capsuleWidth,
    height,
    radius,
    dividerPositions,
    activeCapsuleHover ?? undefined
  );

  return (
    <div
      role="radiogroup"
      aria-label="Modalità di studio"
      onKeyDown={handleKeyDown}
      className={className}
      style={{
        position: 'relative',
        height: `${height}px`,
        width: `${totalWidth}px`,
        minWidth: `${totalWidth}px`,
        display: 'inline-flex',
        alignItems: 'center',
        userSelect: 'none',
        isolation: 'isolate',
        fontFamily: 'var(--sans)',
        outline: 'none',
      }}
    >
      {/* SVG Gooey Filter Definition (stdDeviation 6 identical to scratch) */}
      <GooeyFilterDef id={filterId} stdDeviation="6" />

      {/* =========================================================================
          LAYER 1: LIQUID SILHOUETTE CANVAS (GOOEY / METABALL FILTER)
          ========================================================================= */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: `${height}px`,
          pointerEvents: 'none',
          zIndex: 1,
          filter: isReduced ? 'none' : `url(#${filterId})`,
        }}
        aria-hidden="true"
      >
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: `${height}px`,
            overflow: 'visible',
          }}
        >
          {/* Active Unified Capsule Silhouette */}
          <path d={capsuleSilhouette} fill={COLOR_PALETTE.ink} />

          {/* Liquid fill of moving chip while mid-flight so bridge melts organically into it */}
          {movingId && (
            <g transform={`translate(${positions[movingId] ?? 0}, 0)`}>
              <path
                d={generateInactivePillPath(
                  chipWidths[movingId] || Math.round(height * 2),
                  height,
                  radius
                )}
                clipPath={`url(#clip-ink-${movingId})`}
                fill={COLOR_PALETTE.ink}
              />
            </g>
          )}

          {/* Dynamic Metaball Bridge between capsule and moving chip */}
          {bridgeData?.bridgePath && (
            <path d={bridgeData.bridgePath} fill={COLOR_PALETTE.ink} />
          )}

          {/* Snapping Meniscus Droplet Tips upon detachment */}
          {bridgeData?.dropletLeft && (
            <path d={bridgeData.dropletLeft} fill={COLOR_PALETTE.ink} />
          )}
          {bridgeData?.dropletRight && (
            <path d={bridgeData.dropletRight} fill={COLOR_PALETTE.ink} />
          )}
        </svg>
      </div>

      {/* =========================================================================
          LAYER 2: CRISP INTERACTIVE CONTENT (OUTSIDE GOOEY FILTER)
          ========================================================================= */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: `${height}px`,
          zIndex: 10,
        }}
      >
        {/* Results Badge Content (Counter + Label) */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: `${resultsWidth}px`,
            height: `${height}px`,
            display: 'flex',
            alignItems: 'center',
            paddingLeft: `${Math.round(height * 0.38)}px`,
            paddingRight: `${Math.round(height * 0.28)}px`,
            boxSizing: 'border-box',
            zIndex: 15,
            pointerEvents: 'none',
          }}
        >
          <RollerCounter
            count={count}
            label={label}
            digitHeight={Math.round(height * 0.52)}
            fontSize={counterFontSize}
            labelFontSize={labelFontSize}
            digitColor={COLOR_PALETTE.textActive}
            labelColor={COLOR_PALETTE.activeSecondary}
          />
        </div>

        {/* Vertical Divider */}
        <AnimatePresence>
          {dividerPositions.map((xPos) => {
            let opacity = 1;
            if (movingId && movingId === currentActiveId) {
              const movingTargetX = targets[movingId];
              if (Math.abs(xPos - movingTargetX) < 2) {
                const p = inkState[movingId]?.progress ?? 0;
                if (p < 0.35) opacity = 0;
                else opacity = Math.min(1, (p - 0.35) / 0.40);
              }
            }
            if (opacity <= 0.01) return null;

            return (
              <motion.div
                key={`capsule-divider-${xPos}`}
                initial={{ opacity: 0, scaleY: 0 }}
                animate={{ opacity, scaleY: 1 }}
                exit={{ opacity: 0, scaleY: 0 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                style={{
                  position: 'absolute',
                  left: `${xPos}px`,
                  top: `${Math.round(height * 0.25)}px`,
                  width: height >= 120 ? '3.5px' : '3px',
                  height: `${Math.round(height * 0.50)}px`,
                  backgroundColor: COLOR_PALETTE.divider,
                  borderRadius: '9999px',
                  zIndex: 25,
                  transformOrigin: 'center',
                  pointerEvents: 'none',
                }}
              />
            );
          })}
        </AnimatePresence>

        {/* Interactive Filter Chips in Spatial Display Order */}
        {displayOrder.map((id) => {
          const item = items.find((i) => i.id === id);
          if (!item) return null;

          const isActive = id === currentActiveId;
          const currentX = positions[id] ?? targets[id] ?? 0;
          const isDocked = isActive && isCurrentActiveDocked;
          const isMoving = movingId === id;
          const chipW = chipWidths[id] || 80;
          const ink = inkState[id] || { progress: isActive ? 1 : 0, direction: 'fill' };
          const hover = hoverStates[id] || { x: 0.5, y: 0.5, intensity: 0 };

          return (
            <div
              key={id}
              style={{
                position: 'absolute',
                left: `${currentX}px`,
                top: 0,
                width: `${chipW}px`,
                height: `${height}px`,
                zIndex: isMoving ? 50 : isDocked ? 20 : 10,
              }}
            >
              <ElasticChip
                chipRef={(el) => {
                  chipRefs.current[id] = el;
                }}
                id={id}
                label={item.label}
                isActive={isActive}
                isDocked={isDocked}
                isMoving={isMoving}
                width={chipW}
                height={height}
                fontSize={chipFontSize}
                inkProgress={ink.progress}
                inkDirection={ink.direction}
                hoverState={hover}
                onClick={() => selectMode(id, true)}
                onPointerEnter={(e) => handleChipPointerEnter(id, e)}
                onPointerMove={(e) => handleChipPointerMove(id, e)}
                onPointerLeave={() => handleChipPointerLeave(id)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
