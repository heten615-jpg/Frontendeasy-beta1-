import { describe, expect, it } from 'vitest';
import { buildVectorFromWorldPoints, smoothFreehandPoints, vectorPointsToPath } from './vectorPath';

describe('vector path foundation', () => {
  it('builds line paths for pen points with local coordinates', () => {
    const result = buildVectorFromWorldPoints([{ x: 10, y: 20 }, { x: 110, y: 70 }], 'pen');
    expect(result).toMatchObject({ x: 10, y: 20, width: 100, height: 50 });
    expect(result?.path).toBe('M 0 0 L 100 50');
  });

  it('smooths freehand points into cubic vector data', () => {
    const points = smoothFreehandPoints([
      { x: 0, y: 0 },
      { x: 20, y: 10 },
      { x: 40, y: 0 },
      { x: 60, y: 16 },
    ]);
    expect(points.some(point => point.curve === 'cubic')).toBe(true);
    expect(vectorPointsToPath(points)).toContain('C');
  });
});
