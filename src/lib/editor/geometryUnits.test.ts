import { describe, expect, it } from 'vitest';
import type { FrameElement } from '../../types';
import { clearAuthoredGeometryOnPixelEdit, withPixelGeometryPatch } from './geometryUnits';

function element(overrides: Partial<FrameElement> = {}): FrameElement {
  return {
    id: 'el',
    type: 'section',
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    xCss: '50%',
    yCss: '2rem',
    widthCss: '10em',
    heightCss: '25%',
    content: '',
    color: '#fff',
    background: '#000',
    borderRadius: 0,
    fontSize: 16,
    fontWeight: '400',
    targetFrameId: null,
    ...overrides,
  };
}

describe('geometry unit invalidation', () => {
  it('clears authored CSS units for px-edited geometry fields only', () => {
    expect(clearAuthoredGeometryOnPixelEdit({ x: 20 })).toEqual({ x: 20, xCss: undefined });
    expect(clearAuthoredGeometryOnPixelEdit({ width: 120, widthCss: '50%' })).toEqual({ width: 120, widthCss: '50%' });
    expect(clearAuthoredGeometryOnPixelEdit({ y: 10, height: 80 })).toEqual({ y: 10, yCss: undefined, height: 80, heightCss: undefined });
  });

  it('prevents paste/align-style patches from exporting stale unit values', () => {
    expect(withPixelGeometryPatch(element(), { x: 24, y: 32 })).toMatchObject({
      x: 24,
      y: 32,
      xCss: undefined,
      yCss: undefined,
      widthCss: '10em',
      heightCss: '25%',
    });
  });
});
