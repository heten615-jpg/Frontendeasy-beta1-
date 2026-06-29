import type { VectorPoint } from '../../types';

export interface RawPoint {
  x: number;
  y: number;
}

export interface VectorBuildResult {
  x: number;
  y: number;
  width: number;
  height: number;
  points: VectorPoint[];
  path: string;
}

function fmt(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function distance(a: RawPoint, b: RawPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function simplifyFreehandPoints(points: RawPoint[], minDistance = 4): RawPoint[] {
  if (points.length <= 2) return points;
  const simplified: RawPoint[] = [points[0]];
  for (const point of points.slice(1, -1)) {
    if (distance(point, simplified[simplified.length - 1]) >= minDistance) simplified.push(point);
  }
  const last = points[points.length - 1];
  if (distance(last, simplified[simplified.length - 1]) > 0) simplified.push(last);
  return simplified;
}

export function smoothFreehandPoints(points: RawPoint[]): VectorPoint[] {
  const simplified = simplifyFreehandPoints(points);
  if (simplified.length <= 2) {
    return simplified.map(point => ({ ...point, curve: 'line' as const }));
  }
  return simplified.map((point, index) => {
    const prev = simplified[index - 1] ?? point;
    const next = simplified[index + 1] ?? point;
    const smoothing = 0.18;
    return {
      x: point.x,
      y: point.y,
      curve: index === 0 ? 'line' : 'cubic',
      handleIn: index === 0 ? undefined : {
        x: point.x - (next.x - prev.x) * smoothing,
        y: point.y - (next.y - prev.y) * smoothing,
      },
      handleOut: index === simplified.length - 1 ? undefined : {
        x: point.x + (next.x - prev.x) * smoothing,
        y: point.y + (next.y - prev.y) * smoothing,
      },
    };
  });
}

export function vectorPointsToPath(points: VectorPoint[]): string {
  if (!points.length) return '';
  const [first, ...rest] = points;
  const parts = [`M ${fmt(first.x)} ${fmt(first.y)}`];
  let prev = first;
  for (const point of rest) {
    if (point.curve === 'cubic' && (prev.handleOut || point.handleIn)) {
      const out = prev.handleOut ?? prev;
      const inn = point.handleIn ?? point;
      parts.push(`C ${fmt(out.x)} ${fmt(out.y)} ${fmt(inn.x)} ${fmt(inn.y)} ${fmt(point.x)} ${fmt(point.y)}`);
    } else {
      parts.push(`L ${fmt(point.x)} ${fmt(point.y)}`);
    }
    prev = point;
  }
  return parts.join(' ');
}

export function buildVectorFromWorldPoints(points: RawPoint[], mode: 'pen' | 'pencil'): VectorBuildResult | null {
  if (points.length < 2) return null;
  const minX = Math.min(...points.map(point => point.x));
  const minY = Math.min(...points.map(point => point.y));
  const maxX = Math.max(...points.map(point => point.x));
  const maxY = Math.max(...points.map(point => point.y));
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const local = points.map(point => ({ x: point.x - minX, y: point.y - minY }));
  const vectorPoints = mode === 'pencil'
    ? smoothFreehandPoints(local)
    : local.map((point, index) => ({ ...point, curve: index === 0 ? 'line' as const : 'line' as const }));
  return {
    x: minX,
    y: minY,
    width,
    height,
    points: vectorPoints,
    path: vectorPointsToPath(vectorPoints),
  };
}
