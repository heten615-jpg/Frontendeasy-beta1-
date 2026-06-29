import { describe, expect, it } from 'vitest';
import {
  cssFilterForElement,
  DEFAULT_OBJECT_POSITION,
  imageFilterPatch,
  formatObjectPosition,
  imageCropPatch,
  mediaCropAspectPatch,
  mediaFilterValue,
  mediaInternalTransformPatch,
  nextObjectPositionFromDrag,
  objectPositionForElement,
  parseObjectPosition,
  resizeMediaToFitPatch,
  resetImageCropPatch,
  resetImageFiltersPatch,
} from './mediaTransforms';

describe('media transform helpers', () => {
  it('parses and clamps object-position percentages', () => {
    expect(parseObjectPosition('72% 28%')).toEqual({ x: 72, y: 28 });
    expect(parseObjectPosition('-12% 140%')).toEqual({ x: 0, y: 100 });
    expect(parseObjectPosition('left center')).toEqual({ x: 50, y: 50 });
  });

  it('formats object-position values predictably', () => {
    expect(formatObjectPosition({ x: 72.25, y: 28.26 })).toBe('72.3% 28.3%');
    expect(formatObjectPosition({ x: 50, y: 50 })).toBe(DEFAULT_OBJECT_POSITION);
  });

  it('prefers mediaTransform focal point over legacy objectPosition', () => {
    expect(objectPositionForElement({
      objectPosition: '10% 10%',
      mediaTransform: { kind: 'raster', focalPoint: { x: 76, y: 24 } },
    })).toBe('76% 24%');
  });

  it('builds a non-destructive crop patch with object-fit cover', () => {
    expect(imageCropPatch('80% 20%')).toMatchObject({
      objectFit: 'cover',
      objectPosition: '80% 20%',
      mediaTransform: {
        kind: 'raster',
        crop: { unit: 'percent', x: 0, y: 0, width: 100, height: 100 },
        cropAspectRatio: 'free',
        focalPoint: { x: 80, y: 20 },
        fill: { mode: 'fill' },
      },
    });
  });

  it('creates aspect-ratio crop and resize-to-fit patches without losing transform metadata', () => {
    const aspect = mediaCropAspectPatch('16:9', { kind: 'raster', filters: { brightness: 120 }, scale: 1.5 });
    expect(aspect).toMatchObject({
      objectFit: 'cover',
      mediaTransform: {
        kind: 'raster',
        cropAspectRatio: '16:9',
        crop: { unit: 'percent', x: 0, y: 21.875, width: 100, height: 56.25 },
        filters: { brightness: 120 },
        scale: 1.5,
        fill: { mode: 'fill' },
      },
    });

    const fit = resizeMediaToFitPatch(aspect.mediaTransform);
    expect(fit).toMatchObject({
      objectFit: 'contain',
      objectPosition: '50% 50%',
      mediaTransform: {
        kind: 'raster',
        cropAspectRatio: 'free',
        focalPoint: { x: 50, y: 50 },
        fill: { mode: 'fit' },
        scale: 1,
        translateX: 0,
        translateY: 0,
      },
    });
  });

  it('stores internal media transform offsets independently from focal crop', () => {
    expect(mediaInternalTransformPatch({ scale: 1.4, translateX: -12, translateY: 8 })).toMatchObject({
      mediaTransform: {
        kind: 'raster',
        scale: 1.4,
        translateX: -12,
        translateY: 8,
      },
    });
  });

  it('resets crop while preserving unrelated transform metadata', () => {
    const patch = resetImageCropPatch({
      mediaTransform: {
        kind: 'raster',
        focalPoint: { x: 80, y: 20 },
        filters: { brightness: 112 },
      },
    });
    expect(patch).toMatchObject({
      objectFit: 'cover',
      objectPosition: undefined,
      mediaTransform: {
        kind: 'raster',
        filters: { brightness: 112 },
      },
    });
    expect(patch.mediaTransform).not.toHaveProperty('focalPoint');
  });

  it('converts drag deltas into clamped object-position updates', () => {
    expect(nextObjectPositionFromDrag('50% 50%', 50, -25, 200, 100)).toBe('75% 25%');
    expect(nextObjectPositionFromDrag('95% 5%', 50, -50, 200, 100)).toBe('100% 0%');
  });

  it('builds CSS filters only for non-default image filter values', () => {
    expect(cssFilterForElement({
      mediaTransform: {
        kind: 'raster',
        filters: {
          brightness: 125,
          contrast: 90,
          saturation: 140,
          blur: 2.5,
          hue: -30,
        },
      },
    })).toBe('brightness(125%) contrast(90%) saturate(140%) blur(2.5px) hue-rotate(-30deg)');
    expect(cssFilterForElement({ mediaTransform: { kind: 'raster', filters: { brightness: 100 } } })).toBeUndefined();
  });

  it('clamps filter values and exposes inspector defaults', () => {
    const patch = imageFilterPatch('brightness', 300);
    expect(patch.mediaTransform?.filters?.brightness).toBe(200);
    expect(mediaFilterValue(undefined, 'contrast')).toBe(100);
    expect(imageFilterPatch('hue', -300).mediaTransform?.filters?.hue).toBe(-180);
    expect(imageFilterPatch('blur', Number.NaN).mediaTransform).toBeUndefined();
  });

  it('resets filters while preserving crop metadata', () => {
    const patch = resetImageFiltersPatch({
      mediaTransform: {
        kind: 'raster',
        focalPoint: { x: 72, y: 28 },
        fill: { mode: 'fill' },
        filters: { brightness: 125 },
      },
    });
    expect(patch.mediaTransform).toEqual({
      kind: 'raster',
      focalPoint: { x: 72, y: 28 },
      fill: { mode: 'fill' },
    });
  });
});
