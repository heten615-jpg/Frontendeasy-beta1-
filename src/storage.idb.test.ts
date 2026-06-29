import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from './types';

const CURRENT_SCHEMA_VERSION = 23;
const PROJECT_KEY = 'frontendeasy_project_v1';
const MIGRATION_FLAG_KEY = 'frontendeasy_idb_migration_v1';
const MIGRATION_META_KEY = 'lsToIdbMigrationMeta';

class MemoryStorage implements Storage {
  private readonly entries = new Map<string, string>();

  get length(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.entries.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, String(value));
  }
}

function makeProject(id: string): Project {
  return {
    id,
    title: 'Migrated Project',
    payload: {
      schemaVersion: 8,
      fontFamily: 'Inter',
      frames: [],
      orphanElements: [],
    },
    lastClientRev: 2,
    createdAt: 100,
    updatedAt: 200,
    lastOpenedAt: 200,
    ownerUserId: null,
    thumbnailAssetId: null,
  };
}

describe('localStorage to IndexedDB migration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock('./lib/persistence/localStore');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: new MemoryStorage(),
    });
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      writable: true,
      value: new IDBFactory(),
    });
  });

  afterEach(() => {
    vi.doUnmock('./lib/persistence/localStore');
  });

  it('imports the stored project and seals migration only after successful writes', async () => {
    const source = makeProject('local-project');
    localStorage.setItem(PROJECT_KEY, JSON.stringify(source));
    const store = await import('./lib/persistence/localStore');
    const { loadProjectAsync } = await import('./storage');

    const loaded = await loadProjectAsync();

    expect(loaded.project.id).toBe(source.id);
    expect(loaded.project.payload.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(loaded.project.payload.componentMasters).toEqual([]);
    expect(loaded.project.payload.snippets).toEqual([]);
    expect(loaded.project.payload.appearancePresets?.map(preset => preset.id)).toEqual([
      'card',
      'cta',
      'subtle-border',
    ]);
    expect(loaded.project.payload.exportSettings).toMatchObject({
      minifyHtml: false,
      includeInspectorMetadata: false,
      darkMode: { enabled: false, palette: {} },
      pwa: { enabled: false, iconAssetId: null },
      defaultFaviconAssetId: null,
    });
    expect(loaded.project.payload.comments).toEqual([]);
    expect(loaded.project.payload.reviewOverlays).toEqual([]);
    expect(loaded.project.payload.guides).toEqual([]);
    expect(loaded.project.payload.projectStyles?.map(style => style.kind)).toEqual(['text', 'color', 'effect', 'layout-guide']);
    expect(loaded.project.payload.variableCollections?.[0].variables[0]).toMatchObject({ id: 'var-color-brand' });
    expect(await store.getProject(source.id)).toMatchObject({ id: source.id, title: source.title });
    expect(await store.getMeta('lastProjectId')).toBe(source.id);
    expect(await store.getMeta(MIGRATION_META_KEY)).toMatchObject({
      attempts: 1,
      status: 'success',
    });
    expect(localStorage.getItem(MIGRATION_FLAG_KEY)).toBe('1');
  });

  it('does not seal a failed import and retries successfully on the next load', async () => {
    const source = makeProject('retry-project');
    localStorage.setItem(PROJECT_KEY, JSON.stringify(source));
    vi.doMock('./lib/persistence/localStore', async () => {
      const actual = await vi.importActual<typeof import('./lib/persistence/localStore')>(
        './lib/persistence/localStore',
      );
      return {
        ...actual,
        putProject: vi.fn(actual.putProject).mockRejectedValueOnce(new Error('simulated IDB write failure')),
      };
    });
    const store = await import('./lib/persistence/localStore');
    const { loadProjectAsync } = await import('./storage');

    const firstLoad = await loadProjectAsync();

    expect(firstLoad.project.id).not.toBe(source.id);
    expect(localStorage.getItem(MIGRATION_FLAG_KEY)).toBeNull();
    expect(await store.getMeta(MIGRATION_META_KEY)).toMatchObject({
      attempts: 1,
      status: 'failed',
      error: 'simulated IDB write failure',
    });

    const retriedLoad = await loadProjectAsync();

    expect(retriedLoad.project.id).toBe(source.id);
    expect(retriedLoad.project.payload.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(retriedLoad.project.payload.componentMasters).toEqual([]);
    expect(retriedLoad.project.payload.snippets).toEqual([]);
    expect(retriedLoad.project.payload.appearancePresets?.map(preset => preset.id)).toEqual([
      'card',
      'cta',
      'subtle-border',
    ]);
    expect(retriedLoad.project.payload.exportSettings?.minifyHtml).toBe(false);
    expect(retriedLoad.project.payload.comments).toEqual([]);
    expect(retriedLoad.project.payload.reviewOverlays).toEqual([]);
    expect(retriedLoad.project.payload.guides).toEqual([]);
    expect(retriedLoad.project.payload.projectStyles?.map(style => style.kind)).toEqual(['text', 'color', 'effect', 'layout-guide']);
    expect(retriedLoad.project.payload.variableCollections?.[0].variables[0]).toMatchObject({ id: 'var-color-brand' });
    expect(localStorage.getItem(MIGRATION_FLAG_KEY)).toBe('1');
    expect(await store.getProject(source.id)).toMatchObject({ id: source.id });
    expect(await store.getMeta(MIGRATION_META_KEY)).toMatchObject({
      attempts: 2,
      status: 'success',
    });
  });

  it('upgrades an existing IndexedDB v8 payload when opening it', async () => {
    localStorage.setItem(MIGRATION_FLAG_KEY, '1');
    const store = await import('./lib/persistence/localStore');
    const source = makeProject('idb-project');
    await store.putProject(source);
    await store.setMeta('lastProjectId', source.id);
    const { loadProjectAsync } = await import('./storage');

    const loaded = await loadProjectAsync();

    expect(loaded.project.id).toBe(source.id);
    expect(loaded.project.payload.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(loaded.project.payload.componentMasters).toEqual([]);
    expect(loaded.project.payload.snippets).toEqual([]);
    expect(loaded.project.payload.appearancePresets?.map(preset => preset.id)).toEqual([
      'card',
      'cta',
      'subtle-border',
    ]);
    expect(loaded.state.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(loaded.state.componentMasters).toEqual([]);
    expect(loaded.state.snippets).toEqual([]);
    expect(loaded.state.appearancePresets?.map(preset => preset.id)).toEqual([
      'card',
      'cta',
      'subtle-border',
    ]);
    expect(loaded.state.exportSettings?.pwa.enabled).toBe(false);
    expect(loaded.state.comments).toEqual([]);
    expect(loaded.state.reviewOverlays).toEqual([]);
    expect(loaded.state.guides).toEqual([]);
    expect(loaded.state.projectStyles?.map(style => style.kind)).toEqual(['text', 'color', 'effect', 'layout-guide']);
    expect(loaded.state.variableCollections?.[0].variables[0]).toMatchObject({ id: 'var-color-brand' });
  });
});
