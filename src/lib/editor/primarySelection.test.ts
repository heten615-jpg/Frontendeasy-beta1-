import { describe, expect, it } from 'vitest';
import type { Frame, FrameElement, StudioState } from '../../types';
import {
  cyclePrimarySelection,
  derivePrimarySelection,
  getPrimarySelectionCandidates,
  primarySelectionPatchFor,
} from './primarySelection';

function element(id: string, children?: FrameElement[]): FrameElement {
  return {
    id,
    type: 'section',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    content: '',
    color: '#fff',
    background: 'transparent',
    borderRadius: 0,
    fontSize: 16,
    fontWeight: '400',
    targetFrameId: null,
    children,
  };
}

function frame(id: string, elements: FrameElement[]): Frame {
  return {
    id,
    name: id,
    filename: `${id}.html`,
    x: 0,
    y: 0,
    width: 800,
    height: 600,
    background: '#000',
    elements,
  };
}

function state(patch: Partial<StudioState>): StudioState {
  return {
    schemaVersion: 16,
    frames: [
      frame('home', [element('hero'), element('group', [element('child')])]),
      frame('about', [element('cta')]),
    ],
    orphanElements: [element('loose', [element('loose-child')])],
    activeFrameId: 'home',
    selectedFrameIds: [],
    selectedElementId: null,
    selectedElementIds: [],
    ...patch,
  };
}

describe('primary selection model', () => {
  it('derives a single selected framed element as primary', () => {
    const primary = derivePrimarySelection(state({ selectedElementId: 'hero', selectedElementIds: ['hero'] }));
    expect(primary).toMatchObject({ kind: 'element', id: 'hero', frameId: 'home', index: 0, candidateCount: 1 });
  });

  it('keeps explicit selectedElementId as primary in multi-selection', () => {
    const primary = derivePrimarySelection(state({
      selectedElementId: 'cta',
      selectedElementIds: ['hero', 'cta'],
    }));
    expect(primary).toMatchObject({ kind: 'element', id: 'cta', frameId: 'about', index: 1, candidateCount: 2 });
  });

  it('ignores stale ids and includes nested and loose elements', () => {
    const candidates = getPrimarySelectionCandidates(state({
      selectedElementId: 'missing',
      selectedElementIds: ['missing', 'child', 'loose-child'],
    }));
    expect(candidates).toEqual([
      { kind: 'element', id: 'child', frameId: 'home' },
      { kind: 'element', id: 'loose-child', frameId: null },
    ]);
    expect(derivePrimarySelection(state({ selectedElementIds: ['missing', 'loose'] }))).toMatchObject({
      kind: 'element',
      id: 'loose',
      frameId: null,
    });
  });

  it('falls back to selected frames when no selected element is valid', () => {
    const primary = derivePrimarySelection(state({
      selectedFrameIds: ['about', 'missing'],
      selectedElementIds: ['missing'],
    }));
    expect(primary).toMatchObject({ kind: 'frame', id: 'about', frameId: 'about', candidateCount: 1 });
    expect(primary && primarySelectionPatchFor(primary)).toEqual({ activeFrameId: 'about', selectedElementId: null });
  });

  it('cycles primary selection forward and backward without changing the selected set', () => {
    const current = state({
      selectedElementId: 'hero',
      selectedElementIds: ['hero', 'cta'],
      selectedFrameIds: ['about'],
    });

    expect(cyclePrimarySelection(current, 1)).toEqual({ activeFrameId: 'about', selectedElementId: 'cta' });
    expect(cyclePrimarySelection({ ...current, selectedElementId: 'cta', activeFrameId: 'about' }, 1)).toEqual({
      activeFrameId: 'about',
      selectedElementId: null,
    });
    expect(cyclePrimarySelection(current, -1)).toEqual({ activeFrameId: 'about', selectedElementId: null });
  });

  it('does not cycle when there is fewer than two valid candidates', () => {
    expect(cyclePrimarySelection(state({ selectedElementIds: ['hero'], selectedElementId: 'hero' }), 1)).toBeNull();
    expect(cyclePrimarySelection(state({ selectedElementIds: ['missing'] }), 1)).toBeNull();
  });
});
