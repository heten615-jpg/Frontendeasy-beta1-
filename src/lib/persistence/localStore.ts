/**
 * IndexedDB-backed local store for Frontendeasy.
 *
 * Replaces localStorage as the primary substrate for project payloads:
 *  - `localStorage` is sync and capped at ~5 MiB per origin.
 *  - A Frontendeasy project with even one pasted screenshot (base64) can blow
 *    that limit.
 *  - IndexedDB is async, handles large structured data + Blobs directly, and
 *    is the right substrate for offline drafts + asset cache.
 *
 * Database: `frontendeasy_v1`
 *  - `projects` store — keyPath `id`. Indexed by `updatedAt`.
 *  - `assets`   store — keyPath `id`. Holds `{ id, blob, mime, sha256, projectId }`
 *                       so cached images survive offline.
 *  - `meta`     store — keyPath `key`. Single-row prefs: last opened project id,
 *                       migration flags, etc.
 *
 * Small things (theme, panel widths, recent colors, snapshots index) stay in
 * localStorage. Project payloads + assets live here.
 */

import type { Project } from '../../types';

const DB_NAME = 'frontendeasy_v1';
const DB_VERSION = 1;
export const STORE_PROJECTS = 'projects';
export const STORE_ASSETS = 'assets';
export const STORE_META = 'meta';

/** Single shared DB-open promise so concurrent callers don't race the open. */
let _dbPromise: Promise<IDBDatabase> | null = null;

/** Browsers without IndexedDB (very old / locked-down) — caller should detect and degrade. */
export function hasIndexedDB(): boolean {
  return typeof indexedDB !== 'undefined';
}

/**
 * Open (or create) the Frontendeasy IDB. Idempotent — caches the open promise.
 * `onupgradeneeded` builds the three stores on first run.
 */
export function openDB(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;
  if (!hasIndexedDB()) {
    return Promise.reject(new Error('IndexedDB unavailable in this environment'));
  }
  _dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('IDB open failed'));
    req.onblocked = () => reject(new Error('IDB open blocked by another tab'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        const store = db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains(STORE_ASSETS)) {
        const store = db.createObjectStore(STORE_ASSETS, { keyPath: 'id' });
        store.createIndex('projectId', 'projectId');
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // If the schema changes in another tab, close this connection so the new
      // version can take over cleanly.
      db.onversionchange = () => {
        db.close();
        _dbPromise = null;
      };
      resolve(db);
    };
  });
  // If the open itself rejects, drop the cached promise so future calls retry.
  _dbPromise.catch(() => { _dbPromise = null; });
  return _dbPromise;
}

/**
 * Wrap an IDBRequest as a Promise. Avoids the boilerplate of onsuccess/onerror
 * at every call site.
 */
function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IDB request failed'));
  });
}

/** Run `fn` inside a readwrite transaction on the given store and await completion. */
async function tx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    let result: T;
    Promise.resolve(fn(store))
      .then((r) => { result = r; })
      .catch((err) => { try { t.abort(); } catch { /* ignore */ } reject(err); });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error ?? new Error('IDB transaction failed'));
    t.onabort = () => reject(t.error ?? new Error('IDB transaction aborted'));
  });
}

// ─── Projects store ──────────────────────────────────────────────────────────

export async function putProject(project: Project): Promise<void> {
  await tx(STORE_PROJECTS, 'readwrite', (store) => wrap(store.put(project)));
}

export async function getProject(id: string): Promise<Project | null> {
  return tx(STORE_PROJECTS, 'readonly', async (store) => {
    const got = await wrap<Project | undefined>(store.get(id));
    return got ?? null;
  });
}

/** Returns all projects, sorted by updatedAt descending (most recent first). */
export async function listProjects(): Promise<Project[]> {
  return tx(STORE_PROJECTS, 'readonly', async (store) => {
    const all = await wrap<Project[]>(store.getAll());
    return all.slice().sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  });
}

export async function deleteProject(id: string): Promise<void> {
  await tx(STORE_PROJECTS, 'readwrite', (store) => wrap(store.delete(id)));
}

// ─── Meta store ──────────────────────────────────────────────────────────────

interface MetaRow<T = unknown> {
  key: string;
  value: T;
}

export async function setMeta<T>(key: string, value: T): Promise<void> {
  await tx(STORE_META, 'readwrite', (store) => wrap(store.put({ key, value } satisfies MetaRow<T>)));
}

export async function getMeta<T = unknown>(key: string): Promise<T | null> {
  return tx(STORE_META, 'readonly', async (store) => {
    const row = await wrap<MetaRow<T> | undefined>(store.get(key));
    return row ? row.value : null;
  });
}

export async function deleteMeta(key: string): Promise<void> {
  await tx(STORE_META, 'readwrite', (store) => wrap(store.delete(key)));
}

// ─── Assets store ────────────────────────────────────────────────────────────
// Item 35 will fill this in. For now the shape is reserved so the migrations
// don't have to bump the DB version a second time.

export interface AssetRecord {
  id: string;
  projectId: string;
  blob: Blob;
  mime: string;
  sha256?: string;
  width?: number;
  height?: number;
  createdAt: number;
}

export async function putAsset(asset: AssetRecord): Promise<void> {
  await tx(STORE_ASSETS, 'readwrite', (store) => wrap(store.put(asset)));
}

export async function getAsset(id: string): Promise<AssetRecord | null> {
  return tx(STORE_ASSETS, 'readonly', async (store) => {
    const got = await wrap<AssetRecord | undefined>(store.get(id));
    return got ?? null;
  });
}

export async function deleteAsset(id: string): Promise<void> {
  await tx(STORE_ASSETS, 'readwrite', (store) => wrap(store.delete(id)));
}

export async function deleteAssetsForProject(projectId: string): Promise<string[]> {
  return tx(STORE_ASSETS, 'readwrite', (store) => new Promise<string[]>((resolve, reject) => {
    const deleted: string[] = [];
    const index = store.index('projectId');
    const req = index.openCursor(IDBKeyRange.only(projectId));
    req.onerror = () => reject(req.error ?? new Error('IDB cursor failed'));
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        resolve(deleted);
        return;
      }
      const record = cursor.value as AssetRecord;
      deleted.push(record.id);
      cursor.delete();
      cursor.continue();
    };
  }));
}

export async function listAssetsForProject(projectId: string): Promise<AssetRecord[]> {
  return tx(STORE_ASSETS, 'readonly', async (store) => {
    const index = store.index('projectId');
    return wrap<AssetRecord[]>(index.getAll(projectId));
  });
}
