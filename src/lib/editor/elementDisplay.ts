import type { FrameElement } from '../../types';

const TYPE_LABELS: Partial<Record<FrameElement['type'], string>> = {
  section: 'Rectangle',
  slice: 'Slice',
  text: 'Text',
  group: 'Group',
  image: 'Image',
  svg: 'SVG',
  vector: 'Vector',
  input: 'Input',
  textarea: 'Textarea',
  list: 'List',
  iframe: 'Iframe',
};

const SHAPE_LABELS: NonNullable<Record<NonNullable<FrameElement['shapeKind']>, string>> = {
  arrow: 'Arrow',
  ellipse: 'Ellipse',
  polygon: 'Polygon',
  star: 'Star',
};

const TYPE_ICONS: Partial<Record<FrameElement['type'], string>> = {
  section: '▭',
  slice: '⌗',
  text: 'T',
  group: '▣',
  image: '⊟',
  svg: '◇',
  vector: '✒',
  input: '▢',
  textarea: '☰',
  list: '≡',
  iframe: '⊞',
};

const SHAPE_ICONS: NonNullable<Record<NonNullable<FrameElement['shapeKind']>, string>> = {
  arrow: '↗',
  ellipse: '◯',
  polygon: '△',
  star: '☆',
};

function fallbackTypeLabel(type: string): string {
  return `${type[0]?.toUpperCase() ?? ''}${type.slice(1)}`;
}

function isLineLikeRectangle(element: FrameElement): boolean {
  return element.type === 'section'
    && !element.shapeKind
    && !element.mediaFill
    && !element.children?.length
    && element.height <= 4
    && element.width >= Math.max(24, element.height * 8);
}

export function elementDisplayLabel(element: FrameElement): string {
  if (element.isFrameBackground) return 'Frame background';
  if (element.type === 'section') {
    if (element.shapeKind) return SHAPE_LABELS[element.shapeKind];
    if (element.mediaFill) return 'Image/video';
    if (isLineLikeRectangle(element)) return 'Line';
    return 'Rectangle';
  }
  return TYPE_LABELS[element.type] ?? fallbackTypeLabel(element.type);
}

export function elementDisplayIcon(element: FrameElement): string {
  if (element.type === 'section') {
    if (element.shapeKind) return SHAPE_ICONS[element.shapeKind];
    if (element.mediaFill) return '⊟';
    if (isLineLikeRectangle(element)) return '╱';
  }
  return TYPE_ICONS[element.type] ?? '◻';
}

export function elementLayerFallbackName(element: FrameElement): string {
  return `${elementDisplayLabel(element)} layer`;
}
