import { describe, expect, it } from 'vitest';
import type { FrameElement } from '../../types';
import {
  legacyImageMediaFill,
  mediaAssetReferencesForElement,
  mediaFillForElement,
  mediaFillFromImagePatch,
  mediaFillModeToObjectFit,
} from './mediaFill';

function base(type: FrameElement['type'] = 'section'): FrameElement {
  return {
    id: 'el',
    type,
    x: 0,
    y: 0,
    width: 100,
    height: 80,
    content: '',
    color: '#fff',
    background: 'transparent',
    borderRadius: 0,
    fontSize: 16,
    fontWeight: '400',
    targetFrameId: null,
  };
}

describe('media fill bridge', () => {
  it('derives canonical media fill from legacy image fields without mutating the element type', () => {
    const image: FrameElement = {
      ...base('image'),
      imageSrc: 'data:image/png;base64,abc',
      imageAssetId: 'asset-a',
      imageAssetPath: 'u/p/asset-a.png',
      imageMime: 'image/png',
      objectFit: 'contain',
      alt: 'Hero',
      mediaTransform: { kind: 'raster', filters: { brightness: 120 } },
    };

    expect(legacyImageMediaFill(image)).toMatchObject({
      kind: 'raster',
      src: 'data:image/png;base64,abc',
      assetId: 'asset-a',
      assetPath: 'u/p/asset-a.png',
      alt: 'Hero',
      transform: { fill: { mode: 'fit' }, filters: { brightness: 120 } },
    });
    expect(mediaFillForElement(image)).toMatchObject({ assetId: 'asset-a' });
    expect(image.type).toBe('image');
  });

  it('returns legacy and explicit media-fill asset references without duplicates', () => {
    const shape: FrameElement = {
      ...base('section'),
      mediaFill: {
        kind: 'raster',
        assetId: 'asset-fill',
        assetPath: 'u/p/fill.png',
        mime: 'image/png',
      },
    };
    const duplicate: FrameElement = {
      ...base('image'),
      imageAssetId: 'asset-a',
      imageAssetPath: 'u/p/asset-a.png',
      imageMime: 'image/png',
      mediaFill: {
        kind: 'raster',
        assetId: 'asset-a',
        assetPath: 'u/p/asset-a.png',
        mime: 'image/png',
      },
    };

    expect(mediaAssetReferencesForElement(shape)).toEqual([
      { assetId: 'asset-fill', path: 'u/p/fill.png', mime: 'image/png', property: 'media-fill' },
    ]);
    expect(mediaAssetReferencesForElement(duplicate)).toHaveLength(1);
  });

  it('builds media-fill patches from image picker results and maps fill modes to object-fit', () => {
    const fill = mediaFillFromImagePatch({
      imageAssetId: 'asset-a',
      imageAssetPath: 'u/p/asset-a.png',
      imageMime: 'image/png',
      imageSrc: undefined,
    }, { kind: 'raster', src: 'data:image/png;base64,old' });

    expect(fill).toMatchObject({
      kind: 'raster',
      assetId: 'asset-a',
      assetPath: 'u/p/asset-a.png',
      mime: 'image/png',
    });
    expect(fill.src).toBeUndefined();
    expect(mediaFillModeToObjectFit('fit')).toBe('contain');
    expect(mediaFillModeToObjectFit('stretch')).toBe('fill');
    expect(mediaFillModeToObjectFit('original')).toBe('none');
    expect(mediaFillModeToObjectFit('fill')).toBe('cover');
  });
});
