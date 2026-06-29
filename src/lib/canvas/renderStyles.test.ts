import { describe, expect, it } from 'vitest';
import type { AutoLayout, Frame, FrameElement } from '../../types';
import {
  autoLayoutDisplay,
  borderCss,
  effectBoxShadowCss,
  elementBackdropFilterCss,
  elementBlendMode,
  elementBoxHeight,
  elementBoxWidth,
  elementTransformCss,
  frameBackgroundImage,
  layoutItemFlex,
  textWhiteSpace,
  transformOriginOffset,
  vectorStrokeWidth,
} from './renderStyles';

function element(overrides: Partial<FrameElement> = {}): FrameElement {
  return {
    id: 'el',
    type: 'text',
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    content: 'Text',
    color: '#111',
    background: '#fff',
    borderRadius: 0,
    fontSize: 16,
    fontWeight: '400',
    targetFrameId: null,
    ...overrides,
  };
}

describe('canvas render style helpers', () => {
  it('maps text sizing and overflow modes to CSS values', () => {
    const autoWidth = element({ textBoxMode: 'auto-width', textOverflow: 'ellipsis' });
    expect(elementBoxWidth(autoWidth, '100px')).toBe('max-content');
    expect(elementBoxHeight(autoWidth, '40px')).toBe('auto');
    expect(textWhiteSpace(autoWidth)).toBe('pre');

    const fixed = element({ textOverflow: 'ellipsis' });
    expect(textWhiteSpace(fixed)).toBe('nowrap');
  });

  it('combines legacy and effect-stack styles', () => {
    const styled = element({
      shadow: { x: 1, y: 2, blur: 3, spread: 4, color: 'black' },
      effects: [
        { id: 'inner', kind: 'inner-shadow', visible: true, settings: { shadow: { x: 0, y: 1, blur: 8, spread: 0, color: 'white' } } },
        { id: 'blur', kind: 'background-blur', visible: true, settings: { blur: { radius: 12 } } },
      ],
    });
    expect(effectBoxShadowCss(styled)).toContain('1px 2px 3px 4px black');
    expect(effectBoxShadowCss(styled)).toContain('inset 0px 1px 8px 0px white');
    expect(elementBackdropFilterCss(styled)).toBe('blur(12px)');
  });

  it('keeps layout, transform, border, and media-safe frame background CSS deterministic', () => {
    const item = element({
      layoutSizing: { horizontal: 'fill', vertical: 'fixed' },
      rotation: 15,
      flipX: true,
      transformOrigin: 'top left',
      border: { width: 2, style: 'solid', color: '#f00' },
      vectorEdit: { variableWidths: [2, 9, 4] },
      blendMode: 'multiply',
    });
    const parent: AutoLayout = { direction: 'row', gap: 8, padding: { t: 0, r: 0, b: 0, l: 0 }, align: 'start' };

    expect(autoLayoutDisplay(parent)).toBe('flex');
    expect(layoutItemFlex(item, parent)).toBe('1 1 0');
    expect(elementTransformCss(item)).toBe('rotate(15deg) scaleX(-1)');
    expect(transformOriginOffset(item)).toEqual({ x: 0, y: 0 });
    expect(borderCss(item.border)).toBe('2px solid #f00');
    expect(vectorStrokeWidth(item)).toBe(9);
    expect(elementBlendMode(item, 'other', 'screen')).toBe('multiply');
    expect(elementBlendMode(item, 'el', 'screen')).toBe('screen');

    const frame: Frame = {
      id: 'frame',
      name: 'Frame',
      filename: 'frame.html',
      x: 0,
      y: 0,
      width: 320,
      height: 240,
      background: '#000',
      backgroundImage: 'https://example.com/image.png"bad',
      elements: [],
    };
    expect(frameBackgroundImage(frame)).toBe('url("https://example.com/image.pngbad")');
    expect(frameBackgroundImage({ ...frame, backgroundImage: 'javascript:alert(1)' })).toBeUndefined();
  });
});
