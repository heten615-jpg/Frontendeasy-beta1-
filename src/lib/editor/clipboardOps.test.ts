import { describe, expect, it } from 'vitest';
import { cloneElementForPaste, createSelectionClipboard, createStyleSnapshot } from './clipboardOps';
import type { Frame, FrameElement } from '../../types';

function element(id: string, x: number, y: number, children?: FrameElement[]): FrameElement {
  return {
    id,
    type: children ? 'group' : 'text',
    x,
    y,
    width: children ? 200 : 80,
    height: children ? 120 : 32,
    content: id,
    color: '#ffffff',
    background: 'transparent',
    borderRadius: 0,
    fontSize: 16,
    fontWeight: '400',
    targetFrameId: null,
    children,
  };
}

describe('createStyleSnapshot', () => {
  it('deep-clones unified fill metadata for paste-style operations', () => {
    const element: FrameElement = {
      id: 'source',
      type: 'section',
      x: 0,
      y: 0,
      width: 200,
      height: 120,
      content: '',
      color: '#111111',
      background: 'transparent',
      borderRadius: 12,
      fontSize: 16,
      fontWeight: '400',
      targetFrameId: null,
      fills: [{
        id: 'fill-image',
        kind: 'image',
        colorModel: 'variable',
        source: 'library',
        variableRef: 'colors/hero',
        gradient: {
          type: 'angular',
          angle: 30,
          flipX: true,
          stops: [
            { color: '#ff6b39', pos: 0, variableRef: 'colors/start' },
            { color: '#1a0a2e', pos: 100, variableRef: 'colors/end' },
          ],
        },
        pattern: {
          style: 'dots',
          foreground: '#ffffff',
          background: 'transparent',
          size: 16,
        },
        media: {
          kind: 'raster',
          src: 'data:image/png;base64,abcd',
          transform: {
            kind: 'raster',
            fill: { mode: 'tile', background: '#000000' },
            filters: { brightness: 1.1 },
            crop: { unit: 'percent', x: 10, y: 5, width: 80, height: 90 },
            focalPoint: { x: 0.4, y: 0.6 },
          },
        },
      }],
    };

    const snapshot = createStyleSnapshot(element);
    snapshot.fills![0].gradient!.stops[0].variableRef = 'colors/changed';
    snapshot.fills![0].pattern!.style = 'grid';
    snapshot.fills![0].media!.transform!.fill!.mode = 'fit';
    snapshot.fills![0].media!.transform!.filters!.brightness = 0.7;
    snapshot.fills![0].media!.transform!.crop!.x = 22;
    snapshot.fills![0].media!.transform!.focalPoint!.x = 0.9;

    expect(element.fills![0].gradient!.stops[0].variableRef).toBe('colors/start');
    expect(element.fills![0].pattern!.style).toBe('dots');
    expect(element.fills![0].media!.transform!.fill!.mode).toBe('tile');
    expect(element.fills![0].media!.transform!.filters!.brightness).toBe(1.1);
    expect(element.fills![0].media!.transform!.crop!.x).toBe(10);
    expect(element.fills![0].media!.transform!.focalPoint!.x).toBe(0.4);
  });

  it('deep-clones full effects stack metadata for paste-style operations', () => {
    const element: FrameElement = {
      id: 'source',
      type: 'section',
      x: 0,
      y: 0,
      width: 200,
      height: 120,
      content: '',
      color: '#111111',
      background: 'transparent',
      borderRadius: 12,
      fontSize: 16,
      fontWeight: '400',
      targetFrameId: null,
      effects: [
        { id: 'inner', kind: 'inner-shadow', settings: { shadow: { x: 0, y: 2, blur: 8, spread: 0, color: 'rgba(0,0,0,0.35)' } } },
        { id: 'glass', kind: 'glass', settings: { glass: { blur: 18, saturation: 140, tint: 'rgba(255,255,255,0.16)', opacity: 1 } } },
        { id: 'noise', kind: 'noise', settings: { noise: { opacity: 0.18, size: 2, monochrome: true } } },
        { id: 'texture', kind: 'texture', settings: { texture: { style: 'paper', scale: 12, opacity: 0.16, color: 'rgba(255,255,255,0.32)' } } },
      ],
    };

    const snapshot = createStyleSnapshot(element);
    snapshot.effects![0].settings.shadow!.blur = 99;
    snapshot.effects![1].settings.glass!.blur = 4;
    snapshot.effects![2].settings.noise!.size = 8;
    snapshot.effects![3].settings.texture!.style = 'fabric';

    expect(element.effects![0].settings.shadow!.blur).toBe(8);
    expect(element.effects![1].settings.glass!.blur).toBe(18);
    expect(element.effects![2].settings.noise!.size).toBe(2);
    expect(element.effects![3].settings.texture!.style).toBe('paper');
  });
});

describe('selection clipboard', () => {
  it('copies selected group children at frame-local coordinates', () => {
    const frame: Frame = {
      id: 'frame',
      name: 'Home',
      filename: 'index.html',
      x: 0,
      y: 0,
      width: 640,
      height: 480,
      background: '#000000',
      elements: [
        element('group', 100, 50, [
          element('child-a', 10, 20),
          element('child-b', 40, 60),
        ]),
        element('top', 12, 18),
      ],
    };

    const single = createSelectionClipboard({
      activeFrame: frame,
      selectedElementIds: ['child-a'],
      selectedContext: null,
    });
    expect(single).toMatchObject({ type: 'element', frameId: 'frame' });
    if (single?.type !== 'element') throw new Error('Expected element clipboard');
    expect(single.element.x).toBe(110);
    expect(single.element.y).toBe(70);

    const multi = createSelectionClipboard({
      activeFrame: frame,
      selectedElementIds: ['child-a', 'top'],
      selectedContext: null,
    });
    expect(multi).toMatchObject({ type: 'elements', frameId: 'frame' });
    if (multi?.type !== 'elements') throw new Error('Expected elements clipboard');
    expect(multi.elements.map(item => [item.id, item.x, item.y])).toEqual([
      ['child-a', 110, 70],
      ['top', 12, 18],
    ]);
  });

  it('regenerates ids recursively when pasting grouped elements', () => {
    const group = element('group', 20, 30, [element('child', 4, 6)]);
    let next = 0;
    const pasted = cloneElementForPaste(group, () => `new-${++next}`, value => value, 24);

    expect(pasted.id).toBe('new-1');
    expect(pasted.children?.[0].id).toBe('new-2');
    expect(pasted.x).toBe(44);
    expect(pasted.y).toBe(54);
    expect(pasted.children?.[0].x).toBe(4);
    expect(pasted.children?.[0].y).toBe(6);
  });
});
