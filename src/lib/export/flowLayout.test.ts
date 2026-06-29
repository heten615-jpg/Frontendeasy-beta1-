import { describe, expect, it } from 'vitest';
import type { FrameElement } from '../../types';
import { detectOverlaps, inferFlowOrder, inferFlowSizing, inferVerticalGaps } from './flowLayout';

function makeEl(id: string, x: number, y: number, width: number, height: number, overrides: Partial<FrameElement> = {}): FrameElement {
  return {
    id,
    type: 'section',
    x,
    y,
    width,
    height,
    content: '',
    color: '#111',
    background: '#fff',
    borderRadius: 0,
    fontSize: 16,
    fontWeight: '400',
    targetFrameId: null,
    ...overrides,
  };
}

describe('flowLayout', () => {
  it('handles an empty frame and a single element', () => {
    expect(inferFlowOrder([])).toEqual([]);
    expect(inferFlowOrder([makeEl('a', 20, 10, 80, 40)])).toEqual([{ kind: 'single', elements: [makeEl('a', 20, 10, 80, 40)] }]);
  });

  it('sorts a vertical stack by y then x', () => {
    const rows = inferFlowOrder([
      makeEl('b', 20, 120, 80, 40),
      makeEl('a', 10, 20, 80, 40),
      makeEl('c', 0, 120, 80, 40),
    ]);
    expect(rows.map(row => row.elements.map(el => el.id))).toEqual([['a'], ['c', 'b']]);
    expect(rows.map(row => row.kind)).toEqual(['single', 'row']);
  });

  it('clusters rows only when y-overlap is greater than 50 percent of the smaller height', () => {
    expect(inferFlowOrder([makeEl('a', 0, 0, 100, 100), makeEl('b', 120, 51, 100, 100)])).toHaveLength(2);
    const rows = inferFlowOrder([makeEl('a', 0, 0, 100, 100), makeEl('b', 120, 49, 100, 100)]);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('row');
  });

  it('ignores zero-size elements for ordering', () => {
    expect(inferFlowOrder([makeEl('zero', 0, 0, 0, 10), makeEl('ok', 0, 20, 10, 10)]).map(row => row.elements.map(el => el.id))).toEqual([['ok']]);
  });

  it('infers full-width, centered, ordinary, and guarded sizing', () => {
    expect(inferFlowSizing(makeEl('full', 0, 0, 960, 40), 1000)).toEqual({ widthCss: 'width:100%;max-width:1000px', marginCss: '' });
    expect(inferFlowSizing(makeEl('center', 300, 0, 400, 40), 1000)).toEqual({ widthCss: 'width:400px;max-width:100%', marginCss: 'margin-inline:auto' });
    expect(inferFlowSizing(makeEl('left', 40, 0, 300, 40), 1000)).toEqual({ widthCss: 'width:300px;max-width:100%', marginCss: '' });
    expect(inferFlowSizing(makeEl('guard', 0, 0, 300, 40), 0)).toEqual({ widthCss: 'width:300px;max-width:100%', marginCss: '' });
  });

  it('infers non-negative vertical gaps between rows', () => {
    const rows = inferFlowOrder([
      makeEl('a', 0, 0, 100, 100),
      makeEl('b', 0, 150, 100, 50),
      makeEl('c', 0, 180, 100, 50),
    ]);
    expect(inferVerticalGaps(rows)).toEqual([50, 0]);
  });

  it('detects overlapping top candidates above 30 percent of smaller area', () => {
    expect(detectOverlaps([makeEl('bottom', 0, 0, 100, 100), makeEl('top', 25, 25, 100, 100)])).toEqual([{ topElementId: 'top', overlapRatio: 0.5625 }]);
    expect(detectOverlaps([makeEl('bottom', 0, 0, 100, 100), makeEl('barely', 80, 80, 100, 100)])).toEqual([]);
    expect(detectOverlaps([makeEl('a', 0, 0, 100, 100), makeEl('b', 0, 0, 100, 100), makeEl('zero', 0, 0, 0, 0)])).toEqual([{ topElementId: 'b', overlapRatio: 1 }]);
  });
});
