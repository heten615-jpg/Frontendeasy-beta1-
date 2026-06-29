import type { FrameElement, MediaFilters, MediaTransform } from '../../types';

export interface MediaPoint {
  x: number;
  y: number;
}

export type MediaCropAspectRatio = NonNullable<MediaTransform['cropAspectRatio']>;

export const DEFAULT_OBJECT_POSITION = '50% 50%';
export const DEFAULT_MEDIA_FILTERS = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  blur: 0,
  hue: 0,
} as const;

export type MediaFilterKey = keyof typeof DEFAULT_MEDIA_FILTERS;

const FILTER_LIMITS: Record<MediaFilterKey, { min: number; max: number }> = {
  brightness: { min: 0, max: 200 },
  contrast: { min: 0, max: 200 },
  saturation: { min: 0, max: 200 },
  blur: { min: 0, max: 40 },
  hue: { min: -180, max: 180 },
};

export function clampPercent(value: number, fallback = 50): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, value));
}

function formatPercent(value: number): string {
  const rounded = Math.round(clampPercent(value) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function formatCssNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

export function normalizeMediaFilterValue(key: MediaFilterKey, value: number | undefined): number {
  const limit = FILTER_LIMITS[key];
  return clampNumber(value ?? DEFAULT_MEDIA_FILTERS[key], limit.min, limit.max, DEFAULT_MEDIA_FILTERS[key]);
}

function normalizedFilters(filters: MediaFilters | undefined): MediaFilters | undefined {
  if (!filters) return undefined;
  const next: MediaFilters = {};
  for (const key of Object.keys(DEFAULT_MEDIA_FILTERS) as MediaFilterKey[]) {
    const value = normalizeMediaFilterValue(key, filters[key]);
    if (value !== DEFAULT_MEDIA_FILTERS[key]) next[key] = value;
  }
  return Object.keys(next).length ? next : undefined;
}

export function mediaFilterValue(transform: MediaTransform | undefined, key: MediaFilterKey): number {
  return normalizeMediaFilterValue(key, transform?.filters?.[key]);
}

export function cssFilterFromMediaFilters(filters: MediaFilters | undefined): string | undefined {
  const normalized = normalizedFilters(filters);
  if (!normalized) return undefined;
  const parts: string[] = [];
  if (normalized.brightness !== undefined) parts.push(`brightness(${formatCssNumber(normalized.brightness)}%)`);
  if (normalized.contrast !== undefined) parts.push(`contrast(${formatCssNumber(normalized.contrast)}%)`);
  if (normalized.saturation !== undefined) parts.push(`saturate(${formatCssNumber(normalized.saturation)}%)`);
  if (normalized.blur !== undefined) parts.push(`blur(${formatCssNumber(normalized.blur)}px)`);
  if (normalized.hue !== undefined) parts.push(`hue-rotate(${formatCssNumber(normalized.hue)}deg)`);
  return parts.join(' ');
}

export function cssFilterForElement(element: Pick<FrameElement, 'mediaTransform'>): string | undefined {
  return cssFilterFromMediaFilters(element.mediaTransform?.filters);
}

export function formatObjectPosition(point: MediaPoint): string {
  return `${formatPercent(point.x)}% ${formatPercent(point.y)}%`;
}

export function parseObjectPosition(value: string | undefined, fallback: MediaPoint = { x: 50, y: 50 }): MediaPoint {
  if (!value) return { ...fallback };
  const matches = value.match(/(-?\d+(?:\.\d+)?)%/g);
  if (!matches || matches.length < 2) return { ...fallback };
  return {
    x: clampPercent(parseFloat(matches[0])),
    y: clampPercent(parseFloat(matches[1])),
  };
}

export function objectPositionForElement(element: Pick<FrameElement, 'objectPosition' | 'mediaTransform'>): string {
  const focal = element.mediaTransform?.focalPoint;
  if (focal) {
    return formatObjectPosition({
      x: clampPercent(focal.x),
      y: clampPercent(focal.y),
    });
  }
  return formatObjectPosition(parseObjectPosition(element.objectPosition, { x: 50, y: 50 }));
}

function hasTransformData(transform: MediaTransform): boolean {
  return !!(
    transform.crop ||
    transform.cropAspectRatio ||
    transform.focalPoint ||
    transform.filters ||
    transform.fill ||
    transform.scale !== undefined ||
    transform.translateX !== undefined ||
    transform.translateY !== undefined ||
    transform.rotation ||
    transform.flipX ||
    transform.flipY
  );
}

export function imageCropPatch(
  objectPosition: string,
  existing?: MediaTransform,
): Partial<FrameElement> {
  const focalPoint = parseObjectPosition(objectPosition);
  return {
    objectFit: 'cover',
    objectPosition: formatObjectPosition(focalPoint),
    mediaTransform: {
      ...(existing ?? { kind: 'raster' as const }),
      kind: existing?.kind ?? 'raster',
      focalPoint,
      crop: existing?.crop ?? { unit: 'percent', x: 0, y: 0, width: 100, height: 100 },
      cropAspectRatio: existing?.cropAspectRatio ?? 'free',
      fill: existing?.fill ?? { mode: 'fill' },
    },
  };
}

function centeredCropForAspect(aspectRatio: MediaCropAspectRatio): MediaTransform['crop'] {
  if (aspectRatio === 'free') return { unit: 'percent', x: 0, y: 0, width: 100, height: 100 };
  const [w, h] = aspectRatio.split(':').map(Number);
  if (!w || !h) return { unit: 'percent', x: 0, y: 0, width: 100, height: 100 };
  const target = w / h;
  const box = target >= 1
    ? { width: 100, height: Math.min(100, 100 / target) }
    : { width: Math.min(100, 100 * target), height: 100 };
  return {
    unit: 'percent',
    x: Math.round((100 - box.width) * 500) / 1000,
    y: Math.round((100 - box.height) * 500) / 1000,
    width: Math.round(box.width * 1000) / 1000,
    height: Math.round(box.height * 1000) / 1000,
  };
}

export function mediaCropAspectPatch(
  aspectRatio: MediaCropAspectRatio,
  existing?: MediaTransform,
): Partial<FrameElement> {
  const focalPoint = existing?.focalPoint ?? { x: 50, y: 50 };
  return {
    objectFit: 'cover',
    objectPosition: formatObjectPosition(focalPoint),
    mediaTransform: {
      ...(existing ?? { kind: 'raster' as const }),
      kind: existing?.kind ?? 'raster',
      crop: centeredCropForAspect(aspectRatio),
      cropAspectRatio: aspectRatio,
      focalPoint,
      fill: { ...(existing?.fill ?? { mode: 'fill' }), mode: 'fill' },
    },
  };
}

export function resizeMediaToFitPatch(existing?: MediaTransform): Partial<FrameElement> {
  return {
    objectFit: 'contain',
    objectPosition: DEFAULT_OBJECT_POSITION,
    mediaTransform: {
      ...(existing ?? { kind: 'raster' as const }),
      kind: existing?.kind ?? 'raster',
      crop: undefined,
      cropAspectRatio: 'free',
      focalPoint: { x: 50, y: 50 },
      fill: { ...(existing?.fill ?? { mode: 'fit' }), mode: 'fit' },
      scale: 1,
      translateX: 0,
      translateY: 0,
    },
  };
}

export function mediaInternalTransformPatch(
  patch: Pick<MediaTransform, 'scale' | 'translateX' | 'translateY'>,
  existing?: MediaTransform,
): Partial<FrameElement> {
  return {
    mediaTransform: {
      ...(existing ?? { kind: 'raster' as const }),
      kind: existing?.kind ?? 'raster',
      ...patch,
    },
  };
}

export function resetImageCropPatch(element: Pick<FrameElement, 'mediaTransform'>): Partial<FrameElement> {
  if (!element.mediaTransform) {
    return {
      objectFit: 'cover',
      objectPosition: undefined,
      mediaTransform: undefined,
    };
  }
  const { crop: _crop, cropAspectRatio: _cropAspectRatio, focalPoint: _focalPoint, fill: _fill, scale: _scale, translateX: _translateX, translateY: _translateY, ...next } = element.mediaTransform;
  void _crop;
  void _cropAspectRatio;
  void _focalPoint;
  void _fill;
  void _scale;
  void _translateX;
  void _translateY;
  return {
    objectFit: 'cover',
    objectPosition: undefined,
    mediaTransform: hasTransformData(next) ? next : undefined,
  };
}

export function imageFilterPatch(
  key: MediaFilterKey,
  value: number,
  existing?: MediaTransform,
): Partial<FrameElement> {
  const next: MediaTransform = {
    ...(existing ?? { kind: 'raster' as const }),
    kind: existing?.kind ?? 'raster',
    filters: normalizedFilters({
      ...(existing?.filters ?? {}),
      [key]: value,
    }),
  };
  if (!next.filters) delete next.filters;
  return {
    mediaTransform: hasTransformData(next) ? next : undefined,
  };
}

export function resetImageFiltersPatch(element: Pick<FrameElement, 'mediaTransform'>): Partial<FrameElement> {
  if (!element.mediaTransform) return { mediaTransform: undefined };
  const { filters: _filters, ...next } = element.mediaTransform;
  void _filters;
  return {
    mediaTransform: hasTransformData(next) ? next : undefined,
  };
}

export function nextObjectPositionFromDrag(
  current: string | undefined,
  dx: number,
  dy: number,
  width: number,
  height: number,
): string {
  const start = parseObjectPosition(current);
  return formatObjectPosition({
    x: start.x + (dx / Math.max(1, width)) * 100,
    y: start.y + (dy / Math.max(1, height)) * 100,
  });
}
