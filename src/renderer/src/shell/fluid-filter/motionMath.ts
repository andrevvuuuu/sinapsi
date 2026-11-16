/**
 * Precision motion and geometry calculations for the Fluid Filter Bar micro-interaction.
 * Reconstructed 1:1 from frame-by-frame analysis of the ground truth video and reference photos.
 */

export interface Point {
  x: number;
  y: number;
}

export interface HoverState {
  x: number; // normalized 0 to 1 across width
  y: number; // normalized 0 to 1 across height
  intensity: number; // deformation magnitude [0, 1]
  isActive?: boolean;
}

export interface DividerGeometry {
  top: number;
  height: number;
  width: number;
}

export function getDividerGeometry(height: number): DividerGeometry {
  const isVideoScale = height >= 120;
  const divHeight = isVideoScale ? 45 : Math.round(height * (45 / 140));
  const divTop = (height - divHeight) / 2;
  const divWidth = isVideoScale ? 3.5 : 3.0;
  return {
    top: divTop,
    height: divHeight,
    width: divWidth,
  };
}

export function getCapsuleWaistDepth(height: number): number {
  return height >= 120 ? 2.5 : Math.max(1.0, Math.round((height / 140) * 2.5 * 10) / 10);
}

/**
 * Generates an SVG path for an inactive pill with multi-harmonic organic rubbery hover deformation.
 *
 * Uses smooth spline envelope modulation E(t) = sin^2(pi*t) with zero-tangent boundary conditions
 * at endpoints x0 = r and x1 = w - r. This guarantees that:
 * 1. Displacement at endpoints is strictly 0.
 * 2. Derivative (tangent dy/dx) at endpoints is strictly 0.
 * 3. C1 continuity with the semicircular end caps is preserved without kinks or self-intersection.
 *
 * @param width Pill width in px
 * @param height Pill height in px
 * @param radius Corner radius (typically height / 2)
 * @param hover Normalized hover position and intensity
 */
export function generateInactivePillPath(
  width: number,
  height: number,
  radius: number,
  hover?: { x: number; y: number; intensity: number; allowRecoil?: boolean },
  inset: number = 0
): string {
  const pad = inset;
  const w = width - pad;
  const h = height - pad;
  const r = Math.min(radius - pad, (height - 2 * pad) / 2, (width - 2 * pad) / 2);

  const x0 = pad + r;
  const x1 = Math.max(x0, width - pad - r);
  const span = x1 - x0;

  const isCanonical = !hover || (hover.allowRecoil ? Math.abs(hover.intensity) <= 0.001 : hover.intensity <= 0.001);

  if (isCanonical || span <= 0) {
    // Canonical perfect rounded pill
    return [
      `M ${x0} ${pad}`,
      `H ${x1}`,
      `A ${r} ${r} 0 0 1 ${w} ${pad + r}`,
      `V ${h - r}`,
      `A ${r} ${r} 0 0 1 ${x1} ${h}`,
      `H ${x0}`,
      `A ${r} ${r} 0 0 1 ${pad} ${h - r}`,
      `V ${pad + r}`,
      `A ${r} ${r} 0 0 1 ${x0} ${pad}`,
      'Z',
    ].join(' ');
  }

  const { x: hx, intensity } = hover;
  // Normalized cursor clamped for smooth wave centering
  const nx = Math.max(0.1, Math.min(0.9, hx));
  // Deformation scales with pill height (~9.6% of height, e.g. 7.7px at 80px, 13.5px at 140px)
  const maxDeform = (h * 0.096) * Math.min(1.2, intensity);

  // We sample top and bottom curves with multi-harmonic ripples matching Frame 1 & Frame 30
  // Top edge: primary wave near cursor with secondary harmonics
  const getTopY = (t: number): number => {
    // Envelope guarantees zero displacement and zero derivative at t=0 and t=1
    const env = Math.sin(Math.PI * t) ** 2;
    const wave =
      Math.sin(Math.PI * t) * (1.0 + 0.6 * Math.sin(2 * Math.PI * (t - nx))) +
      0.35 * Math.sin(3 * Math.PI * t);
    return pad + env * wave * maxDeform;
  };

  // Bottom edge: organic counter-phase gelatinous ripple
  const getBotY = (t: number): number => {
    const env = Math.sin(Math.PI * t) ** 2;
    const wave =
      Math.sin(Math.PI * t) * (1.0 - 0.45 * Math.cos(2 * Math.PI * (t - nx))) +
      0.3 * Math.sin(3 * Math.PI * t);
    return (height - pad) - env * wave * maxDeform * 0.9;
  };

  // Generate cubic Bézier segments along top (from x0 to x1)
  const steps = 4;
  const topSegments: string[] = [];
  for (let i = 0; i < steps; i++) {
    const tStart = i / steps;
    const tEnd = (i + 1) / steps;
    const tMid1 = tStart + (tEnd - tStart) / 3;
    const tMid2 = tStart + ((tEnd - tStart) * 2) / 3;

    const px1 = x0 + span * tMid1;
    const py1 = getTopY(tMid1);
    const px2 = x0 + span * tMid2;
    const py2 = getTopY(tMid2);
    const pxEnd = x0 + span * tEnd;
    const pyEnd = getTopY(tEnd);

    topSegments.push(`C ${px1.toFixed(1)} ${py1.toFixed(1)}, ${px2.toFixed(1)} ${py2.toFixed(1)}, ${pxEnd.toFixed(1)} ${pyEnd.toFixed(1)}`);
  }

  // Generate cubic Bézier segments along bottom (from x1 back to x0)
  const botSegments: string[] = [];
  for (let i = 0; i < steps; i++) {
    const tStart = 1 - i / steps;
    const tEnd = 1 - (i + 1) / steps;
    const tMid1 = tStart - (tStart - tEnd) / 3;
    const tMid2 = tStart - ((tStart - tEnd) * 2) / 3;

    const px1 = x0 + span * tMid1;
    const py1 = getBotY(tMid1);
    const px2 = x0 + span * tMid2;
    const py2 = getBotY(tMid2);
    const pxEnd = x0 + span * tEnd;
    const pyEnd = getBotY(tEnd);

    botSegments.push(`C ${px1.toFixed(1)} ${py1.toFixed(1)}, ${px2.toFixed(1)} ${py2.toFixed(1)}, ${pxEnd.toFixed(1)} ${pyEnd.toFixed(1)}`);
  }

  return [
    `M ${x0} ${pad}`,
    topSegments.join(' '),
    `A ${r} ${r} 0 0 1 ${w} ${pad + r}`,
    `V ${h - r}`,
    `A ${r} ${r} 0 0 1 ${x1} ${h}`,
    botSegments.join(' '),
    `A ${r} ${r} 0 0 1 ${pad} ${h - r}`,
    `V ${pad + r}`,
    `A ${r} ${r} 0 0 1 ${x0} ${pad}`,
    'Z',
  ].join(' ');
}

/**
 * Generates an SVG path for the unified capsule silhouette.
 *
 * Supports:
 * - Subtle permanent organic waist notches (~5px dip) at internal divider seams.
 * - Dynamic elastic waist pinch (~7px inward on top and bottom) at active hover cursor X.
 *
 * @param width Capsule total width in px
 * @param height Capsule height in px
 * @param radius Corner radius (typically height / 2)
 * @param dividerXPositions Seam X coordinates between docked chips
 * @param hover Active hover state with cursor X and intensity
 */
export function generateCapsuleSilhouettePath(
  width: number,
  height: number,
  radius: number,
  dividerXPositions: number[] = [],
  hover?: { x: number; y: number; intensity: number },
  notchDepth: number = 0
): string {
  const r = Math.min(radius, height / 2, width / 2);
  const w = width;
  const h = height;

  const x0 = r;
  const x1 = Math.max(r, w - r);

  const hasNotch = notchDepth > 0 && dividerXPositions && dividerXPositions.length > 0;
  const hasHover = hover && Math.abs(hover.intensity) > 0.001;

  if (!hasNotch && !hasHover) {
    return [
      `M ${x0} 0`,
      `H ${x1}`,
      `A ${r} ${r} 0 0 1 ${w} ${r}`,
      `V ${h - r}`,
      `A ${r} ${r} 0 0 1 ${x1} ${h}`,
      `H ${x0}`,
      `A ${r} ${r} 0 0 1 0 ${h - r}`,
      `V ${r}`,
      `A ${r} ${r} 0 0 1 ${x0} 0`,
      'Z',
    ].join(' ');
  }

  // Calculate top and bottom Y coordinates across X
  const notchRadius = Math.max(16, Math.round(h * 0.16));

  const getTopY = (x: number): number => {
    let dy = 0;
    if (notchDepth > 0) {
      for (const dx of dividerXPositions) {
        const dist = Math.abs(x - dx);
        if (dist < notchRadius) {
          dy = Math.max(dy, notchDepth * Math.cos((dist / notchRadius) * (Math.PI / 2)) ** 2);
        }
      }
    }
    // Dynamic hover pinch (Frame 55)
    if (hover && Math.abs(hover.intensity) > 0.001) {
      const hx = hover.x * width;
      const distH = Math.abs(x - hx);
      const pinchRadius = Math.max(30, h * 0.40);
      if (distH < pinchRadius) {
        dy += (h * 0.045) * hover.intensity * Math.cos((distH / pinchRadius) * (Math.PI / 2)) ** 2;
      }
    }
    if (dy < 0.001) dy = 0;
    return dy;
  };

  const getBotY = (x: number): number => {
    let dy = 0;
    if (notchDepth > 0) {
      for (const dx of dividerXPositions) {
        const dist = Math.abs(x - dx);
        if (dist < notchRadius) {
          dy = Math.max(dy, notchDepth * Math.cos((dist / notchRadius) * (Math.PI / 2)) ** 2);
        }
      }
    }
    if (hover && Math.abs(hover.intensity) > 0.001) {
      const hx = hover.x * width;
      const distH = Math.abs(x - hx);
      const pinchRadius = Math.max(30, h * 0.40);
      if (distH < pinchRadius) {
        dy += (h * 0.045) * hover.intensity * Math.cos((distH / pinchRadius) * (Math.PI / 2)) ** 2;
      }
    }
    if (dy < 0.001) dy = 0;
    return h - dy;
  };

  // Build sampled path with smooth quadratic curves
  const steps = Math.max(8, Math.round(width / 12));
  const topSegments: string[] = [];
  for (let i = 0; i < steps; i++) {
    const tStart = i / steps;
    const tEnd = (i + 1) / steps;
    const tMid = (tStart + tEnd) / 2;

    const pxStart = x0 + (x1 - x0) * tStart;
    const pxEnd = x0 + (x1 - x0) * tEnd;
    const pxMid = x0 + (x1 - x0) * tMid;

    const y0 = getTopY(pxStart);
    const yEnd = getTopY(pxEnd);
    const yMid = getTopY(pxMid);
    const pyCtrl = Math.max(0, 2 * yMid - 0.5 * (y0 + yEnd));

    topSegments.push(`Q ${pxMid.toFixed(1)} ${pyCtrl.toFixed(1)}, ${pxEnd.toFixed(1)} ${yEnd.toFixed(1)}`);
  }

  const botSegments: string[] = [];
  for (let i = 0; i < steps; i++) {
    const tStart = 1 - i / steps;
    const tEnd = 1 - (i + 1) / steps;
    const tMid = (tStart + tEnd) / 2;

    const pxStart = x0 + (x1 - x0) * tStart;
    const pxEnd = x0 + (x1 - x0) * tEnd;
    const pxMid = x0 + (x1 - x0) * tMid;

    const y0 = getBotY(pxStart);
    const yEnd = getBotY(pxEnd);
    const yMid = getBotY(pxMid);
    const pyCtrl = Math.min(h, 2 * yMid - 0.5 * (y0 + yEnd));

    botSegments.push(`Q ${pxMid.toFixed(1)} ${pyCtrl.toFixed(1)}, ${pxEnd.toFixed(1)} ${yEnd.toFixed(1)}`);
  }

  return [
    `M ${x0} 0`,
    topSegments.join(' '),
    `A ${r} ${r} 0 0 1 ${w} ${r}`,
    `V ${h - r}`,
    `A ${r} ${r} 0 0 1 ${x1} ${h}`,
    botSegments.join(' '),
    `A ${r} ${r} 0 0 1 0 ${h - r}`,
    `V ${r}`,
    `A ${r} ${r} 0 0 1 ${x0} 0`,
    'Z',
  ].join(' ');
}

/**
 * Backward-compatible wrapper for generateDeformedPillPath.
 */
export function generateDeformedPillPath(
  width: number,
  height: number,
  radius: number,
  hover?: { x: number; y: number; intensity: number; isActive?: boolean }
): string {
  if (hover?.isActive) {
    return generateCapsuleSilhouettePath(width, height, radius, [], hover);
  }
  return generateInactivePillPath(width, height, radius, hover);
}

/**
 * Generates an SVG path for the convex advancing ink wave front or concave receding drain front.
 *
 * Recreates Frame 38-40 (convex advancing ink) and Frame 66 (concave meniscus receding ink).
 *
 * @param width Pill width in px
 * @param height Pill height in px
 * @param progress Normalized progress [0, 1]
 * @param direction 'fill' (left-to-right advancing) or 'drain' (right-to-left receding)
 */
export function generateInkWavePath(
  width: number,
  height: number,
  progress: number,
  direction: 'fill' | 'drain' = 'fill'
): string {
  const p = Math.max(0, Math.min(1, progress));
  const h = height;
  const w = width;

  if (p <= 0.0001) {
    return `M 0 0 H 0 V ${h} H 0 Z`;
  }
  if (p >= 0.9999) {
    return `M 0 0 H ${w + 10} V ${h} H 0 Z`;
  }

  // Wave bulge amplitude (convex curve facing right)
  const bulge = Math.min(32, h * 0.36);

  if (direction === 'fill') {
    // Advancing left to right: leading edge bulges convexly forward into uninked space
    const leadX = -bulge + p * (w + 2 * bulge);
    const baseX = Math.max(0, leadX - bulge);

    return [
      `M 0 0`,
      `L ${baseX.toFixed(1)} 0`,
      `C ${leadX.toFixed(1)} ${(h * 0.2).toFixed(1)}, ${leadX.toFixed(1)} ${(h * 0.8).toFixed(1)}, ${baseX.toFixed(1)} ${h}`,
      `L 0 ${h}`,
      `Z`,
    ].join(' ');
  } else {
    // Receding right to left: trailing edge forms an organic fluid meniscus pulling back (Frame 66)
    // The center retreats faster than the contact points
    const leadX = -bulge + p * (w + 2 * bulge);
    const edgeX = Math.max(0, leadX);
    const meniscusCenter = Math.max(0, edgeX - bulge * 0.72);

    return [
      `M 0 0`,
      `L ${edgeX.toFixed(1)} 0`,
      `C ${meniscusCenter.toFixed(1)} ${(h * 0.25).toFixed(1)}, ${meniscusCenter.toFixed(1)} ${(h * 0.75).toFixed(1)}, ${edgeX.toFixed(1)} ${h}`,
      `L 0 ${h}`,
      `Z`,
    ].join(' ');
  }
}

/**
 * Generates an SVG path for the UNINKED portion of the chip (exact complement of generateInkWavePath).
 * Used to clip the base layer (chip background, border stroke, inactive text) so that nothing
 * is rendered to the left of the advancing ink wave front, eliminating hard border outlines
 * or opaque white fill from biting into the liquid bridge during coalescence.
 *
 * @param width Pill width in px
 * @param height Pill height in px
 * @param progress Normalized progress [0, 1]
 * @param direction 'fill' or 'drain'
 */
export function generateUninkedClipPath(
  width: number,
  height: number,
  progress: number,
  direction: 'fill' | 'drain' = 'fill'
): string {
  const p = Math.max(0, Math.min(1, progress));
  const h = height;
  const w = width;

  if (p <= 0.0001) {
    return `M -20 -20 H ${w + 40} V ${h + 40} H -20 Z`;
  }
  if (p >= 0.9999) {
    return `M 0 0 H 0 V 0 H 0 Z`;
  }

  const bulge = Math.min(32, h * 0.36);

  if (direction === 'fill') {
    const leadX = -bulge + p * (w + 2 * bulge);
    const baseX = Math.max(0, leadX - bulge);

    return [
      `M ${baseX.toFixed(1)} 0`,
      `L ${(w + 40).toFixed(1)} 0`,
      `L ${(w + 40).toFixed(1)} ${h}`,
      `L ${baseX.toFixed(1)} ${h}`,
      `C ${leadX.toFixed(1)} ${(h * 0.8).toFixed(1)}, ${leadX.toFixed(1)} ${(h * 0.2).toFixed(1)}, ${baseX.toFixed(1)} 0`,
      `Z`,
    ].join(' ');
  } else {
    const leadX = -bulge + p * (w + 2 * bulge);
    const edgeX = Math.max(0, leadX);
    const meniscusCenter = Math.max(0, edgeX - bulge * 0.72);

    return [
      `M ${edgeX.toFixed(1)} 0`,
      `L ${(w + 40).toFixed(1)} 0`,
      `L ${(w + 40).toFixed(1)} ${h}`,
      `L ${edgeX.toFixed(1)} ${h}`,
      `C ${meniscusCenter.toFixed(1)} ${(h * 0.75).toFixed(1)}, ${meniscusCenter.toFixed(1)} ${(h * 0.25).toFixed(1)}, ${edgeX.toFixed(1)} 0`,
      `Z`,
    ].join(' ');
  }
}

const f = (n: number): string => Number(n.toFixed(1)).toString();

/**
 * Generates a dynamic fluid catenoid metaball bridge path between two adjacent capsules.
 * Reconstructed from empirical measurements of Frame 34 & Frame 36.
 *
 * @param x1 Right edge of left capsule
 * @param x2 Left edge of right capsule
 * @param y Center Y of capsules
 * @param height Capsule height
 * @param maxBridgeDistance Maximum distance before bridge tears off (default: ~105% of height)
 */
export function generateMetaballBridgePath(
  x1: number,
  x2: number,
  y: number,
  height: number,
  maxBridgeDistance?: number,
  direction?: 'dock' | 'undock'
): string | null {
  if (direction) {
    const leftAnchorX = Math.min(x1, x2);
    const rightAnchorX = Math.max(x1, x2);
    const dist = rightAnchorX - leftAnchorX;

    if (dist <= 0.01) {
      return null;
    }

    const defaultMaxDist = direction === 'dock'
      ? Math.round(height * 0.39) // ~55px at 140px
      : Math.round(height * 0.485); // ~68px at 140px (neck thinning down to 40px)
    const maxDist = maxBridgeDistance ?? defaultMaxDist;

    if (dist > maxDist) {
      return null;
    }

    const normalizedDist = dist / maxDist;

    // Catenoid neck thinning profile calibrated to video ground truth
    let waist: number;
    if (direction === 'dock') {
      // Frames 34-37: 18px at F34 -> 52px at F35 -> 87px at F36 -> 125px at F37 -> 142px at F38
      const u = normalizedDist;
      waist = height * (1 - Math.pow(u, 0.75)) * 0.87 + 18 * (1 - u);
    } else {
      // Frames 65-71: 67px at F65 -> 64px at F68 -> 40px at F69 -> Rupture at F70-71
      const ruptureWaist = Math.round(height * 0.285); // 40px at 140px height
      const u = normalizedDist;
      waist = (height - ruptureWaist) * (1 - Math.pow(u, 0.65)) + ruptureWaist;
      if (waist < ruptureWaist) {
        return null; // Spontaneous meniscus snap
      }
    }

    const halfHeight = height / 2;
    const halfWaist = waist / 2;

    const topY1 = y - halfHeight;
    const botY1 = y + halfHeight;
    const topY2 = y - halfHeight;
    const botY2 = y + halfHeight;

    const midX = (leftAnchorX + rightAnchorX) / 2;
    const waistTopY = y - halfWaist;
    const waistBotY = y + halfWaist;

    const cp1x = leftAnchorX + dist * 0.22;
    const cp2x = midX - dist * 0.18;
    const cp3x = midX + dist * 0.18;
    const cp4x = rightAnchorX - dist * 0.22;

    return [
      `M ${f(leftAnchorX)} ${f(topY1)}`,
      `C ${f(cp1x)} ${f(topY1)}, ${f(cp2x)} ${f(waistTopY)}, ${f(midX)} ${f(waistTopY)}`,
      `C ${f(cp3x)} ${f(waistTopY)}, ${f(cp4x)} ${f(topY2)}, ${f(rightAnchorX)} ${f(topY2)}`,
      `L ${f(rightAnchorX)} ${f(botY2)}`,
      `C ${f(cp4x)} ${f(botY2)}, ${f(cp3x)} ${f(waistBotY)}, ${f(midX)} ${f(waistBotY)}`,
      `C ${f(cp2x)} ${f(waistBotY)}, ${f(cp1x)} ${f(botY1)}, ${f(leftAnchorX)} ${f(botY1)}`,
      'Z',
    ].join(' ');
  }

  // Legacy / Default directional mode (Frame 34 fitted power-law)
  const maxDist = maxBridgeDistance ?? Math.round(height * 1.05);
  const dist = x2 - x1;

  if (dist <= 0) {
    return null;
  }
  if (dist > maxDist) {
    return null;
  }

  const normalizedDist = dist / maxDist;
  const minWaist = Math.max(12, height * 0.14);
  const waist = Math.max(minWaist, height * (1 - Math.pow(normalizedDist, 0.58)) * 0.88 + minWaist * (1 - normalizedDist));

  const halfHeight = height / 2;
  const halfWaist = waist / 2;

  const leftAnchorX = x1;
  const rightAnchorX = x2;

  const topY1 = y - halfHeight;
  const botY1 = y + halfHeight;
  const topY2 = y - halfHeight;
  const botY2 = y + halfHeight;

  const midX = (x1 + x2) / 2;
  const waistTopY = y - halfWaist;
  const waistBotY = y + halfWaist;

  const cp1x = x1 + dist * 0.22;
  const cp2x = midX - dist * 0.18;
  const cp3x = midX + dist * 0.18;
  const cp4x = x2 - dist * 0.22;

  return [
    `M ${f(leftAnchorX)} ${f(topY1)}`,
    `C ${f(cp1x)} ${f(topY1)}, ${f(cp2x)} ${f(waistTopY)}, ${f(midX)} ${f(waistTopY)}`,
    `C ${f(cp3x)} ${f(waistTopY)}, ${f(cp4x)} ${f(topY2)}, ${f(rightAnchorX)} ${f(topY2)}`,
    `L ${f(rightAnchorX)} ${f(botY2)}`,
    `C ${f(cp4x)} ${f(botY2)}, ${f(cp3x)} ${f(waistBotY)}, ${f(midX)} ${f(waistBotY)}`,
    `C ${f(cp2x)} ${f(waistBotY)}, ${f(cp1x)} ${f(botY1)}, ${f(leftAnchorX)} ${f(botY1)}`,
    'Z',
  ].join(' ');
}

/**
 * Generates an SVG path for a pointed meniscus droplet tip that forms on detachment/snap.
 *
 * Recreates Frame 70: upon bridge snap, both the left capsule and right chip exhibit
 * an elastic pointed droplet extending toward the break point before damping back into the smooth cap.
 *
 * @param tipX X position of the droplet tip apex
 * @param tipY Y position of the droplet tip apex (usually center Y)
 * @param baseX X position of the pill boundary from which droplet emerges
 * @param height Height of the pill
 * @param _direction 'pointing-right' or 'pointing-left'
 */
export function generateDropletTipPath(
  tipX: number,
  tipY: number,
  baseX: number,
  height: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for parity with the scratch signature
  _direction: 'pointing-right' | 'pointing-left' = 'pointing-right'
): string {
  const deltaX = tipX - baseX;

  if (Math.abs(deltaX) < 0.5) {
    return '';
  }

  // Base vertical span is centered around equator (height / 2), matching Frame 70 measurements
  const baseRadius = Math.max(14, height * 0.22);
  const topY = tipY - baseRadius;
  const botY = tipY + baseRadius;

  // Sharp, organic cusp pulling towards tipX
  return [
    `M ${f(baseX)} ${f(topY)}`,
    `C ${f(baseX + deltaX * 0.45)} ${f(topY + baseRadius * 0.35)}, ${f(tipX - deltaX * 0.15)} ${f(tipY - 3)}, ${f(tipX)} ${f(tipY)}`,
    `C ${f(tipX - deltaX * 0.15)} ${f(tipY + 3)}, ${f(baseX + deltaX * 0.45)} ${f(botY - baseRadius * 0.35)}, ${f(baseX)} ${f(botY)}`,
    'Z',
  ].join(' ');
}
