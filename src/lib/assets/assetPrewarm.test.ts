import { describe, expect, it } from 'vitest';
import type { Frame, FrameElement, StudioState } from '../../types';
import { assetPrewarmKey, collectPageAwareAssetPrewarmTargets } from './assetPrewarm';

function element(id: string, extra: Partial<FrameElement> = {}): FrameElement {
  return {
    id,
    type: 'section',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    content: '',
    color: '#fff',
    background: '#111',
    borderRadius: 0,
    fontSize: 16,
    fontWeight: '400',
    targetFrameId: null,
    ...extra,
  };
}

function frame(id: string, elements: FrameElement[]): Frame {
  return {
    id,
    name: id,
    filename: `${id}.html`,
    x: 0,
    y: 0,
    width: 1280,
    height: 720,
    background: '#000',
    elements,
  };
}

function state(partial: Partial<StudioState> = {}): StudioState {
  return {
    schemaVersion: 22,
    frames: [],
    orphanElements: [],
    activeFrameId: null,
    selectedFrameIds: [],
    selectedElementId: null,
    selectedElementIds: [],
    ...partial,
  };
}

describe('assetPrewarm', () => {
  it('prewarms only active/selected frame targets plus explicitly selected orphans', () => {
    const activeAsset = element('active-image', { imageAssetId: 'a', imageAssetPath: 'u/p/a.png' });
    const inactiveAsset = element('inactive-image', { imageAssetId: 'b', imageAssetPath: 'u/p/b.png' });
    const selectedOrphan = element('orphan-image', { imageAssetId: 'c', imageAssetPath: 'u/p/c.png' });
    const ignoredOrphan = element('ignored-orphan', { imageAssetId: 'd', imageAssetPath: 'u/p/d.png' });

    const targets = collectPageAwareAssetPrewarmTargets(state({
      frames: [frame('active', [activeAsset]), frame('inactive', [inactiveAsset])],
      orphanElements: [selectedOrphan, ignoredOrphan],
      activeFrameId: 'active',
      selectedElementId: 'orphan-image',
      selectedElementIds: ['orphan-image'],
    }));

    expect(targets.map(target => target.id)).toEqual(['active-image', 'orphan-image']);
    expect(assetPrewarmKey(targets)).toBe('a:u/p/a.png|c:u/p/c.png');
  });

  it('includes a frame containing a selected nested child even when the frame is not active', () => {
    const child = element('nested-image', { imageAssetId: 'nested', imageAssetPath: 'u/p/nested.png' });
    const group = element('group', { type: 'group', children: [child] });

    const targets = collectPageAwareAssetPrewarmTargets(state({
      frames: [frame('other', [group])],
      activeFrameId: null,
      selectedElementIds: ['nested-image'],
    }));

    expect(targets).toEqual([group]);
    expect(assetPrewarmKey(targets)).toBe('nested:u/p/nested.png');
  });
});
