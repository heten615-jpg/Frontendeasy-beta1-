import { describe, expect, it } from 'vitest';
import { ellipsePath, roundedPolygonPath, roundedStarPath, shapePath } from './shapeSvg';

describe('shape svg geometry', () => {
  it('exports full ellipse and pie-arc paths', () => {
    expect(ellipsePath(100, 80, 0, 360)).toContain('A 50 40');
    const arc = ellipsePath(100, 80, 0, 90);
    expect(arc).toContain('M 50 40 L 100 40');
    expect(arc).toContain('A 50 40 0 0 1 50 80 Z');
  });

  it('rounds polygon and star corners with quadratic curves', () => {
    expect(roundedPolygonPath(100, 100, 5, 12)).toContain('Q');
    expect(roundedStarPath(120, 120, 5, 0.45, 8)).toContain('Q');
    expect(shapePath('polygon', 100, 100, 5, undefined, 10)).toContain('Q');
  });
});
