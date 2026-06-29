import type { ElementEffect, ElementFill, ElementMediaFill, Frame, FrameElement, MediaTransform } from '../../types';
import { withPixelGeometryPatch } from './geometryUnits';

export type StudioClipboard =
  | { type: 'element'; frameId: string; element: FrameElement }
  | { type: 'elements'; frameId: string; elements: FrameElement[] }
  | { type: 'frame'; frame: Frame }
  | null;

export type StyleSnapshot = Partial<Pick<FrameElement,
  | 'color' | 'background' | 'fills' | 'borderRadius'
  | 'fontSize' | 'fontWeight'
  | 'letterSpacing' | 'lineHeight' | 'textDecoration' | 'textTransform'
  | 'typographyMode' | 'fontSource' | 'textAlign' | 'textVerticalAlign'
  | 'textCase' | 'smallCaps' | 'textTrim' | 'maxLines' | 'paragraphIndent'
  | 'paragraphSpacing' | 'hangingPunctuation' | 'openTypeSettings' | 'listIndent' | 'listGap'
  | 'layoutSizing' | 'ignoreAutoLayout'
  | 'opacity' | 'opacityMode' | 'visibilityMode' | 'blendMode'
  | 'rotation' | 'transformOrigin' | 'flipX' | 'flipY' | 'shadow' | 'effects' | 'border'
  | 'objectFit' | 'listKind'
>>;

export function createSelectionClipboard(params: {
  activeFrame: Frame | null;
  selectedElementIds: string[];
  selectedContext: { frame: Frame; element: FrameElement } | null;
}): StudioClipboard {
  const { activeFrame, selectedElementIds, selectedContext } = params;
  if (activeFrame && selectedElementIds.length > 0) {
    const elements = collectSelectedElements(activeFrame.elements, new Set(selectedElementIds));
    if (elements.length > 1) return { type: 'elements', frameId: activeFrame.id, elements };
    if (elements.length === 1) return { type: 'element', frameId: activeFrame.id, element: elements[0] };
  }
  if (selectedContext) {
    return { type: 'element', frameId: selectedContext.frame.id, element: structuredClone(selectedContext.element) };
  }
  if (activeFrame) {
    return { type: 'frame', frame: structuredClone(activeFrame) };
  }
  return null;
}

function collectSelectedElements(
  elements: FrameElement[],
  selectedIds: Set<string>,
  offsetX = 0,
  offsetY = 0,
): FrameElement[] {
  const selected: FrameElement[] = [];
  for (const element of elements) {
    const absolute = withPixelGeometryPatch(structuredClone(element), {
      x: element.x + offsetX,
      y: element.y + offsetY,
    });
    if (selectedIds.has(element.id)) {
      selected.push(absolute);
      continue;
    }
    if (element.children?.length) {
      selected.push(...collectSelectedElements(element.children, selectedIds, offsetX + element.x, offsetY + element.y));
    }
  }
  return selected;
}

export function cloneElementForPaste(
  element: FrameElement,
  makeId: () => string,
  snap: (value: number) => number,
  offset = 24,
): FrameElement {
  const cloned = structuredClone(element);
  cloned.id = makeId();
  cloned.children = cloned.children?.map(child => cloneElementForPaste(child, makeId, snap, 0));
  return withPixelGeometryPatch(
    cloned,
    { x: snap(element.x + offset), y: snap(element.y + offset) },
  );
}

export function cloneFrameForPaste(params: {
  frame: Frame;
  makeId: () => string;
  snap: (value: number) => number;
  nextName: (base: string) => string;
  nextFilename: (filename: string) => string;
  offset?: number;
}): Frame {
  const { frame, makeId, snap, nextName, nextFilename, offset = 80 } = params;
  return {
    ...frame,
    id: makeId(),
    name: nextName(frame.name),
    filename: nextFilename(frame.filename),
    x: snap(frame.x + offset),
    y: snap(frame.y + offset),
    elements: frame.elements.map(element => cloneElementForPaste(element, makeId, snap, 0)),
  };
}

function cloneMediaTransform(transform: MediaTransform | undefined): MediaTransform | undefined {
  return transform
    ? {
        ...transform,
        fill: transform.fill ? { ...transform.fill } : undefined,
        filters: transform.filters ? { ...transform.filters } : undefined,
        crop: transform.crop ? { ...transform.crop } : undefined,
        focalPoint: transform.focalPoint ? { ...transform.focalPoint } : undefined,
      }
    : undefined;
}

function cloneElementMediaFill(media: ElementMediaFill | undefined): ElementMediaFill | undefined {
  return media
    ? {
        ...media,
        transform: cloneMediaTransform(media.transform),
      }
    : undefined;
}

function cloneElementFill(fill: ElementFill): ElementFill {
  return {
    ...fill,
    gradient: fill.gradient ? { ...fill.gradient, stops: fill.gradient.stops.map(stop => ({ ...stop })) } : undefined,
    pattern: fill.pattern ? { ...fill.pattern } : undefined,
    media: cloneElementMediaFill(fill.media),
  };
}

function cloneElementEffect(effect: ElementEffect): ElementEffect {
  return {
    ...effect,
    settings: {
      ...effect.settings,
      shadow: effect.settings.shadow ? { ...effect.settings.shadow } : undefined,
      blur: effect.settings.blur ? { ...effect.settings.blur } : undefined,
      glass: effect.settings.glass ? { ...effect.settings.glass } : undefined,
      noise: effect.settings.noise ? { ...effect.settings.noise } : undefined,
      texture: effect.settings.texture ? { ...effect.settings.texture } : undefined,
    },
  };
}

export function createStyleSnapshot(el: FrameElement): StyleSnapshot {
  return {
    color: el.color,
    background: el.background,
    fills: el.fills ? el.fills.map(cloneElementFill) : undefined,
    borderRadius: el.borderRadius,
    fontSize: el.fontSize,
    fontWeight: el.fontWeight,
    letterSpacing: el.letterSpacing,
    lineHeight: el.lineHeight,
    textDecoration: el.textDecoration,
    textTransform: el.textTransform,
    typographyMode: el.typographyMode,
    fontSource: el.fontSource,
    textAlign: el.textAlign,
    textVerticalAlign: el.textVerticalAlign,
    textCase: el.textCase,
    smallCaps: el.smallCaps,
    textTrim: el.textTrim,
    maxLines: el.maxLines,
    paragraphIndent: el.paragraphIndent,
    paragraphSpacing: el.paragraphSpacing,
    hangingPunctuation: el.hangingPunctuation,
    openTypeSettings: el.openTypeSettings,
    listIndent: el.listIndent,
    listGap: el.listGap,
    layoutSizing: el.layoutSizing ? { ...el.layoutSizing } : undefined,
    ignoreAutoLayout: el.ignoreAutoLayout,
    opacity: el.opacity,
    opacityMode: el.opacityMode,
    visibilityMode: el.visibilityMode,
    blendMode: el.blendMode,
    rotation: el.rotation,
    transformOrigin: el.transformOrigin,
    flipX: el.flipX,
    flipY: el.flipY,
    shadow: el.shadow ? { ...el.shadow } : undefined,
    effects: el.effects ? el.effects.map(cloneElementEffect) : undefined,
    border: el.border ? { ...el.border } : undefined,
    objectFit: el.objectFit,
    listKind: el.listKind,
  };
}
