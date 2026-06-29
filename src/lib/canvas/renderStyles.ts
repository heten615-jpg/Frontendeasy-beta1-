import type { AutoLayout, BlendMode, ElementEffect, Frame, FrameElement } from '../../types';
import { safeImageLikeCssUrl } from '../security/urls';
import { computeFitFontSize } from './fitText';
import { elementDisplayLabel } from '../editor/elementDisplay';

export function resolvedFontSize(el: FrameElement, fontFamily: string): number {
  if (el.type === 'text' && el.fitText) {
    return computeFitFontSize(el.content ?? '', el.width, el.fontSize, String(el.fontWeight), fontFamily);
  }
  return el.fontSize;
}

export function textOverflowMode(el: FrameElement): NonNullable<FrameElement['textOverflow']> {
  return el.textOverflow ?? 'wrap';
}

export function textBoxMode(el: FrameElement): NonNullable<FrameElement['textBoxMode']> {
  return el.type === 'text' ? el.textBoxMode ?? 'fixed' : 'fixed';
}

export function elementBoxWidth(el: FrameElement, fallback: string | undefined): string | undefined {
  return textBoxMode(el) === 'auto-width' ? 'max-content' : fallback;
}

export function elementBoxHeight(el: FrameElement, fallback: string | undefined): string | undefined {
  const mode = textBoxMode(el);
  return mode === 'auto-width' || mode === 'auto-height' ? 'auto' : fallback;
}

export function textContentWidth(el: FrameElement): string | undefined {
  return textBoxMode(el) === 'auto-width' ? 'max-content' : undefined;
}

export function textBoxOverflow(el: FrameElement): string | undefined {
  if (el.type !== 'text') return undefined;
  if (textBoxMode(el) === 'auto-width' || textBoxMode(el) === 'auto-height') return 'visible';
  const mode = textOverflowMode(el);
  return mode === 'clip' || mode === 'ellipsis' ? 'hidden' : 'visible';
}

export function textContentOverflow(el: FrameElement): string | undefined {
  if (el.type !== 'text') return undefined;
  if (textBoxMode(el) === 'auto-width' || textBoxMode(el) === 'auto-height') return 'visible';
  const mode = textOverflowMode(el);
  return mode === 'clip' || mode === 'ellipsis' ? 'hidden' : 'visible';
}

export function textEllipsis(el: FrameElement): string | undefined {
  if (el.type !== 'text') return undefined;
  if (textBoxMode(el) === 'auto-width' || textBoxMode(el) === 'auto-height') return 'clip';
  return textOverflowMode(el) === 'ellipsis' ? 'ellipsis' : 'clip';
}

export function textWhiteSpace(el: FrameElement): string | undefined {
  if (el.type !== 'text') return undefined;
  if (textBoxMode(el) === 'auto-width') return 'pre';
  if (textBoxMode(el) === 'auto-height') return 'pre-wrap';
  const mode = textOverflowMode(el);
  return mode === 'wrap' ? 'pre-wrap' : mode === 'ellipsis' ? 'nowrap' : 'pre';
}

export function textWordBreak(el: FrameElement): string | undefined {
  if (el.type !== 'text') return undefined;
  if (textBoxMode(el) === 'auto-width') return 'normal';
  if (textBoxMode(el) === 'auto-height') return 'break-word';
  return textOverflowMode(el) === 'wrap' ? 'break-word' : 'normal';
}

export function shadowCss(shadow: FrameElement['shadow']): string {
  if (!shadow) return '';
  return `${shadow.x}px ${shadow.y}px ${shadow.blur}px ${shadow.spread}px ${shadow.color}`;
}

export function activeEffects(el: FrameElement): ElementEffect[] {
  return el.effects?.filter(effect => effect.visible !== false) ?? [];
}

export function effectBoxShadowCss(el: FrameElement): string {
  const parts: string[] = [];
  const legacy = shadowCss(el.shadow);
  if (legacy) parts.push(legacy);
  for (const effect of activeEffects(el)) {
    const shadow = effect.settings.shadow;
    if (!shadow) continue;
    if (effect.kind === 'drop-shadow') parts.push(shadowCss(shadow));
    if (effect.kind === 'inner-shadow') parts.push(`inset ${shadowCss(shadow)}`);
  }
  return parts.join(', ');
}

export function elementFilterCss(el: FrameElement): string | undefined {
  const layerBlurs = activeEffects(el)
    .filter(effect => effect.kind === 'layer-blur' && effect.settings.blur?.radius)
    .map(effect => `blur(${effect.settings.blur!.radius}px)`);
  return layerBlurs.length ? layerBlurs.join(' ') : undefined;
}

export function elementBackdropFilterCss(el: FrameElement): string | undefined {
  const parts: string[] = [];
  for (const effect of activeEffects(el)) {
    if (effect.kind === 'background-blur' && effect.settings.blur?.radius) {
      parts.push(`blur(${effect.settings.blur.radius}px)`);
    }
    if (effect.kind === 'glass' && effect.settings.glass) {
      parts.push(`blur(${effect.settings.glass.blur}px)`, `saturate(${effect.settings.glass.saturation}%)`);
    }
  }
  return parts.length ? parts.join(' ') : undefined;
}

export function effectBackgroundCss(el: FrameElement, fallback: string | undefined): string | undefined {
  const layers: string[] = [];
  for (const effect of activeEffects(el)) {
    const noise = effect.settings.noise;
    const texture = effect.settings.texture;
    if (effect.kind === 'noise' && noise && noise.opacity > 0) {
      const opacity = Math.max(0, Math.min(1, noise.opacity));
      const size = Math.max(1, noise.size);
      layers.push(`repeating-radial-gradient(circle at 0 0, rgba(255,255,255,${opacity}) 0 1px, transparent 1px ${size}px)`);
    }
    if (effect.kind === 'texture' && texture && texture.opacity > 0) {
      const scale = Math.max(2, texture.scale);
      const color = texture.color;
      if (texture.style === 'paper') {
        layers.push(`repeating-linear-gradient(0deg, transparent 0 ${scale}px, ${color} ${scale}px ${scale + 1}px)`);
      } else if (texture.style === 'fabric') {
        layers.push(`repeating-linear-gradient(90deg, transparent 0 ${scale}px, ${color} ${scale}px ${scale + 1}px)`, `repeating-linear-gradient(0deg, transparent 0 ${scale}px, ${color} ${scale}px ${scale + 1}px)`);
      } else {
        layers.push(`repeating-linear-gradient(45deg, transparent 0 ${scale}px, ${color} ${scale}px ${scale + 1}px)`);
      }
    }
  }
  const glass = activeEffects(el).find(effect => effect.kind === 'glass')?.settings.glass;
  const base = glass ? glass.tint : fallback;
  return [...layers, base || 'transparent'].join(', ');
}

export function borderCss(border: FrameElement['border']): string {
  if (!border || border.width <= 0) return '';
  if (border.sides && Object.keys(border.sides).length > 0) return '';
  if (border.placement === 'outside') return '';
  return `${border.width}px ${border.style} ${border.color}`;
}

export function borderSideCss(border: FrameElement['border'], side: 'top' | 'right' | 'bottom' | 'left'): string {
  if (!border?.sides?.[side]) return '';
  const part = border.sides[side]!;
  const width = part.width ?? border.width;
  if (width <= 0) return '';
  return `${width}px ${part.style ?? border.style} ${part.color ?? border.color}`;
}

export function borderOutlineCss(border: FrameElement['border']): string {
  if (!border || border.width <= 0 || border.placement !== 'outside' || border.sides) return '';
  return `${border.width}px ${border.style} ${border.color}`;
}

export function strokeDashArray(border: FrameElement['border']): string | undefined {
  if (!border) return undefined;
  if (border.dash || border.gap) return `${border.dash ?? border.width * 2} ${border.gap ?? border.width}`;
  if (border.style === 'dashed') return `${border.width * 3} ${border.width * 2}`;
  if (border.style === 'dotted') return `1 ${Math.max(1, border.width * 2)}`;
  return undefined;
}

export function strokeCap(border: FrameElement['border']): 'butt' | 'round' | 'square' {
  return border?.startCap ?? border?.cap ?? (border?.style === 'dotted' ? 'round' : 'round');
}

export function vectorStrokeColor(el: FrameElement): string {
  return el.vectorEdit?.paintColor ?? el.border?.color ?? el.background ?? el.color ?? '#f7f1e8';
}

export function vectorStrokeWidth(el: FrameElement): number {
  const widths = el.vectorEdit?.variableWidths?.filter(value => Number.isFinite(value) && value > 0) ?? [];
  return widths.length ? Math.max(...widths) : el.border?.width ?? 2;
}

export function vectorEditLabel(el: FrameElement): string {
  const tool = el.vectorEdit?.tool ?? 'select';
  const ops = el.vectorEdit?.operations?.length ?? 0;
  return `Vector edit: ${tool}${ops ? ` · ${ops} ops` : ''}`;
}

export function borderRadiusCss(el: FrameElement): string {
  const radii = el.cornerRadii;
  if (!radii) return `${el.borderRadius}px`;
  return `${Math.max(0, radii.topLeft)}px ${Math.max(0, radii.topRight)}px ${Math.max(0, radii.bottomRight)}px ${Math.max(0, radii.bottomLeft)}px`;
}

export function textAlignCss(el: FrameElement): string | undefined {
  return el.textAlign ?? undefined;
}

export function textJustifyCss(el: FrameElement): string | undefined {
  if (el.textAlign === 'left') return 'flex-start';
  if (el.textAlign === 'right') return 'flex-end';
  return undefined;
}

export function textVerticalAlignCss(el: FrameElement): string | undefined {
  if (el.textVerticalAlign === 'top') return 'flex-start';
  if (el.textVerticalAlign === 'bottom') return 'flex-end';
  return undefined;
}

export function cssBlendMode(mode: BlendMode | undefined | null): string | undefined {
  if (!mode || mode === 'normal' || mode === 'pass-through') return undefined;
  return mode;
}

export function elementBlendMode(el: FrameElement, previewElementId: string | null, previewMode: BlendMode | null): string | undefined {
  if (previewElementId === el.id && previewMode) return cssBlendMode(previewMode);
  return cssBlendMode(el.blendMode);
}

export function elementTransformCss(el: FrameElement): string {
  const parts: string[] = [];
  if (el.rotation) parts.push(`rotate(${el.rotation}deg)`);
  if (el.flipX) parts.push('scaleX(-1)');
  if (el.flipY) parts.push('scaleY(-1)');
  return parts.join(' ');
}

export function elementTransformOrigin(el: FrameElement): string {
  return el.transformOrigin ?? 'center center';
}

export function participatesInAutoLayout(parent: AutoLayout | undefined, el: FrameElement): boolean {
  return !!parent && !el.isFrameBackground && !el.ignoreAutoLayout;
}

export function autoLayoutDisplay(autoLayout: AutoLayout | undefined): string | undefined {
  if (!autoLayout) return undefined;
  return autoLayout.mode === 'grid' ? 'grid' : 'flex';
}

export function autoLayoutGap(autoLayout: AutoLayout | undefined): string | undefined {
  if (!autoLayout || autoLayout.mode === 'grid') return undefined;
  return `${autoLayout.gap}px`;
}

export function autoLayoutColumnGap(autoLayout: AutoLayout | undefined): string | undefined {
  if (!autoLayout || autoLayout.mode !== 'grid') return undefined;
  return `${autoLayout.grid?.columnGap ?? autoLayout.gap}px`;
}

export function autoLayoutRowGap(autoLayout: AutoLayout | undefined): string | undefined {
  if (!autoLayout || autoLayout.mode !== 'grid') return undefined;
  return `${autoLayout.grid?.rowGap ?? autoLayout.gap}px`;
}

export function autoLayoutGridColumns(autoLayout: AutoLayout | undefined): string | undefined {
  if (!autoLayout || autoLayout.mode !== 'grid') return undefined;
  return autoLayout.grid?.columnTracks || `repeat(${Math.max(1, autoLayout.grid?.columns ?? 2)}, minmax(0, 1fr))`;
}

export function autoLayoutGridRows(autoLayout: AutoLayout | undefined): string | undefined {
  if (!autoLayout || autoLayout.mode !== 'grid') return undefined;
  return autoLayout.grid?.rowTracks || 'auto';
}

export function layoutItemWidth(el: FrameElement, fallback: string | undefined): string | undefined {
  if (el.layoutSizing?.horizontal === 'hug') return 'max-content';
  return fallback;
}

export function layoutItemHeight(el: FrameElement, fallback: string | undefined): string | undefined {
  if (el.layoutSizing?.vertical === 'hug') return 'auto';
  return fallback;
}

export function layoutItemFlex(el: FrameElement, parent: AutoLayout | undefined): string | undefined {
  if (!parent || parent.mode === 'grid') return undefined;
  if (el.layoutSizing?.horizontal === 'fill' || el.layoutSizing?.vertical === 'fill') return '1 1 0';
  return undefined;
}

export function layoutItemAlignSelf(el: FrameElement): string | undefined {
  if (el.layoutSizing?.vertical === 'fill') return 'stretch';
  return undefined;
}

export function transformOriginOffset(el: FrameElement): { x: number; y: number } {
  const [vertical, horizontal] = elementTransformOrigin(el).split(' ');
  return {
    x: horizontal === 'left' ? 0 : horizontal === 'right' ? el.width : el.width / 2,
    y: vertical === 'top' ? 0 : vertical === 'bottom' ? el.height : el.height / 2,
  };
}

export function textShadowCss(shadow: FrameElement['textShadow']): string {
  if (!shadow) return '';
  return `${shadow.x}px ${shadow.y}px ${shadow.blur}px ${shadow.color}`;
}

export function wireframeLabel(element: FrameElement): string {
  return element.name?.trim() || element.content?.trim().slice(0, 24) || elementDisplayLabel(element);
}

export function frameBackgroundImage(frame: Frame): string | undefined {
  const src = safeImageLikeCssUrl(frame.backgroundImage);
  return src ? `url("${src}")` : undefined;
}
