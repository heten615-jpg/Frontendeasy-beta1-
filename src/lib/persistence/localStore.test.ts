import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../../types';

function makeProject(id: string, updatedAt: number): Project {
  return {
    id,
    title: id,
    payload: {
      schemaVersion: 8,
      fontFamily: 'Inter',
      frames: [],
      orphanElements: [],
    },
    lastClientRev: 0,
    createdAt: updatedAt,
    updatedAt,
    lastOpenedAt: updatedAt,
    ownerUserId: null,
    thumbnailAssetId: null,
  };
}

describe('IndexedDB local store', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      writable: true,
      value: new IDBFactory(),
    });
    Object.defineProperty(globalThis, 'IDBKeyRange', {
      configurable: true,
      writable: true,
      value: IDBKeyRange,
    });
  });

  it('stores, lists newest-first, retrieves, and deletes projects', async () => {
    const store = await import('./localStore');
    const older = makeProject('older', 100);
    const newer = makeProject('newer', 300);
    const middle = makeProject('middle', 200);

    await store.putProject(older);
    await store.putProject(newer);
    await store.putProject(middle);

    expect(await store.getProject('middle')).toEqual(middle);
    expect((await store.listProjects()).map((project) => project.id)).toEqual([
      'newer',
      'middle',
      'older',
    ]);

    await store.deleteProject('middle');
    expect(await store.getProject('middle')).toBeNull();
    expect((await store.listProjects()).map((project) => project.id)).toEqual(['newer', 'older']);
  });

  it('sets, reads, replaces, and deletes meta values', async () => {
    const store = await import('./localStore');

    await store.setMeta('lastProjectId', 'first');
    expect(await store.getMeta('lastProjectId')).toBe('first');

    await store.setMeta('lastProjectId', 'second');
    expect(await store.getMeta('lastProjectId')).toBe('second');

    await store.deleteMeta('lastProjectId');
    expect(await store.getMeta('lastProjectId')).toBeNull();
  });

  it('deletes all cached assets for a project and leaves other projects intact', async () => {
    const store = await import('./localStore');
    const blob = new Blob(['x'], { type: 'text/plain' });

    await store.putAsset({ id: 'a1', projectId: 'p1', blob, mime: 'text/plain', createdAt: 1 });
    await store.putAsset({ id: 'a2', projectId: 'p1', blob, mime: 'text/plain', createdAt: 2 });
    await store.putAsset({ id: 'b1', projectId: 'p2', blob, mime: 'text/plain', createdAt: 3 });

    expect((await store.deleteAssetsForProject('p1')).sort()).toEqual(['a1', 'a2']);
    expect(await store.listAssetsForProject('p1')).toEqual([]);
    expect((await store.listAssetsForProject('p2')).map(asset => asset.id)).toEqual(['b1']);
  });
});
