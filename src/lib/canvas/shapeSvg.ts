/**
 * SVG path generators for vector shapes (item 45) — arrow, regular polygon, star.
 *
 * All return a `d` attribute string for an `<path>` inscribed in the box
 * `0,0 → w,h`. The caller wraps in `<svg viewBox="0 0 w h">` so the path
 * stays crisp at any zoom.
 *
 * Coordinates use float values; rounding is the caller's call.
 */

/**
 * Right-pointing arrow with a triangular head occupying ~30% of the width.
 * Shaft height is ~40% of the box height, centered vertically.
 */
export function arrowPath(w: number, h: number): string {
  if (w <= 0 || h <= 0) return '';
  const headW = Math.min(w * 0.32, h);
  const shaftEnd = w - headW;
  const shaftH = h * 0.4;
  const yMid = h / 2;
  const shaftTop = yMid - shaftH / 2;
  const shaftBot = yMid + shaftH / 2;
  return [
    `M 0 ${shaftTop}`,
    `L ${shaftEnd} ${shaftTop}`,
    `L ${shaftEnd} 0`,
    `L ${w} ${yMid}`,
    `L ${shaftEnd} ${h}`,
    `L ${shaftEnd} ${shaftBot}`,
    `L 0 ${shaftBot}`,
    `Z`,
  ].join(' ');
}

/**
 * Regular N-gon inscribed in the box. The first vertex sits at the top centre,
 * other vertices step clockwise. N must be 3..12; out-of-range values clamp.
 */
export function polygonPath(w: number, h: number, sides = 5): string {
  return pointsPath(polygonPoints(w, h, sides));
}

function polygonPoints(w: number, h: number, sides = 5): Array<{ x: number; y: number }> {
  const n = Math.max(3, Math.min(12, Math.round(sides)));
  const cx = w / 2;
  const cy = h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(angle) * rx;
    const y = cy + Math.sin(angle) * ry;
    pts.push({ x, y });
  }
  return pts;
}

/**
 * Star with N outer points, alternating with N inner points whose radius is
 * `innerRatio * outer` (0..1; 0.5 is the classic 5-point star look).
 */
export function starPath(w: number, h: number, points = 5, innerRatio = 0.5): string {
  return pointsPath(starPoints(w, h, points, innerRatio));
}

function starPoints(w: number, h: number, points = 5, innerRatio = 0.5): Array<{ x: number; y: number }> {
  const n = Math.max(3, Math.min(12, Math.round(points)));
  const ratio = Math.max(0.1, Math.min(0.9, innerRatio));
  const cx = w / 2;
  const cy = h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const total = n * 2;
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < total; i++) {
    const r = i % 2 === 0 ? 1 : ratio;
    const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(angle) * rx * r;
    const y = cy + Math.sin(angle) * ry * r;
    pts.push({ x, y });
  }
  return pts;
}

function fmt(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, '');
}

function pointsPath(points: Array<{ x: number; y: number }>): string {
  if (!points.length) return '';
  return `M ${points.map(point => `${fmt(point.x)} ${fmt(point.y)}`).join(' L ')} Z`;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function toward(from: { x: number; y: number }, to: { x: number; y: number }, amount: number): { x: number; y: number } {
  const length = dist(from, to) || 1;
  const t = Math.min(1, amount / length);
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  };
}

function roundedPointsPath(points: Array<{ x: number; y: number }>, radius = 0): string {
  const r = Math.max(0, radius);
  if (points.length < 3 || r <= 0) return pointsPath(points);
  const parts: string[] = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[(i - 1 + points.length) % points.length];
    const point = points[i];
    const next = points[(i + 1) % points.length];
    const maxRadius = Math.min(dist(point, prev), dist(point, next)) / 2;
    const corner = Math.min(r, maxRadius);
    const start = toward(point, prev, corner);
    const end = toward(point, next, corner);
    parts.push(`${i === 0 ? 'M' : 'L'} ${fmt(start.x)} ${fmt(start.y)}`);
    parts.push(`Q ${fmt(point.x)} ${fmt(point.y)} ${fmt(end.x)} ${fmt(end.y)}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

export function roundedPolygonPath(w: number, h: number, sides = 5, radius = 0): string {
  return roundedPointsPath(polygonPoints(w, h, sides), radius);
}

export function roundedStarPath(w: number, h: number, points = 5, innerRatio = 0.5, radius = 0): string {
  return roundedPointsPath(starPoints(w, h, points, innerRatio), radius);
}

function normalizeAngle(value: number | undefined, fallback: number): number {
  const raw = Number.isFinite(value) ? Number(value) : fallback;
  return ((raw % 360) + 360) % 360;
}

function pointOnEllipse(w: number, h: number, degrees: number): { x: number; y: number } {
  const angle = degrees * Math.PI / 180;
  return {
    x: w / 2 + Math.cos(angle) * w / 2,
    y: h / 2 + Math.sin(angle) * h / 2,
  };
}

export function ellipsePath(w: number, h: number, start = 0, end = 360): string {
  if (w <= 0 || h <= 0) return '';
  const a0 = normalizeAngle(start, 0);
  const rawSpan = Math.abs((end ?? 360) - (start ?? 0));
  if (rawSpan >= 359.5 || normalizeAngle(end, 360) === a0) {
    const rx = w / 2;
    const ry = h / 2;
    return `M ${fmt(rx)} 0 A ${fmt(rx)} ${fmt(ry)} 0 1 1 ${fmt(rx)} ${fmt(h)} A ${fmt(rx)} ${fmt(ry)} 0 1 1 ${fmt(rx)} 0 Z`;
  }
  const a1 = normalizeAngle(end, 360);
  const span = ((a1 - a0 + 360) % 360) || 360;
  const largeArc = span > 180 ? 1 : 0;
  const p0 = pointOnEllipse(w, h, a0);
  const p1 = pointOnEllipse(w, h, a1);
  return `M ${fmt(w / 2)} ${fmt(h / 2)} L ${fmt(p0.x)} ${fmt(p0.y)} A ${fmt(w / 2)} ${fmt(h / 2)} 0 ${largeArc} 1 ${fmt(p1.x)} ${fmt(p1.y)} Z`;
}

/** Picks the right path generator for a `shapeKind`. Returns '' when unknown. */
export function shapePath(
  kind: 'arrow' | 'ellipse' | 'polygon' | 'star' | undefined,
  w: number,
  h: number,
  sides?: number,
  innerRatio?: number,
  cornerRadius?: number,
  arcStart?: number,
  arcEnd?: number,
): string {
  if (!kind) return '';
  if (kind === 'arrow') return arrowPath(w, h);
  if (kind === 'ellipse') return ellipsePath(w, h, arcStart ?? 0, arcEnd ?? 360);
  if (kind === 'polygon') return roundedPolygonPath(w, h, sides ?? 5, cornerRadius ?? 0);
  if (kind === 'star') return roundedStarPath(w, h, sides ?? 5, innerRatio ?? 0.5, cornerRadius ?? 0);
  return '';
}
