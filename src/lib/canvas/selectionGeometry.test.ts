import { describe, expect, it } from 'vitest';
import type { Frame, FrameElement, StudioState } from '../../types';
import { getMarqueeSelection, getSelectionBounds } from './selectionGeometry';

function element(id: string, x: number, y: number, children?: FrameElement[]): FrameElement {
  return {
    id,
    type: children ? 'group' : 'text',
    targetFrameId: '',
    x,
    y,
    width: children ? 120 : 20,
    height: children ? 80 : 10,
    content: id,
    color: '#fff',
    background: 'transparent',
    borderRadius: 0,
    fontSize: 16,
    fontWeight: '400',
    children,
  };
}

function state(partial: Partial<StudioState>): StudioState {
  return {
    schemaVersion: 1,
    frames: [],
    orphanElements: [],
    activeFrameId: null,
    selectedElementId: null,
    selectedElementIds: [],
    selectedFrameIds: [],
    fontFamily: 'Inter',
    ...partial,
  };
}

function frame(id: string, x: number, y: number, elements: FrameElement[] = []): Frame {
  return {
    id,
    name: id,
    filename: `${id}.html`,
    x,
    y,
    width: 200,
    height: 160,
    background: '#111',
    elements,
  };
}

describe('selectionGeometry', () => {
  it('uses absolute positions for selected nested frame and orphan children', () => {
    const bounds = getSelectionBounds(state({
      frames: [{
        id: 'frame',
        name: 'Frame',
        filename: 'frame.html',
        x: 100,
        y: 50,
        width: 400,
        height: 300,
        background: '#000',
        elements: [element('group', 10, 20, [element('frame-child', 5, 6)])],
      }],
      orphanElements: [element('loose-group', 300, 200, [element('loose-child', 7, 8)])],
      selectedElementIds: ['frame-child', 'loose-child'],
    }));

    expect(bounds).toEqual({
      x: 115,
      y: 76,
      w: 212,
      h: 142,
    });
  });

  it('limits marquee element hits to intersecting frames', () => {
    const visible = frame('visible', 0, 0, [element('inside', 20, 20)]);
    const offscreen = frame('offscreen', 1_000, 1_000, [element('outside', -940, -940)]);

    const result = getMarqueeSelection({ x: 0, y: 0, w: 80, h: 80 }, [visible, offscreen], []);

    expect(result.touchedFrameIds).toEqual(['visible']);
    expect(result.elementIds).toEqual(['inside']);
  });
});
