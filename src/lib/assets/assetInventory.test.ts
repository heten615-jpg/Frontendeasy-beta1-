import { describe, expect, it } from 'vitest';
import { buildAssetInventory } from './assetInventory';
import type { FrameElement, ProjectPayload } from '../../types';

function image(id: string, assetId: string, path: string, children?: FrameElement[]): FrameElement {
  return {
    id,
    type: 'image',
    x: 0,
    y: 0,
    width: 100,
    height: 80,
    content: '',
    color: '#fff',
    background: 'transparent',
    borderRadius: 0,
    fontSize: 16,
    fontWeight: '400',
    targetFrameId: null,
    imageAssetId: assetId,
    imageAssetPath: path,
    imageMime: 'image/png',
    children,
  };
}

describe('asset inventory', () => {
  it('indexes asset references across frames, orphans, components, variants, and snippets', () => {
    const payload: ProjectPayload = {
      schemaVersion: 16,
      frames: [{
        id: 'home',
        name: 'Home',
        filename: 'index.html',
        x: 0,
        y: 0,
        width: 800,
        height: 600,
        background: '#fff',
        elements: [
          image('hero', 'asset-a', 'u/p/asset-a.png'),
          {
            id: 'group',
            type: 'group',
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
            children: [image('nested', 'asset-b', 'u/p/asset-b.png')],
          },
        ],
      }],
      orphanElements: [image('loose', 'asset-a', 'u/p/asset-a.png')],
      componentMasters: [{
        id: 'button',
        name: 'Button',
        root: image('master-root', 'asset-c', 'u/p/asset-c.png'),
        variants: [{
          id: 'hover',
          name: 'Hover',
          root: image('variant-root', 'asset-a', 'u/p/asset-a.png'),
          createdAt: 1,
          updatedAt: 1,
        }],
        thumbnailAssetId: 'asset-thumb',
        createdAt: 1,
        updatedAt: 1,
      }],
      snippets: [{
        id: 'snippet',
        name: 'Snippet',
        roots: [image('snippet-root', 'asset-b', 'u/p/asset-b.png')],
        thumbnailAssetId: 'asset-snippet-thumb',
        createdAt: 1,
        updatedAt: 1,
      }],
    };

    const inventory = buildAssetInventory(payload, {
      knownAssets: [
        { assetId: 'asset-a', path: 'u/p/asset-a.png', mime: 'image/png' },
        { assetId: 'asset-unused', path: 'u/p/asset-unused.png', mime: 'image/png' },
      ],
    });

    const byId = new Map(inventory.map(entry => [entry.assetId, entry]));
    expect(byId.get('asset-a')?.referenceCount).toBe(3);
    expect(byId.get('asset-a')?.references.map(ref => ref.scope).sort()).toEqual(['component-variant', 'frame', 'orphan']);
    expect(byId.get('asset-b')?.referenceCount).toBe(2);
    expect(byId.get('asset-c')?.references[0]).toMatchObject({ scope: 'component-master', property: 'image' });
    expect(byId.get('asset-thumb')?.references[0]).toMatchObject({ scope: 'component-thumbnail', property: 'thumbnail' });
    expect(byId.get('asset-snippet-thumb')?.references[0]).toMatchObject({ scope: 'snippet-thumbnail', property: 'thumbnail' });
    expect(byId.get('asset-unused')).toMatchObject({ referenceCount: 0, references: [] });
    expect(byId.get('asset-b')?.references[0].elementPath.length).toBeGreaterThan(0);
  });

  it('accepts future element reference extractors', () => {
    const element = image('hero', 'asset-a', 'u/p/asset-a.png');
    const inventory = buildAssetInventory({
      schemaVersion: 16,
      frames: [{
        id: 'home',
        name: 'Home',
        filename: 'index.html',
        x: 0,
        y: 0,
        width: 800,
        height: 600,
        background: '#fff',
        elements: [element],
      }],
      orphanElements: [],
    }, {
      extraElementReferences: (candidate) => candidate.id === 'hero'
        ? [{ assetId: 'mask-asset', path: 'u/p/mask.png', property: 'future-media' }]
        : [],
    });

    expect(inventory.find(entry => entry.assetId === 'mask-asset')?.references[0]).toMatchObject({
      property: 'future-media',
      elementId: 'hero',
      scope: 'frame',
    });
  });

  it('indexes explicit media-fill asset references on shapes', () => {
    const inventory = buildAssetInventory({
      schemaVersion: 17,
      frames: [{
        id: 'home',
        name: 'Home',
        filename: 'index.html',
        x: 0,
        y: 0,
        width: 800,
        height: 600,
        background: '#fff',
        elements: [{
          id: 'media-rect',
          type: 'section',
          x: 0,
          y: 0,
          width: 320,
          height: 180,
          content: '',
          color: '#fff',
          background: 'transparent',
          borderRadius: 0,
          fontSize: 16,
          fontWeight: '400',
          targetFrameId: null,
          mediaFill: {
            kind: 'raster',
            assetId: 'asset-fill',
            assetPath: 'u/p/fill.png',
            mime: 'image/png',
          },
        }],
      }],
      orphanElements: [],
    });

    expect(inventory.find(entry => entry.assetId === 'asset-fill')?.references[0]).toMatchObject({
      property: 'media-fill',
      elementId: 'media-rect',
      elementType: 'section',
      scope: 'frame',
    });
  });
});
