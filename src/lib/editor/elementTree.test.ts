import { describe, expect, it } from 'vitest';
import type { FrameElement } from '../../types';
import {
  containsElementId,
  findElementInTree,
  removeElementsByIds,
  replaceElementById,
  updateElementsByIds,
} from './elementTree';

function element(id: string, children?: FrameElement[]): FrameElement {
  return {
    id,
    type: children ? 'group' : 'text',
    targetFrameId: '',
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

describe('elementTree', () => {
  it('finds and updates deeply nested elements', () => {
    const tree = [element('root', [element('branch', [element('leaf')])])];

    expect(findElementInTree(tree, 'leaf')?.content).toBe('leaf');
    expect(containsElementId(tree, 'branch')).toBe(true);

    const updated = updateElementsByIds(tree, new Set(['leaf']), item => ({ ...item, name: 'renamed leaf' }));

    expect(findElementInTree(updated, 'leaf')?.name).toBe('renamed leaf');
    expect(findElementInTree(tree, 'leaf')?.name).toBeUndefined();
  });

  it('removes and replaces deeply nested elements without flattening ancestors', () => {
    const tree = [element('root', [element('branch', [element('leaf'), element('sibling')])])];

    const replaced = replaceElementById(tree, 'leaf', current => ({ ...current, id: 'replacement', content: 'new' }));
    expect(findElementInTree(replaced, 'leaf')).toBeNull();
    expect(findElementInTree(replaced, 'replacement')?.content).toBe('new');
    expect(findElementInTree(replaced, 'sibling')).not.toBeNull();

    const removed = removeElementsByIds(replaced, new Set(['replacement']));
    expect(findElementInTree(removed, 'replacement')).toBeNull();
    expect(findElementInTree(removed, 'branch')?.children?.map(child => child.id)).toEqual(['sibling']);
  });

  it('preserves tree references for no-op recursive mutations', () => {
    const tree = [element('root', [element('branch', [element('leaf')])])];
    const leaf = findElementInTree(tree, 'leaf');

    expect(updateElementsByIds(tree, new Set(), item => ({ ...item, name: 'unused' }))).toBe(tree);
    expect(updateElementsByIds(tree, new Set(['missing']), item => ({ ...item, name: 'unused' }))).toBe(tree);
    expect(updateElementsByIds(tree, new Set(['leaf']), item => item)).toBe(tree);
    expect(removeElementsByIds(tree, new Set())).toBe(tree);
    expect(removeElementsByIds(tree, new Set(['missing']))).toBe(tree);
    expect(replaceElementById(tree, 'missing', element('unused'))).toBe(tree);
    expect(replaceElementById(tree, 'leaf', item => item)).toBe(tree);
    expect(leaf).toBe(findElementInTree(tree, 'leaf'));
  });
});
