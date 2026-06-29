import { describe, expect, it } from 'vitest';
import type { Frame, FrameElement, StudioState } from '../../types';
import { derivePrimarySelection } from './primarySelection';
import { findElementInTree, removeElementsByIds, replaceElementById, updateElementsByIds } from './elementTree';
import { elementContextRef, isOrphanElementContext, selectedPrimaryElementContext } from './elementContext';
import { normalizeSelectionState, selectionWithoutElementIdsState } from './selectionController';

function element(id: string, x = 0, y = 0, children?: FrameElement[]): FrameElement {
  return {
    id,
    type: children ? 'group' : 'text',
    targetFrameId: null,
    x,
    y,
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

function frame(id: string, elements: FrameElement[] = []): Frame {
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
    frames: [frame('home', [element('frame-child')])],
    orphanElements: [
      element('loose-group', 300, 200, [
        element('loose-child', 12, 18),
        element('loose-sibling', 80, 24),
      ]),
    ],
    activeFrameId: 'home',
    selectedFrameIds: [],
    selectedElementId: null,
    selectedElementIds: [],
    ...overrides,
  };
}

describe('orphan nested editing behavior', () => {
  it('updates a nested loose child without moving the loose parent or siblings', () => {
    const current = state();
    const updatedOrphans = updateElementsByIds(
      current.orphanElements,
      new Set(['loose-child']),
      child => ({ ...child, x: 24, y: 30, content: 'edited child' }),
    );

    const group = findElementInTree(updatedOrphans, 'loose-group');
    const child = findElementInTree(updatedOrphans, 'loose-child');
    const sibling = findElementInTree(updatedOrphans, 'loose-sibling');

    expect(group).toMatchObject({ x: 300, y: 200 });
    expect(child).toMatchObject({ x: 24, y: 30, content: 'edited child' });
    expect(sibling).toMatchObject({ x: 80, y: 24 });
    expect(findElementInTree(current.orphanElements, 'loose-child')).toMatchObject({ x: 12, y: 18, content: 'loose-child' });
  });

  it('replaces a nested loose child while preserving the parent tree shape', () => {
    const current = state();
    const replaced = replaceElementById(
      current.orphanElements,
      'loose-child',
      child => ({ ...child, id: 'replacement-child', content: 'replacement' }),
    );

    expect(findElementInTree(replaced, 'loose-child')).toBeNull();
    expect(findElementInTree(replaced, 'replacement-child')).toMatchObject({ x: 12, y: 18, content: 'replacement' });
    expect(findElementInTree(replaced, 'loose-group')?.children?.map(child => child.id)).toEqual(['replacement-child', 'loose-sibling']);
  });

  it('deletes a nested loose child and cleans selection without dropping sibling selections', () => {
    const current = state({
      selectedElementId: 'loose-child',
      selectedElementIds: ['loose-child', 'loose-sibling'],
    });

    const orphanElements = removeElementsByIds(current.orphanElements, new Set(['loose-child']));
    const selectionPatch = selectionWithoutElementIdsState({ ...current, orphanElements }, new Set(['loose-child']));
    const cleaned = { ...current, orphanElements, ...selectionPatch };

    expect(findElementInTree(cleaned.orphanElements, 'loose-child')).toBeNull();
    expect(findElementInTree(cleaned.orphanElements, 'loose-sibling')).not.toBeNull();
    expect(cleaned.selectedElementId).toBe('loose-sibling');
    expect(cleaned.selectedElementIds).toEqual(['loose-sibling']);
  });

  it('resolves selected nested loose children as orphan contexts and primary candidates', () => {
    const current = normalizeSelectionState(state({
      selectedElementId: 'loose-child',
      selectedElementIds: ['loose-child'],
    }));

    const context = selectedPrimaryElementContext(current);
    expect(isOrphanElementContext(context)).toBe(true);
    expect(context?.element.id).toBe('loose-child');
    expect(context ? elementContextRef(context) : null).toEqual({ id: 'loose-child', frameId: null });
    expect(derivePrimarySelection(current)).toMatchObject({ kind: 'element', id: 'loose-child', frameId: null });
  });
});
