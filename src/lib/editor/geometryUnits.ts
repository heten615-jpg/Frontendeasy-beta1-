import type { FrameElement } from '../../types';

type GeometryKey = 'x' | 'y' | 'width' | 'height';
type GeometryCssKey = 'xCss' | 'yCss' | 'widthCss' | 'heightCss';

const CSS_KEY: Record<GeometryKey, GeometryCssKey> = {
  x: 'xCss',
  y: 'yCss',
  width: 'widthCss',
  height: 'heightCss',
};

/**
 * Canvas geometry is stored as px numbers. When a pixel edit changes one of
 * those numbers directly, any previously-authored CSS unit must be cleared so
 * HTML export cannot keep emitting stale `50%`/`2rem` values.
 */
export function clearAuthoredGeometryOnPixelEdit(updates: Partial<FrameElement>): Partial<FrameElement> {
  const patch: Partial<FrameElement> = { ...updates };
  (Object.keys(CSS_KEY) as GeometryKey[]).forEach((key) => {
    const cssKey = CSS_KEY[key];
    if (key in updates && !(cssKey in updates)) patch[cssKey] = undefined;
  });
  return patch;
}

export function withPixelGeometryPatch(
  element: FrameElement,
  updates: Partial<Pick<FrameElement, GeometryKey>>,
): FrameElement {
  return { ...element, ...clearAuthoredGeometryOnPixelEdit(updates) };
}
