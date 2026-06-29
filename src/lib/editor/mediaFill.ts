import type { ElementMediaFill, FrameElement, MediaTransform } from '../../types';

export interface MediaAssetReference {
  assetId: string;
  path: string;
  mime?: string;
  property: 'image' | 'media-fill';
}

export function legacyImageMediaFill(element: FrameElement): ElementMediaFill | undefined {
  if (element.type !== 'image') return undefined;
  if (!element.imageSrc && !element.imageAssetId && !element.imageAssetPath && !element.mediaTransform) return undefined;
  return {
    kind: element.mediaTransform?.kind ?? 'raster',
    src: element.imageSrc || undefined,
    assetId: element.imageAssetId,
    assetPath: element.imageAssetPath,
    mime: element.imageMime,
    alt: element.alt,
    transform: {
      ...(element.mediaTransform ?? { kind: 'raster' as const }),
      kind: element.mediaTransform?.kind ?? 'raster',
      fill: element.mediaTransform?.fill ?? (element.objectFit ? { mode: objectFitToMediaFillMode(element.objectFit) } : undefined),
      focalPoint: element.mediaTransform?.focalPoint,
      filters: element.mediaTransform?.filters,
    },
  };
}

export function mediaFillForElement(element: FrameElement): ElementMediaFill | undefined {
  return element.mediaFill ?? legacyImageMediaFill(element);
}

export function objectFitToMediaFillMode(objectFit: FrameElement['objectFit']): NonNullable<MediaTransform['fill']>['mode'] {
  if (objectFit === 'contain') return 'fit';
  if (objectFit === 'fill') return 'stretch';
  if (objectFit === 'none') return 'original';
  return 'fill';
}

export function mediaFillModeToObjectFit(mode: NonNullable<MediaTransform['fill']>['mode'] | undefined): NonNullable<FrameElement['objectFit']> {
  if (mode === 'fit') return 'contain';
  if (mode === 'stretch') return 'fill';
  if (mode === 'original') return 'none';
  return 'cover';
}

export function mediaFillSource(fill: ElementMediaFill | undefined): string | undefined {
  return fill?.src || undefined;
}

export function mediaAssetReferencesForElement(element: FrameElement): MediaAssetReference[] {
  const refs: MediaAssetReference[] = [];
  if (element.imageAssetId && element.imageAssetPath) {
    refs.push({
      assetId: element.imageAssetId,
      path: element.imageAssetPath,
      mime: element.imageMime,
      property: 'image',
    });
  }
  const fill = element.mediaFill;
  if (fill?.assetId && fill.assetPath) {
    const duplicateLegacy =
      fill.assetId === element.imageAssetId &&
      fill.assetPath === element.imageAssetPath;
    if (!duplicateLegacy) {
      refs.push({
        assetId: fill.assetId,
        path: fill.assetPath,
        mime: fill.mime,
        property: 'media-fill',
      });
    }
  }
  return refs;
}

export function mediaFillFromImagePatch(patch: Partial<FrameElement>, existing?: ElementMediaFill): ElementMediaFill {
  const has = (key: keyof FrameElement) => Object.prototype.hasOwnProperty.call(patch, key);
  return {
    ...(existing ?? { kind: 'raster' as const }),
    kind: patch.mediaTransform?.kind ?? existing?.kind ?? 'raster',
    src: has('imageSrc') ? patch.imageSrc : existing?.src,
    assetId: has('imageAssetId') ? patch.imageAssetId : existing?.assetId,
    assetPath: has('imageAssetPath') ? patch.imageAssetPath : existing?.assetPath,
    mime: has('imageMime') ? patch.imageMime : existing?.mime,
    alt: has('alt') ? patch.alt : existing?.alt,
    transform: patch.mediaTransform ?? existing?.transform ?? { kind: 'raster' },
  };
}
