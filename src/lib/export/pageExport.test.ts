import { describe, expect, it } from 'vitest';
import { exportableFrameElements, frameSlices } from './pageExport';
import type { Frame, FrameElement } from '../../types';

function element(overrides: Partial<FrameElement>): FrameElement {
  return {
    id: overrides.id ?? 'el',
    type: overrides.type ?? 'section',
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    width: overrides.width ?? 100,
    height: overrides.height ?? 40,
    content: overrides.content ?? '',
    color: overrides.color ?? '#111111',
    background: overrides.background ?? 'transparent',
    borderRadius: overrides.borderRadius ?? 0,
    fontSize: overrides.fontSize ?? 16,
    fontWeight: overrides.fontWeight ?? '400',
    targetFrameId: overrides.targetFrameId ?? null,
    ...overrides,
  };
}

function frame(elements: FrameElement[]): Frame {
  return {
    id: 'frame',
    name: 'Frame',
    filename: 'frame.html',
    x: 0,
    y: 0,
    width: 800,
    height: 600,
    background: '#ffffff',
    elements,
  };
}

describe('page export helpers', () => {
  it('returns only visible slice overlays in frame order', () => {
    const visibleSlice = element({ id: 'slice-visible', type: 'slice', x: 10 });
    const hiddenSlice = element({ id: 'slice-hidden', type: 'slice', hidden: true, x: 20 });
    const regular = element({ id: 'regular', type: 'section', x: 30 });

    expect(frameSlices(frame([regular, visibleSlice, hiddenSlice])).map(item => item.id)).toEqual(['slice-visible']);
  });

  it('returns visible non-slice elements in frame order', () => {
    const first = element({ id: 'first', type: 'section' });
    const slice = element({ id: 'slice', type: 'slice' });
    const hidden = element({ id: 'hidden', type: 'text', hidden: true });
    const second = element({ id: 'second', type: 'text' });

    expect(exportableFrameElements(frame([first, slice, hidden, second])).map(item => item.id)).toEqual(['first', 'second']);
  });
});
