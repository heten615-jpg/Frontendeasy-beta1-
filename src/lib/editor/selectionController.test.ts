import { describe, expect, it } from 'vitest';
import type { Frame, FrameElement, StudioState } from '../../types';
import {
  normalizeSelectionState,
  selectionWithoutElementIdsState,
  selectionWithoutFrameIdsState,
  selectElementState,
  selectElementsState,
  selectFrameState,
  selectOrphanState,
} from './selectionController';

function element(id: string, children?: FrameElement[]): FrameElement {
  return {
    id,
    type: children ? 'group' : 'text',
    targetFrameId: null,
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    content: id,
    color: '#fff',
    background: 'transparent',
    borderRadius: 0,
    fontSize: 16,
    fontWeight: '400',
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
    background: '#fff',
    elements,
  };
}

function state(overrides: Partial<StudioState> = {}): StudioState {
  return {
    schemaVersion: 22,
    frames: [
      frame('home', [element('hero', [element('cta')])]),
      frame('about', [element('about-copy')]),
    ],
    orphanElements: [element('loose', [element('loose-child')])],
    activeFrameId: 'home',
    selectedFrameIds: [],
    selectedElementId: null,
    selectedElementIds: [],
    ...overrides,
  };
}

describe('selectionController', () => {
  it('normalizes stale frame and element ids while keeping nested and orphan selections', () => {
    const normalized = normalizeSelectionState(state({
      activeFrameId: 'missing-frame',
      selectedFrameIds: ['missing-frame', 'about'],
      selectedElementId: 'missing-element',
      selectedElementIds: ['missing-element', 'cta', 'loose-child', 'cta'],
    }));

    expect(normalized.activeFrameId).toBe('about');
    expect(normalized.selectedFrameIds).toEqual(['about']);
    expect(normalized.selectedElementId).toBeNull();
    expect(normalized.selectedElementIds).toEqual(['cta', 'loose-child']);
  });

  it('normalizes select helpers through the same stale-id cleanup path', () => {
    const base = state();

    expect(selectFrameState(base, 'missing')).toMatchObject({
      activeFrameId: null,
      selectedFrameIds: [],
      selectedElementIds: [],
    });
    expect(selectElementState(base, 'loose-child')).toMatchObject({
      activeFrameId: null,
      selectedElementId: 'loose-child',
      selectedElementIds: ['loose-child'],
    });
    expect(selectElementsState(base, 'home', ['cta', 'missing'])).toMatchObject({
      activeFrameId: 'home',
      selectedElementId: 'cta',
      selectedElementIds: ['cta'],
    });
    expect(selectOrphanState(base, 'loose')).toMatchObject({
      activeFrameId: null,
      selectedElementId: 'loose',
      selectedElementIds: ['loose'],
    });
  });

  it('builds cleanup patches for deleted elements and frames', () => {
    const selected = state({
      selectedFrameIds: ['home', 'about'],
      selectedElementId: 'cta',
      selectedElementIds: ['cta', 'loose-child'],
    });

    expect(selectionWithoutElementIdsState(selected, new Set(['cta']))).toMatchObject({
      activeFrameId: 'home',
      selectedFrameIds: ['home', 'about'],
      selectedElementId: 'loose-child',
      selectedElementIds: ['loose-child'],
    });

    const withoutHome = { ...selected, frames: selected.frames.filter(item => item.id !== 'home') };
    expect(selectionWithoutFrameIdsState(withoutHome, new Set(['home']))).toMatchObject({
      activeFrameId: 'about',
      selectedFrameIds: ['about'],
      selectedElementId: 'loose-child',
      selectedElementIds: ['loose-child'],
    });
  });
});
