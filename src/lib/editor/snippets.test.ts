import { describe, expect, it } from 'vitest';
import type { Frame, FrameElement, ProjectSnippet } from '../../types';
import { createProjectSnippet, instantiateSnippet, nextSnippetName } from './snippets';

function element(overrides: Partial<FrameElement> = {}): FrameElement {
  return {
    id: 'el',
    type: 'section',
    x: 20,
    y: 30,
    width: 100,
    height: 60,
    xCss: '50%',
    yCss: '2rem',
    content: '',
    color: '#fff',
    background: '#111',
    borderRadius: 8,
    fontSize: 16,
    fontWeight: '400',
    targetFrameId: null,
    filename: 'loose.html',
    ...overrides,
  };
}

function ids(): () => string {
  let index = 0;
  return () => `id-${++index}`;
}

describe('snippet helpers', () => {
  it('normalizes selected roots into local coordinates and strips runtime fields', () => {
    const snippet = createProjectSnippet({
      source: {
        type: 'elements',
        elements: [
          element({
            id: 'a',
            name: 'Card',
            x: 40,
            y: 50,
            componentInstance: { masterId: 'master', variantId: 'hover' },
            children: [element({ id: 'child', x: 8, y: 9, filename: 'child.html' })],
          }),
          element({ id: 'b', x: 120, y: 90 }),
        ],
      },
      makeId: ids(),
      now: 1000,
    });

    expect(snippet).toMatchObject({
      id: 'id-4',
      name: '2 layers snippet',
      createdAt: 1000,
      updatedAt: 1000,
      thumbnailAssetId: null,
    });
    expect(snippet!.roots.map(root => ({ id: root.id, x: root.x, y: root.y }))).toEqual([
      { id: 'id-1', x: 0, y: 0 },
      { id: 'id-3', x: 80, y: 40 },
    ]);
    expect(snippet!.roots[0]).not.toHaveProperty('filename');
    expect(snippet!.roots[0]).not.toHaveProperty('componentInstance');
    expect(snippet!.roots[0].xCss).toBeUndefined();
    expect(snippet!.roots[0].children?.[0]).not.toHaveProperty('filename');
  });

  it('captures a selected frame as reusable static roots', () => {
    const frame: Frame = {
      id: 'frame',
      name: 'Home',
      filename: 'index.html',
      x: 80,
      y: 80,
      width: 1280,
      height: 720,
      background: '#0f0f14',
      elements: [element({ id: 'hero', x: 100, y: 120 })],
    };

    const snippet = createProjectSnippet({
      source: { type: 'frame', frame },
      makeId: ids(),
      now: 1000,
    });

    expect(snippet!.name).toBe('Home snippet');
    expect(snippet!.roots).toHaveLength(1);
    expect(snippet!.roots[0]).toMatchObject({ id: 'id-1', x: 100, y: 120 });
  });

  it('suffixes duplicate snippet names predictably', () => {
    const existing: ProjectSnippet[] = [
      { id: 'a', name: 'Hero snippet', roots: [], createdAt: 1, updatedAt: 1 },
      { id: 'b', name: 'Hero snippet 2', roots: [], createdAt: 1, updatedAt: 1 },
    ];
    expect(nextSnippetName('Hero snippet', existing)).toBe('Hero snippet 3');
  });

  it('instantiates snippets with fresh ids and target offsets', () => {
    const makeId = ids();
    const snippet = createProjectSnippet({
      source: { type: 'elements', elements: [element({ id: 'source', name: 'Hero', x: 100, y: 120 })] },
      makeId,
      now: 1000,
    })!;

    const inserted = instantiateSnippet({ snippet, makeId, x: 48, y: 64 });

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ id: 'id-3', x: 48, y: 64, type: 'section' });
    expect(inserted[0].id).not.toBe(snippet.roots[0].id);
  });

  it('returns null for an empty element selection', () => {
    expect(createProjectSnippet({
      source: { type: 'elements', elements: [] },
      makeId: ids(),
    })).toBeNull();
  });
});
