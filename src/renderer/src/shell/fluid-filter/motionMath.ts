/**
 * Precision motion and geometry calculations for the Fluid Filter Bar micro-interaction.
 * Reconstructed 1:1 from frame-by-frame analysis of the ground truth video.
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
  hover?: { x: number; y: number; intensity: number }
): string {
  const r = Math.min(radius, height / 2, width / 2);
  const w = width;
  const h = height;

  const x0 = r;
  const x1 = Math.max(r, w - r);
  const span = x1 - x0;

  if (!hover || hover.intensity <= 0.001 || span <= 0) {
    // Canonical perfect rounded pill
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

  const { x: hx, intensity } = hover;
  // Normalized cursor clamped for smooth wave centering
  const nx = Math.max(0.1, Math.min(0.9, hx));
  const maxDeform = 13.5 * intensity;

  // We sample top and bottom curves with multi-harmonic ripples matching Frame 1 & Frame 30
  // Top edge: primary wave near cursor with secondary harmonics
  const getTopY = (t: number): number => {
    // Envelope guarantees zero displacement and zero derivative at t=0 and t=1
    const env = Math.sin(Math.PI * t) ** 2;
    const wave =
      Math.sin(Math.PI * t) * (1.0 + 0.6 * Math.sin(2 * Math.PI * (t - nx))) +
      0.35 * Math.sin(3 * Math.PI * t);
    return env * wave * maxDeform;
  };

  // Bottom edge: organic counter-phase gelatinous ripple
  const getBotY = (t: number): number => {
    const env = Math.sin(Math.PI * t) ** 2;
    const wave =
      Math.sin(Math.PI * t) * (1.0 - 0.45 * Math.cos(2 * Math.PI * (t - nx))) +
      0.3 * Math.sin(3 * Math.PI * t);
    return h - env * wave * maxDeform * 0.9;
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
 * Generates an SVG path for the unified black capsule silhouette.
 *
 * Supports:
 * - Subtle permanent waist notches (~3px) at internal divider seams.
 * - Dynamic elastic waist pinch (~7px inward on top and bottom) at active hover cursor X.
 */
export function generateCapsuleSilhouettePath(
  width: number,
  height: number,
  radius: number,
  dividerXPositions: number[] = [],
  hover?: { x: number; y: number; intensity: number }
): string {
  const r = Math.min(radius, height / 2, width / 2);
  const w = width;
  const h = height;

  const x0 = r;
  const x1 = Math.max(r, w - r);

  if ((!dividerXPositions || dividerXPositions.length === 0) && (!hover || hover.intensity <= 0.001)) {
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
  const getTopY = (x: number): number => {
    let dy = 0;
    // Permanent divider waist notches (~2.5px)
    for (const dx of dividerXPositions) {
      const dist = Math.abs(x - dx);
      if (dist < 28) {
        dy = Math.max(dy, 2.8 * Math.cos((dist / 28) * (Math.PI / 2)) ** 2);
      }
    }
    // Dynamic hover pinch
    if (hover && hover.intensity > 0.001) {
      const hx = hover.x * width;
      const distH = Math.abs(x - hx);
      if (distH < 45) {
        dy += 6.5 * hover.intensity * Math.cos((distH / 45) * (Math.PI / 2)) ** 2;
      }
    }
    return dy;
  };

  const getBotY = (x: number): number => {
    let dy = 0;
    for (const dx of dividerXPositions) {
      const dist = Math.abs(x - dx);
      if (dist < 28) {
        dy = Math.max(dy, 2.8 * Math.cos((dist / 28) * (Math.PI / 2)) ** 2);
      }
    }
    if (hover && hover.intensity > 0.001) {
      const hx = hover.x * width;
      const distH = Math.abs(x - hx);
      if (distH < 45) {
        dy += 6.5 * hover.intensity * Math.cos((distH / 45) * (Math.PI / 2)) ** 2;
      }
    }
    return h - dy;
  };

  // Build sampled path with smooth transitions
  const steps = Math.max(6, Math.round(width / 25));
  const topSegments: string[] = [];
  for (let i = 0; i < steps; i++) {
    const tStart = i / steps;
    const tEnd = (i + 1) / steps;
    const tMid = (tStart + tEnd) / 2;

    const pxEnd = x0 + (x1 - x0) * tEnd;
    const pxMid = x0 + (x1 - x0) * tMid;

    const pyMid = getTopY(pxMid);
    const pyEnd = getTopY(pxEnd);

    topSegments.push(`Q ${pxMid.toFixed(1)} ${pyMid.toFixed(1)}, ${pxEnd.toFixed(1)} ${pyEnd.toFixed(1)}`);
  }

  const botSegments: string[] = [];
  for (let i = 0; i < steps; i++) {
    const tStart = 1 - i / steps;
    const tEnd = 1 - (i + 1) / steps;
    const tMid = (tStart + tEnd) / 2;

    const pxEnd = x0 + (x1 - x0) * tEnd;
    const pxMid = x0 + (x1 - x0) * tMid;

    const pyMid = getBotY(pxMid);
    const pyEnd = getBotY(pxEnd);

    botSegments.push(`Q ${pxMid.toFixed(1)} ${pyMid.toFixed(1)}, ${pxEnd.toFixed(1)} ${pyEnd.toFixed(1)}`);
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
  const bulge = Math.min(32, h * 0.38);

  if (direction === 'fill') {
    // Advancing left to right: leading edge bulges convexly forward into uninked space
    const leadX = -bulge + p * (w + 2 * bulge);
    const baseX = Math.max(0, leadX - bulge);

    return [
      `M 0 0`,
      `L ${baseX} 0`,
      `C ${leadX} ${h * 0.2}, ${leadX} ${h * 0.8}, ${baseX} ${h}`,
      `L 0 ${h}`,
      `Z`,
    ].join(' ');
  } else {
    // Receding right to left: trailing edge forms an organic fluid meniscus pulling back
    // As seen in frame 66, the center of fluid retreats faster than the contact points
    const leadX = -bulge + p * (w + 2 * bulge);
    const edgeX = Math.max(0, leadX);
    const meniscusCenter = Math.max(0, edgeX - bulge * 0.7);

    return [
      `M 0 0`,
      `L ${edgeX} 0`,
      `C ${meniscusCenter} ${h * 0.25}, ${meniscusCenter} ${h * 0.75}, ${edgeX} ${h}`,
      `L 0 ${h}`,
      `Z`,
    ].join(' ');
  }
}

/**
 * Generates a dynamic fluid metaball bridge path between two adjacent capsules.
 *
 * @param x1 Right edge of left capsule
 * @param x2 Left edge of right capsule
 * @param y Center Y of capsules
 * @param height Capsule height
 * @param maxBridgeDistance Maximum distance before bridge tears off (default: 80px)
 */
export function generateMetaballBridgePath(
  x1: number,
  x2: number,
  y: number,
  height: number,
  maxBridgeDistance = 80
): string | null {
  const dist = x2 - x1;
  if (dist <= 0) {
    return null;
  }
  if (dist > maxBridgeDistance) {
    return null;
  }

  const normalizedDist = dist / maxBridgeDistance;
  const minWaist = 14;
  const waist = Math.max(minWaist, height * (1 - Math.pow(normalizedDist, 0.65)));

  const halfHeight = height / 2;
  const halfWaist = waist / 2;

  const topY1 = y - halfHeight;
  const botY1 = y + halfHeight;
  const topY2 = y - halfHeight;
  const botY2 = y + halfHeight;

  const midX = (x1 + x2) / 2;
  const waistTopY = y - halfWaist;
  const waistBotY = y + halfWaist;

  return [
    `M ${x1} ${topY1}`,
    `C ${x1 + dist * 0.35} ${topY1}, ${midX - dist * 0.25} ${waistTopY}, ${midX} ${waistTopY}`,
    `C ${midX + dist * 0.25} ${waistTopY}, ${x2 - dist * 0.35} ${topY2}, ${x2} ${topY2}`,
    `L ${x2} ${botY2}`,
    `C ${x2 - dist * 0.35} ${botY2}, ${midX + dist * 0.25} ${waistBotY}, ${midX} ${waistBotY}`,
    `C ${midX - dist * 0.25} ${waistBotY}, ${x1 + dist * 0.35} ${botY1}, ${x1} ${botY1}`,
    'Z',
  ].join(' ');
}

/**
 * Generates an SVG path for a pointed meniscus droplet tip that forms on detachment/snap.
 *
 * Recreates Frame 70: upon bridge snap, both the left capsule and right chip exhibit
 * an elastic pointed droplet extending toward the break point before damping back to a smooth arc.
 *
 * @param tipX X position of the droplet tip apex
 * @param tipY Y position of the droplet tip apex (usually center Y)
 * @param baseX X position of the pill boundary from which droplet emerges
 * @param height Height of the pill
 * @param direction 'pointing-right' or 'pointing-left'
 */
export function generateDropletTipPath(
  tipX: number,
  tipY: number,
  baseX: number,
  height: number,
  _direction: 'pointing-right' | 'pointing-left' = 'pointing-right'
): string {
  const halfH = height / 2;
  const topY = tipY - halfH;
  const botY = tipY + halfH;
  const deltaX = tipX - baseX;

  if (Math.abs(deltaX) < 1) {
    return '';
  }

  return [
    `M ${baseX} ${topY}`,
    `C ${baseX + deltaX * 0.3} ${topY + halfH * 0.3}, ${tipX - deltaX * 0.2} ${tipY - 4}, ${tipX} ${tipY}`,
    `C ${tipX - deltaX * 0.2} ${tipY + 4}, ${baseX + deltaX * 0.3} ${botY - halfH * 0.3}, ${baseX} ${botY}`,
    'Z',
  ].join(' ');
}
